import { supabaseAdmin } from '../config/supabase.js';
import { metaFetch, metaPost } from './metaService.js';
import { META_ACCESS_TOKEN } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import crypto from 'crypto';

const BUCKET = 'social-content';

// ═══════════════════════════════════════════
// Page Connections
// ═══════════════════════════════════════════

export async function discoverPages(clientId, orgId) {
  if (!META_ACCESS_TOKEN) throw new ApiError(500, 'Meta access token not configured');

  // Get FB pages the system token has access to
  const data = await metaFetch('/me/accounts', {
    fields: 'id,name,access_token,instagram_business_account{id,name,username,profile_picture_url}',
    limit: '100',
  });

  const pages = (data.data || []).map(page => ({
    page_id: page.id,
    page_name: page.name,
    page_access_token: page.access_token,
    ig_business_account: page.instagram_business_account || null,
  }));

  // Check which are already connected for this client
  const { data: existing } = await supabaseAdmin
    .from('page_connections')
    .select('page_id, platform')
    .eq('client_id', clientId)
    .eq('org_id', orgId);

  const connectedSet = new Set((existing || []).map(e => `${e.platform}:${e.page_id}`));

  return pages.map(p => ({
    ...p,
    fb_connected: connectedSet.has(`facebook:${p.page_id}`),
    ig_connected: p.ig_business_account
      ? connectedSet.has(`instagram:${p.ig_business_account.id}`)
      : false,
  }));
}

export async function connectPage(orgId, { clientId, platform, pageId, pageName, pageAccessToken, igBusinessAccountId }) {
  const row = {
    org_id: orgId,
    client_id: clientId,
    platform,
    page_id: pageId,
    page_name: pageName,
    page_access_token: pageAccessToken,
    ig_business_account_id: igBusinessAccountId || null,
  };

  const { data, error } = await supabaseAdmin
    .from('page_connections')
    .upsert(row, { onConflict: 'client_id,platform,page_id' })
    .select()
    .single();

  if (error) throw new ApiError(500, `Failed to connect page: ${error.message}`);
  return data;
}

export async function getConnectedPages(orgId, clientId) {
  const { data, error } = await supabaseAdmin
    .from('page_connections')
    .select('*')
    .eq('org_id', orgId)
    .eq('client_id', clientId)
    .order('connected_at', { ascending: false });

  if (error) throw new ApiError(500, error.message);
  return data || [];
}

export async function disconnectPage(orgId, connectionId) {
  const { error } = await supabaseAdmin
    .from('page_connections')
    .delete()
    .eq('id', connectionId)
    .eq('org_id', orgId);

  if (error) throw new ApiError(500, error.message);
  return { deleted: true };
}

// ═══════════════════════════════════════════
// Posts CRUD
// ═══════════════════════════════════════════

export async function createPost(orgId, userId, postData) {
  const { client_id, caption, platforms, media_urls, media_storage_paths, scheduled_at } = postData;

  const status = scheduled_at ? 'scheduled' : 'draft';

  const { data, error } = await supabaseAdmin
    .from('social_posts')
    .insert({
      org_id: orgId,
      client_id,
      created_by: userId,
      caption,
      platforms: platforms || [],
      media_urls: media_urls || [],
      media_storage_paths: media_storage_paths || [],
      status,
      scheduled_at: scheduled_at || null,
    })
    .select()
    .single();

  if (error) throw new ApiError(500, `Failed to create post: ${error.message}`);
  return data;
}

export async function listPosts(orgId, { clientId, status, startDate, endDate, limit = 50, offset = 0 } = {}) {
  let query = supabaseAdmin
    .from('social_posts')
    .select('*, clients!inner(name, logo_url)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (clientId) query = query.eq('client_id', clientId);
  if (status) query = query.eq('status', status);
  if (startDate) query = query.gte('scheduled_at', startDate);
  if (endDate) query = query.lte('scheduled_at', endDate);

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);
  return data || [];
}

export async function getPost(orgId, postId) {
  const { data, error } = await supabaseAdmin
    .from('social_posts')
    .select('*, clients!inner(name, logo_url)')
    .eq('id', postId)
    .eq('org_id', orgId)
    .single();

  if (error) throw new ApiError(404, 'Post not found');
  return data;
}

export async function updatePost(orgId, postId, updates) {
  const allowed = ['caption', 'platforms', 'media_urls', 'media_storage_paths', 'scheduled_at', 'status'];
  const filtered = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) filtered[key] = updates[key];
  }

  // If setting scheduled_at on a draft, auto-update status
  if (filtered.scheduled_at && !filtered.status) {
    const existing = await getPost(orgId, postId);
    if (existing.status === 'draft') filtered.status = 'scheduled';
  }

  const { data, error } = await supabaseAdmin
    .from('social_posts')
    .update(filtered)
    .eq('id', postId)
    .eq('org_id', orgId)
    .select()
    .single();

  if (error) throw new ApiError(500, `Failed to update post: ${error.message}`);
  return data;
}

