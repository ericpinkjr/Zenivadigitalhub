import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Parse hashtags from synced IG media captions and aggregate performance metrics.
 * Called at the end of syncClientInstagram().
 */
export async function parseAndStoreHashtags(clientId) {
  // Fetch all media with captions for this client
  const { data: media, error } = await supabaseAdmin
    .from('ig_media_metrics')
    .select('ig_media_id, caption, like_count, comments_count, reach, saved, shares')
    .eq('client_id', clientId)
    .not('caption', 'is', null);

  if (error) {
    console.error('[Hashtags] Failed to fetch media:', error.message);
    return { hashtags_parsed: 0 };
  }

  // Aggregate metrics per hashtag
  const hashtagMap = {};
  const mapRows = [];

  for (const item of (media || [])) {
    const caption = item.caption || '';
    const tags = caption.match(/#[\w\u00C0-\u024F]+/g);
    if (!tags) continue;

    const uniqueTags = [...new Set(tags.map(t => t.toLowerCase()))];

    for (const tag of uniqueTags) {
      if (!hashtagMap[tag]) {
        hashtagMap[tag] = {
          hashtag: tag,
          post_count: 0,
          total_likes: 0,
          total_comments: 0,
          total_shares: 0,
          total_saves: 0,
          total_reach: 0,
        };
      }
      const h = hashtagMap[tag];
      h.post_count++;
      h.total_likes += item.like_count || 0;
      h.total_comments += item.comments_count || 0;
      h.total_shares += item.shares || 0;
      h.total_saves += item.saved || 0;
      h.total_reach += item.reach || 0;

      // Collect junction rows
      mapRows.push({ client_id: clientId, hashtag: tag, ig_media_id: item.ig_media_id });
    }
  }

  // Calculate avg engagement rate and upsert hashtag_performance
  let count = 0;
  for (const tag of Object.values(hashtagMap)) {
    const totalEngagements = tag.total_likes + tag.total_comments + tag.total_shares + tag.total_saves;
    tag.avg_engagement_rate = tag.total_reach > 0
      ? (totalEngagements / tag.total_reach) * 100
      : 0;

    const row = {
      client_id: clientId,
      hashtag: tag.hashtag,
      post_count: tag.post_count,
      total_likes: tag.total_likes,
      total_comments: tag.total_comments,
      total_shares: tag.total_shares,
      total_saves: tag.total_saves,
      total_reach: tag.total_reach,
      avg_engagement_rate: parseFloat(tag.avg_engagement_rate.toFixed(4)),
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabaseAdmin
      .from('hashtag_performance')
      .select('id')
      .eq('client_id', clientId)
      .eq('hashtag', tag.hashtag)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from('hashtag_performance')
        .update(row)
        .eq('id', existing.id);
    } else {
      await supabaseAdmin
        .from('hashtag_performance')
        .insert(row);
    }
    count++;
  }

  // Batch upsert hashtag↔post junction rows
  if (mapRows.length > 0) {
    // Supabase upsert in chunks of 500 to avoid payload limits
    for (let i = 0; i < mapRows.length; i += 500) {
      const chunk = mapRows.slice(i, i + 500);
      await supabaseAdmin
        .from('hashtag_post_map')
        .upsert(chunk, { onConflict: 'client_id,hashtag,ig_media_id', ignoreDuplicates: true });
    }
  }

  console.log(`[Hashtags] Parsed ${count} hashtags, ${mapRows.length} post links for client ${clientId}`);
  return { hashtags_parsed: count, post_links: mapRows.length };
}

/**
 * Get hashtag performance data for a client.
 */
export async function getHashtags(orgId, clientId, { sortBy = 'avg_engagement_rate', order = 'desc', limit = 100 } = {}) {
  // Verify ownership
  const { error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('org_id', orgId)
    .single();

  if (clientErr) throw new ApiError(404, 'Client not found');

  const validSorts = ['hashtag', 'post_count', 'avg_engagement_rate', 'total_reach', 'total_likes', 'total_saves'];
  const col = validSorts.includes(sortBy) ? sortBy : 'avg_engagement_rate';

  const { data, error } = await supabaseAdmin
    .from('hashtag_performance')
    .select('*')
    .eq('client_id', clientId)
    .order(col, { ascending: order === 'asc' })
    .limit(limit);

  if (error) throw new ApiError(500, error.message);
  return data;
}

/**
 * Get posts that used a specific hashtag.
 */
export async function getHashtagPosts(orgId, clientId, hashtag, { limit = 20 } = {}) {
  const { error: clientErr } = await supabaseAdmin
    .from('clients').select('id').eq('id', clientId).eq('org_id', orgId).single();
  if (clientErr) throw new ApiError(404, 'Client not found');

  // Normalize hashtag (ensure lowercase, add # if missing)
  const tag = hashtag.startsWith('#') ? hashtag.toLowerCase() : `#${hashtag.toLowerCase()}`;

  // Get media IDs linked to this hashtag
  const { data: links, error: linkErr } = await supabaseAdmin
    .from('hashtag_post_map')
    .select('ig_media_id')
    .eq('client_id', clientId)
    .eq('hashtag', tag)
    .limit(limit);

  if (linkErr) throw new ApiError(500, linkErr.message);
  if (!links || links.length === 0) return [];

  const mediaIds = links.map(l => l.ig_media_id);

  const { data, error } = await supabaseAdmin
    .from('ig_media_metrics')
    .select('*')
    .eq('client_id', clientId)
    .in('ig_media_id', mediaIds)
    .order('timestamp', { ascending: false });

  if (error) throw new ApiError(500, error.message);
  return data || [];
}

/**
 * Get weekly trend data for a specific hashtag.
 */
export async function getHashtagTrend(orgId, clientId, hashtag) {
  const { error: clientErr } = await supabaseAdmin
    .from('clients').select('id').eq('id', clientId).eq('org_id', orgId).single();
  if (clientErr) throw new ApiError(404, 'Client not found');

  const tag = hashtag.startsWith('#') ? hashtag.toLowerCase() : `#${hashtag.toLowerCase()}`;

  // Get all posts for this hashtag with their metrics
  const { data: links } = await supabaseAdmin
    .from('hashtag_post_map')
    .select('ig_media_id')
    .eq('client_id', clientId)
    .eq('hashtag', tag);

  if (!links || links.length === 0) return [];

  const mediaIds = links.map(l => l.ig_media_id);

  const { data: posts, error } = await supabaseAdmin
    .from('ig_media_metrics')
    .select('timestamp, like_count, comments_count, reach, saved, shares')
    .eq('client_id', clientId)
    .in('ig_media_id', mediaIds)
    .order('timestamp', { ascending: true });

  if (error) throw new ApiError(500, error.message);
  if (!posts || posts.length === 0) return [];

  // Bucket into weeks
  const weekMap = {};
  for (const p of posts) {
    const d = new Date(p.timestamp);
    // Get Monday of the week
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    const weekKey = monday.toISOString().split('T')[0];

    if (!weekMap[weekKey]) {
      weekMap[weekKey] = { period: weekKey, post_count: 0, total_reach: 0, er_sum: 0 };
    }
    const w = weekMap[weekKey];
    w.post_count++;
    w.total_reach += p.reach || 0;
    const engagements = (p.like_count || 0) + (p.comments_count || 0) + (p.saved || 0) + (p.shares || 0);
    w.er_sum += p.reach > 0 ? (engagements / p.reach) * 100 : 0;
  }

  return Object.values(weekMap)
    .map(w => ({
      period: w.period,
      post_count: w.post_count,
      avg_er: parseFloat((w.er_sum / w.post_count).toFixed(2)),
      total_reach: w.total_reach,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Get IG posts for a client with their hashtags (for Post Explorer).
 */
export async function getClientPosts(orgId, clientId, { limit = 30, offset = 0, sortBy = 'timestamp' } = {}) {
  const { error: clientErr } = await supabaseAdmin
    .from('clients').select('id').eq('id', clientId).eq('org_id', orgId).single();
  if (clientErr) throw new ApiError(404, 'Client not found');

  const validSorts = ['timestamp', 'like_count', 'reach', 'saved'];
  const col = validSorts.includes(sortBy) ? sortBy : 'timestamp';

  const { data: posts, error } = await supabaseAdmin
    .from('ig_media_metrics')
    .select('*')
    .eq('client_id', clientId)
    .order(col, { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new ApiError(500, error.message);
  if (!posts || posts.length === 0) return [];

  // Fetch hashtags for these posts
  const mediaIds = posts.map(p => p.ig_media_id);
  const { data: links } = await supabaseAdmin
    .from('hashtag_post_map')
    .select('ig_media_id, hashtag')
    .eq('client_id', clientId)
    .in('ig_media_id', mediaIds);

  // Build lookup
  const hashtagsByMedia = {};
  for (const l of (links || [])) {
    if (!hashtagsByMedia[l.ig_media_id]) hashtagsByMedia[l.ig_media_id] = [];
    hashtagsByMedia[l.ig_media_id].push(l.hashtag);
  }

  return posts.map(p => ({
    ...p,
    hashtags: hashtagsByMedia[p.ig_media_id] || [],
  }));
}
