import { supabaseAdmin } from '../config/supabase.js';
import { metaFetch, metaPost, asyncPool } from './metaService.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Get the Facebook page connection for a client (needed for IG comment replies).
 * IG business accounts are managed through the linked FB page.
 */
async function getPageConnection(clientId) {
  const { data } = await supabaseAdmin
    .from('page_connections')
    .select('*')
    .eq('client_id', clientId)
    .eq('platform', 'facebook')
    .not('ig_business_account_id', 'is', null)
    .limit(1)
    .maybeSingle();

  return data;
}

/**
 * Fetch recent media IDs directly from the IG business account via Meta API.
 * This makes the comment sync independent of ig_media_metrics.
 */
async function fetchRecentMediaFromApi(igBusinessAccountId) {
  try {
    const data = await metaFetch(`/${igBusinessAccountId}/media`, {
      fields: 'id,caption,permalink,timestamp,thumbnail_url,media_type,like_count,comments_count',
      limit: '20',
    });
    return data.data || [];
  } catch (err) {
    console.error(`[COMMUNITY] Failed to fetch media from API:`, err.message);
    return [];
  }
}

/**
 * Sync comments from Instagram for a client's recent posts.
 * Fetches media directly from Meta API so it works independently of ig_media_metrics.
 */
export async function syncCommentsForClient(clientId) {
  // Get the page connection for IG business account ID
  const conn = await getPageConnection(clientId);
  if (!conn) {
    console.log(`[COMMUNITY] No IG page connection for client ${clientId}, skipping`);
    return { comments_synced: 0, posts_checked: 0, skipped: true };
  }

  const igBusinessAccountId = conn.ig_business_account_id;
  const orgId = conn.org_id;

  // Fetch recent media directly from IG API with full details
  let mediaItems = await fetchRecentMediaFromApi(igBusinessAccountId);

  // Fallback: if API fetch returned nothing, try the local DB
  if (mediaItems.length === 0) {
    const { data: dbPosts } = await supabaseAdmin
      .from('ig_media_metrics')
      .select('ig_media_id')
      .eq('client_id', clientId)
      .order('timestamp', { ascending: false })
      .limit(20);
    mediaItems = (dbPosts || []).map(p => ({ id: p.ig_media_id }));
  }

  if (mediaItems.length === 0) {
    console.log(`[COMMUNITY] No media found for client ${clientId}`);
    return { comments_synced: 0, posts_checked: 0 };
  }

  // Upsert media details into ig_media_metrics so captions are available for display
  for (const m of mediaItems) {
    if (m.caption || m.permalink || m.timestamp) {
      try {
        await supabaseAdmin
          .from('ig_media_metrics')
          .upsert({
            client_id: clientId,
            ig_media_id: m.id,
            caption: m.caption || null,
            permalink: m.permalink || null,
            thumbnail_url: m.thumbnail_url || null,
            media_type: m.media_type || null,
            like_count: m.like_count || 0,
            comments_count: m.comments_count || 0,
            timestamp: m.timestamp,
          }, { onConflict: 'client_id,ig_media_id', ignoreDuplicates: false });
      } catch (err) {
        // Non-critical — just for display context
        console.error(`[COMMUNITY] Failed to upsert media context for ${m.id}:`, err.message);
      }
    }
  }

  const posts = mediaItems.map(m => ({ ig_media_id: m.id }));

  let totalSynced = 0;

  await asyncPool(5, posts, async (post) => {
    try {
      const data = await metaFetch(`/${post.ig_media_id}/comments`, {
        fields: 'from,text,timestamp,like_count,username,replies{from,text,timestamp,username,like_count}',
        limit: '50',
      });

      const comments = data.data || [];

      for (const comment of comments) {
        // Upsert the top-level comment
        const isFromPage = comment.from?.id === igBusinessAccountId;

        await supabaseAdmin
          .from('social_comments')
          .upsert({
            org_id: orgId,
            client_id: clientId,
            platform: 'instagram',
            media_id: post.ig_media_id,
            comment_id: comment.id,
            parent_comment_id: null,
            username: comment.username || comment.from?.username || null,
            user_id_meta: comment.from?.id || null,
            text: comment.text || '',
            like_count: comment.like_count || 0,
            is_from_page: isFromPage,
            timestamp: comment.timestamp,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'client_id,comment_id' });

        totalSynced++;

        // Upsert replies to this comment
        const replies = comment.replies?.data || [];
        for (const reply of replies) {
          const replyIsFromPage = reply.from?.id === igBusinessAccountId;

          await supabaseAdmin
            .from('social_comments')
            .upsert({
              org_id: orgId,
              client_id: clientId,
              platform: 'instagram',
              media_id: post.ig_media_id,
              comment_id: reply.id,
              parent_comment_id: comment.id,
              username: reply.username || reply.from?.username || null,
              user_id_meta: reply.from?.id || null,
              text: reply.text || '',
              like_count: reply.like_count || 0,
              is_from_page: replyIsFromPage,
              timestamp: reply.timestamp,
              synced_at: new Date().toISOString(),
            }, { onConflict: 'client_id,comment_id' });

          totalSynced++;
        }
      }
    } catch (err) {
      console.error(`[COMMUNITY] Failed to fetch comments for media ${post.ig_media_id}:`, err.message);
    }
  });

  console.log(`[COMMUNITY] Synced ${totalSynced} comments from ${posts.length} posts for client ${clientId}`);
  return { comments_synced: totalSynced, posts_checked: posts.length };
}