export async function deletePost(orgId, postId) {
  // Get post to clean up media
  const post = await getPost(orgId, postId);

  // Delete media from storage
  if (post.media_storage_paths?.length > 0) {
    await supabaseAdmin.storage.from(BUCKET).remove(post.media_storage_paths);
  }

  const { error } = await supabaseAdmin
    .from('social_posts')
    .delete()
    .eq('id', postId)
    .eq('org_id', orgId);

  if (error) throw new ApiError(500, error.message);
  return { deleted: true };
}

// ═══════════════════════════════════════════
// Media Upload
// ═══════════════════════════════════════════

export async function uploadMedia(orgId, clientId, fileBuffer, fileName, fileSize) {
  if (fileSize > 50 * 1024 * 1024) throw new ApiError(400, 'File too large (max 50MB)');

  const ext = (fileName.split('.').pop() || 'jpg').toLowerCase();
  const storagePath = `${orgId}/${clientId}/${crypto.randomUUID()}.${ext}`;

  const contentType = getContentType(ext);

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, { contentType, upsert: false });

  if (uploadErr) throw new ApiError(500, `Upload failed: ${uploadErr.message}`);

  const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);

  return {
    url: urlData.publicUrl,
    storage_path: storagePath,
    file_name: fileName,
    content_type: contentType,
  };
}

export async function deleteMedia(orgId, storagePath) {
  // Verify the path belongs to this org
  if (!storagePath.startsWith(`${orgId}/`)) {
    throw new ApiError(403, 'Cannot delete media from another organization');
  }

  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
  if (error) throw new ApiError(500, `Delete failed: ${error.message}`);
  return { deleted: true };
}

function getContentType(ext) {
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
  };
  return map[ext] || 'application/octet-stream';
}

// ═══════════════════════════════════════════
// Calendar
// ═══════════════════════════════════════════

export async function getCalendar(orgId, { clientId, startDate, endDate }) {
  let query = supabaseAdmin
    .from('social_posts')
    .select('id, client_id, caption, platforms, media_urls, status, scheduled_at, published_at, clients!inner(name, logo_url)')
    .eq('org_id', orgId)
    .not('scheduled_at', 'is', null);

  if (clientId) query = query.eq('client_id', clientId);
  if (startDate) query = query.gte('scheduled_at', startDate);
  if (endDate) query = query.lte('scheduled_at', endDate);

  query = query.order('scheduled_at', { ascending: true });

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);
  return data || [];
}

// ═══════════════════════════════════════════
// Publishing
// ═══════════════════════════════════════════

async function logPublishAttempt(postId, platform, action, success, response, errorMessage) {
  await supabaseAdmin.from('social_post_logs').insert({
    post_id: postId,
    platform,
    action,
    success,
    response: response || null,
    error_message: errorMessage || null,
  });
}

async function getPageConnection(orgId, clientId, platform) {
  const { data } = await supabaseAdmin
    .from('page_connections')
    .select('*')
    .eq('org_id', orgId)
    .eq('client_id', clientId)
    .eq('platform', platform)
    .limit(1)
    .single();

  return data;
}

export async function publishToFacebook(post, pageConnection) {
  const { page_id, page_access_token } = pageConnection;

  const hasMedia = post.media_urls?.length > 0;
  const isVideo = hasMedia && post.media_urls[0]?.match(/\.(mp4|mov|avi)$/i);

  let result;

  if (hasMedia && !isVideo) {
    // Photo post
    const body = { url: post.media_urls[0], message: post.caption || '' };
    if (post.scheduled_at && new Date(post.scheduled_at) > new Date()) {
      body.scheduled_publish_time = Math.floor(new Date(post.scheduled_at).getTime() / 1000);
      body.published = false;
    }
    result = await metaPost(`/${page_id}/photos`, page_access_token, body);
  } else if (isVideo) {
    // Video post
    const body = { file_url: post.media_urls[0], description: post.caption || '' };
    if (post.scheduled_at && new Date(post.scheduled_at) > new Date()) {
      body.scheduled_publish_time = Math.floor(new Date(post.scheduled_at).getTime() / 1000);
      body.published = false;
    }
    result = await metaPost(`/${page_id}/videos`, page_access_token, body);
  } else {
    // Text-only post
    const body = { message: post.caption || '' };
    if (post.scheduled_at && new Date(post.scheduled_at) > new Date()) {
      body.scheduled_publish_time = Math.floor(new Date(post.scheduled_at).getTime() / 1000);
      body.published = false;
    }
    result = await metaPost(`/${page_id}/feed`, page_access_token, body);
  }

  await logPublishAttempt(post.id, 'facebook', 'publish', true, result, null);
  return result;
}

