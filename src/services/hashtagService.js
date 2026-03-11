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
    .select('caption, like_count, comments_count, reach, saved, shares')
    .eq('client_id', clientId)
    .not('caption', 'is', null);

  if (error) {
    console.error('[Hashtags] Failed to fetch media:', error.message);
    return { hashtags_parsed: 0 };
  }

  // Aggregate metrics per hashtag
  const hashtagMap = {};

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
    }
  }

  // Calculate avg engagement rate and upsert
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

  console.log(`[Hashtags] Parsed ${count} hashtags for client ${clientId}`);
  return { hashtags_parsed: count };
}

/**
 * Get hashtag performance data for a client.
 */
export async function getHashtags(ownerId, clientId, { sortBy = 'avg_engagement_rate', order = 'desc', limit = 100 } = {}) {
  // Verify ownership
  const { error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('owner_id', ownerId)
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