/**
 * Get comments for a client, optionally filtered and grouped by post.
 */
export async function getComments(orgId, clientId, { filter = 'all', search, limit = 50, offset = 0 } = {}) {
  // Verify ownership
  const { error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('org_id', orgId)
    .single();
  if (clientErr) throw new ApiError(404, 'Client not found');

  // Get top-level comments (not replies)
  let query = supabaseAdmin
    .from('social_comments')
    .select('*')
    .eq('client_id', clientId)
    .is('parent_comment_id', null)
    .eq('is_hidden', false)
    .order('timestamp', { ascending: false });

  if (search) {
    query = query.or(`text.ilike.%${search}%,username.ilike.%${search}%`);
  }

  if (filter === 'needs_reply') {
    // Comments NOT from the page that have no reply from the page
    query = query.eq('is_from_page', false);
  } else if (filter === 'replied') {
    // We'll filter after fetching based on replies
  }

  query = query.range(offset, offset + limit - 1);

  const { data: comments, error } = await query;
  if (error) throw new ApiError(500, error.message);
  if (!comments || comments.length === 0) return [];

  // Fetch all replies for these comments
  const commentIds = comments.map(c => c.comment_id);
  const { data: replies } = await supabaseAdmin
    .from('social_comments')
    .select('*')
    .eq('client_id', clientId)
    .in('parent_comment_id', commentIds)
    .order('timestamp', { ascending: true });

  // Build a replies lookup
  const repliesByParent = {};
  for (const r of (replies || [])) {
    if (!repliesByParent[r.parent_comment_id]) repliesByParent[r.parent_comment_id] = [];
    repliesByParent[r.parent_comment_id].push(r);
  }

  // Attach replies and determine "has page reply"
  let enriched = comments.map(c => ({
    ...c,
    replies: repliesByParent[c.comment_id] || [],
    has_page_reply: (repliesByParent[c.comment_id] || []).some(r => r.is_from_page),
  }));

  // Apply post-fetch filters
  if (filter === 'needs_reply') {
    enriched = enriched.filter(c => !c.has_page_reply);
  } else if (filter === 'replied') {
    enriched = enriched.filter(c => c.has_page_reply);
  }

  // Get post context for all unique media IDs
  const mediaIds = [...new Set(enriched.map(c => c.media_id))];
  const { data: posts } = await supabaseAdmin
    .from('ig_media_metrics')
    .select('ig_media_id, caption, permalink, thumbnail_url, like_count, comments_count, timestamp, media_type')
    .eq('client_id', clientId)
    .in('ig_media_id', mediaIds);

  const postsByMediaId = {};
  for (const p of (posts || [])) {
    postsByMediaId[p.ig_media_id] = p;
  }

  // Group comments by post
  const grouped = {};
  for (const c of enriched) {
    if (!grouped[c.media_id]) {
      grouped[c.media_id] = {
        post: postsByMediaId[c.media_id] || { ig_media_id: c.media_id },
        comments: [],
      };
    }
    grouped[c.media_id].comments.push(c);
  }

  // Return sorted by most recent comment
  return Object.values(grouped).sort((a, b) => {
    const aTime = a.comments[0]?.timestamp || '';
    const bTime = b.comments[0]?.timestamp || '';
    return bTime.localeCompare(aTime);
  });
}

/**
 * Reply to a comment on Instagram.
 */
export async function replyToComment(orgId, clientId, commentId, message) {
  // Verify ownership
  const { error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('org_id', orgId)
    .single();
  if (clientErr) throw new ApiError(404, 'Client not found');

  // Get the original comment
  const { data: comment, error: commentErr } = await supabaseAdmin
    .from('social_comments')
    .select('*')
    .eq('client_id', clientId)
    .eq('comment_id', commentId)
    .single();

  if (commentErr || !comment) throw new ApiError(404, 'Comment not found');

  // Get page connection for reply token
  const conn = await getPageConnection(clientId);
  if (!conn || !conn.page_access_token) {
    throw new ApiError(400, 'No Instagram page connection with access token found');
  }

  // Reply via Meta API
  const result = await metaPost(`/${commentId}/replies`, conn.page_access_token, {
    message,
  });

  // Store the reply in our DB
  const replyRow = {
    org_id: orgId,
    client_id: clientId,
    platform: comment.platform,
    media_id: comment.media_id,
    comment_id: result.id,
    parent_comment_id: comment.parent_comment_id || commentId,
    username: null, // Will be populated on next sync
    user_id_meta: conn.ig_business_account_id,
    text: message,
    like_count: 0,
    is_from_page: true,
    timestamp: new Date().toISOString(),
    synced_at: new Date().toISOString(),
  };

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('social_comments')
    .insert(replyRow)
    .select()
    .single();

  if (insertErr) {
    console.error('[COMMUNITY] Failed to store reply:', insertErr.message);
    // Still return success since the Meta API call worked
    return replyRow;
  }

  return inserted;
}

/**
 * Hide a comment on Instagram.
 */
export async function hideComment(orgId, clientId, commentId) {
  const { error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('org_id', orgId)
    .single();
  if (clientErr) throw new ApiError(404, 'Client not found');

  const { data: comment } = await supabaseAdmin
    .from('social_comments')
    .select('*')
    .eq('client_id', clientId)
    .eq('comment_id', commentId)
    .single();

  if (!comment) throw new ApiError(404, 'Comment not found');

  const conn = await getPageConnection(clientId);
  if (!conn || !conn.page_access_token) {
    throw new ApiError(400, 'No Instagram page connection found');
  }

  // Hide via Meta API
  await metaPost(`/${commentId}`, conn.page_access_token, { hide: true });

  // Mark as hidden in DB
  await supabaseAdmin
    .from('social_comments')
    .update({ is_hidden: true })
    .eq('client_id', clientId)
    .eq('comment_id', commentId);

  return { hidden: true };
}

/**
 * Get engagement stats for the hub card.
 */
export async function getEngagementStats(orgId, clientId) {
  const { error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('org_id', orgId)
    .single();
  if (clientErr) throw new ApiError(404, 'Client not found');

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Total comments in last 30 days (top-level, not hidden, not from page)
  const { count: totalComments } = await supabaseAdmin
    .from('social_comments')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .is('parent_comment_id', null)
    .eq('is_hidden', false)
    .eq('is_from_page', false)
    .gte('timestamp', thirtyDaysAgo.toISOString());

  // Get IDs of comments that have a page reply
  const { data: repliedComments } = await supabaseAdmin
    .from('social_comments')
    .select('parent_comment_id')
    .eq('client_id', clientId)
    .eq('is_from_page', true)
    .not('parent_comment_id', 'is', null);

  const repliedSet = new Set((repliedComments || []).map(r => r.parent_comment_id));

  // Count top-level comments without page replies
  const { data: topLevel } = await supabaseAdmin
    .from('social_comments')
    .select('comment_id')
    .eq('client_id', clientId)
    .is('parent_comment_id', null)
    .eq('is_hidden', false)
    .eq('is_from_page', false)
    .gte('timestamp', thirtyDaysAgo.toISOString());

  const needsReply = (topLevel || []).filter(c => !repliedSet.has(c.comment_id)).length;

  return {
    total_comments: totalComments || 0,
    needs_reply: needsReply,
  };
}

/**
 * Get comments across ALL clients in the org, grouped by client then by post.
 */
export async function getAllComments(orgId, { filter = 'all', search, limit = 50, offset = 0 } = {}) {
  // Get all clients belonging to this org
  const { data: orgClients, error: clientsErr } = await supabaseAdmin
    .from('clients')
    .select('id, name, brand_color, logo_url, ig_handle')
    .eq('org_id', orgId);

  if (clientsErr || !orgClients || orgClients.length === 0) return [];

  const clientIds = orgClients.map(c => c.id);
  const clientMap = {};
  for (const c of orgClients) clientMap[c.id] = c;

  // Get top-level comments across all clients
  let query = supabaseAdmin
    .from('social_comments')
    .select('*')
    .in('client_id', clientIds)
    .is('parent_comment_id', null)
    .eq('is_hidden', false)
    .order('timestamp', { ascending: false });

  if (search) {
    query = query.or(`text.ilike.%${search}%,username.ilike.%${search}%`);
  }

  if (filter === 'needs_reply') {
    query = query.eq('is_from_page', false);
  }

  query = query.range(offset, offset + limit - 1);

  const { data: comments, error } = await query;
  if (error) throw new ApiError(500, error.message);
  if (!comments || comments.length === 0) return [];

  // Fetch replies
  const commentIds = comments.map(c => c.comment_id);
  const { data: replies } = await supabaseAdmin
    .from('social_comments')
    .select('*')
    .in('client_id', clientIds)
    .in('parent_comment_id', commentIds)
    .order('timestamp', { ascending: true });

  const repliesByParent = {};
  for (const r of (replies || [])) {
    if (!repliesByParent[r.parent_comment_id]) repliesByParent[r.parent_comment_id] = [];
    repliesByParent[r.parent_comment_id].push(r);
  }

  // Enrich with replies
  let enriched = comments.map(c => ({
    ...c,
    replies: repliesByParent[c.comment_id] || [],
    has_page_reply: (repliesByParent[c.comment_id] || []).some(r => r.is_from_page),
  }));

  if (filter === 'needs_reply') {
    enriched = enriched.filter(c => !c.has_page_reply);
  } else if (filter === 'replied') {
    enriched = enriched.filter(c => c.has_page_reply);
  }

  // Get post context
  const mediaIds = [...new Set(enriched.map(c => c.media_id))];
  const { data: posts } = await supabaseAdmin
    .from('ig_media_metrics')
    .select('ig_media_id, caption, permalink, thumbnail_url, like_count, comments_count, timestamp, media_type, client_id')
    .in('client_id', clientIds)
    .in('ig_media_id', mediaIds);

  const postsByMediaId = {};
  for (const p of (posts || [])) {
    postsByMediaId[p.ig_media_id] = p;
  }

  // Group by client, then by post
  const byClient = {};
  for (const c of enriched) {
    if (!byClient[c.client_id]) {
      byClient[c.client_id] = {
        client: clientMap[c.client_id] || { id: c.client_id, name: 'Unknown' },
        posts: {},
      };
    }
    if (!byClient[c.client_id].posts[c.media_id]) {
      byClient[c.client_id].posts[c.media_id] = {
        post: postsByMediaId[c.media_id] || { ig_media_id: c.media_id },
        comments: [],
      };
    }
    byClient[c.client_id].posts[c.media_id].comments.push(c);
  }

  // Convert to array, sorted by most recent comment per client
  return Object.values(byClient).map(g => ({
    ...g,
    posts: Object.values(g.posts).sort((a, b) => {
      const aTime = a.comments[0]?.timestamp || '';
      const bTime = b.comments[0]?.timestamp || '';
      return bTime.localeCompare(aTime);
    }),
  })).sort((a, b) => {
    const aTime = a.posts[0]?.comments[0]?.timestamp || '';
    const bTime = b.posts[0]?.comments[0]?.timestamp || '';
    return bTime.localeCompare(aTime);
  });
}

/**
 * Get aggregate engagement stats across ALL clients in the org.
 */
export async function getAllStats(orgId) {
  const { data: orgClients } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('org_id', orgId);

  if (!orgClients || orgClients.length === 0) {
    return { total_comments: 0, needs_reply: 0, clients_with_comments: 0 };
  }

  const clientIds = orgClients.map(c => c.id);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Total external comments (last 30 days)
  const { count: totalComments } = await supabaseAdmin
    .from('social_comments')
    .select('id', { count: 'exact', head: true })
    .in('client_id', clientIds)
    .is('parent_comment_id', null)
    .eq('is_hidden', false)
    .eq('is_from_page', false)
    .gte('timestamp', thirtyDaysAgo.toISOString());

  // Replied comment IDs
  const { data: repliedComments } = await supabaseAdmin
    .from('social_comments')
    .select('parent_comment_id')
    .in('client_id', clientIds)
    .eq('is_from_page', true)
    .not('parent_comment_id', 'is', null);

  const repliedSet = new Set((repliedComments || []).map(r => r.parent_comment_id));

  // Top-level unreplied
  const { data: topLevel } = await supabaseAdmin
    .from('social_comments')
    .select('comment_id, client_id')
    .in('client_id', clientIds)
    .is('parent_comment_id', null)
    .eq('is_hidden', false)
    .eq('is_from_page', false)
    .gte('timestamp', thirtyDaysAgo.toISOString());

  const unreplied = (topLevel || []).filter(c => !repliedSet.has(c.comment_id));
  const clientsWithComments = new Set((topLevel || []).map(c => c.client_id)).size;

  return {
    total_comments: totalComments || 0,
    needs_reply: unreplied.length,
    clients_with_comments: clientsWithComments,
  };
}

/**
 * Sync comments for ALL clients in the org that have IG connections.
 */
export async function syncAllComments(orgId) {
  const { data: orgClients } = await supabaseAdmin
    .from('clients')
    .select('id, name')
    .eq('org_id', orgId);

  if (!orgClients || orgClients.length === 0) return { clients_synced: 0, total_comments: 0 };

  let totalComments = 0;
  let clientsSynced = 0;

  for (const client of orgClients) {
    try {
      const result = await syncCommentsForClient(client.id);
      if (!result.skipped) {
        totalComments += result.comments_synced;
        clientsSynced++;
      }
    } catch (err) {
      console.error(`[COMMUNITY] Sync-all failed for ${client.name}:`, err.message);
    }
  }

  return { clients_synced: clientsSynced, total_comments: totalComments };
}