export async function publishToInstagram(post, pageConnection) {
  const { ig_business_account_id, page_access_token } = pageConnection;

  if (!ig_business_account_id) {
    throw new ApiError(400, 'No Instagram business account linked to this page');
  }

  if (!post.media_urls?.length) {
    throw new ApiError(400, 'Instagram posts require at least one image or video');
  }

  const mediaUrl = post.media_urls[0];
  const isVideo = mediaUrl?.match(/\.(mp4|mov|avi)$/i);

  // Step 1: Create container
  const containerBody = {
    caption: post.caption || '',
    ...(isVideo
      ? { media_type: 'VIDEO', video_url: mediaUrl }
      : { image_url: mediaUrl }),
  };

  const container = await metaPost(
    `/${ig_business_account_id}/media`,
    page_access_token,
    containerBody,
  );

  await logPublishAttempt(post.id, 'instagram', 'create_container', true, container, null);

  const containerId = container.id;

  // For video, wait for processing (poll status)
  if (isVideo) {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const status = await metaFetch(`/${containerId}`, { fields: 'status_code' });
      if (status.status_code === 'FINISHED') { ready = true; break; }
      if (status.status_code === 'ERROR') {
        throw new ApiError(502, 'Instagram video processing failed');
      }
    }
    if (!ready) throw new ApiError(504, 'Instagram video processing timed out');
  }

  // Step 2: Publish
  const published = await metaPost(
    `/${ig_business_account_id}/media_publish`,
    page_access_token,
    { creation_id: containerId },
  );

  await logPublishAttempt(post.id, 'instagram', 'publish', true, published, null);
  return { container_id: containerId, media_id: published.id };
}

export async function publishPost(orgId, postId) {
  const post = await getPost(orgId, postId);

  if (!['draft', 'scheduled', 'failed'].includes(post.status)) {
    throw new ApiError(400, `Cannot publish post with status "${post.status}"`);
  }

  // Lock the post
  await supabaseAdmin
    .from('social_posts')
    .update({ status: 'publishing', publish_attempts: (post.publish_attempts || 0) + 1 })
    .eq('id', postId);

  const platforms = post.platforms || [];
  const results = { facebook: null, instagram: null };
  const errors = [];

  for (const platform of platforms) {
    try {
      const connection = await getPageConnection(orgId, post.client_id, platform === 'instagram' ? 'facebook' : platform);
      if (!connection) {
        throw new ApiError(400, `No ${platform} page connected for this client`);
      }

      if (platform === 'facebook') {
        results.facebook = await publishToFacebook(post, connection);
      } else if (platform === 'instagram') {
        results.instagram = await publishToInstagram(post, connection);
      }
    } catch (err) {
      errors.push({ platform, error: err.message });
      await logPublishAttempt(postId, platform, 'publish', false, null, err.message);
    }
  }

  // Determine final status
  let finalStatus;
  const updateData = {};

  if (errors.length === 0) {
    finalStatus = 'published';
    updateData.published_at = new Date().toISOString();
    if (results.facebook?.id) updateData.fb_post_id = results.facebook.id;
    if (results.instagram?.media_id) {
      updateData.ig_media_id = results.instagram.media_id;
      updateData.ig_container_id = results.instagram.container_id;
    }
  } else if (errors.length < platforms.length) {
    finalStatus = 'partially_failed';
    updateData.publish_error = errors.map(e => `${e.platform}: ${e.error}`).join('; ');
  } else {
    finalStatus = 'failed';
    updateData.publish_error = errors.map(e => `${e.platform}: ${e.error}`).join('; ');
  }

  updateData.status = finalStatus;

  await supabaseAdmin
    .from('social_posts')
    .update(updateData)
    .eq('id', postId);

  return { ...updateData, errors };
}

// ═══════════════════════════════════════════
// Scheduled Posts Processing (for cron)
// ═══════════════════════════════════════════

export async function processScheduledPosts() {
  const now = new Date().toISOString();

  const { data: duePosts, error } = await supabaseAdmin
    .from('social_posts')
    .select('id, org_id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .limit(10);

  if (error) {
    console.error('[SCHEDULER] Failed to fetch due posts:', error.message);
    return { processed: 0, errors: 0 };
  }

  let processed = 0;
  let errorCount = 0;

  for (const post of (duePosts || [])) {
    try {
      await publishPost(post.org_id, post.id);
      processed++;
    } catch (err) {
      console.error(`[SCHEDULER] Failed to publish post ${post.id}:`, err.message);
      errorCount++;
    }
  }

  return { processed, errors: errorCount };
}
