import { supabaseAdmin } from '../config/supabase.js';
import { META_ACCESS_TOKEN } from '../config/env.js';
import { metaFetch, asyncPool } from './metaService.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Discover the Instagram Business Account linked to a Meta ad account.
 * Queries the System User's Pages and finds one with an IG business account.
 */
export async function discoverIgBusinessAccount(clientId, adAccountId) {
  // Get all Pages the token has access to
  const pagesData = await metaFetch('/me/accounts', {
    fields: 'id,name,instagram_business_account',
    limit: '100',
  });

  const pages = pagesData.data || [];
  const pageWithIg = pages.find(p => p.instagram_business_account?.id);

  if (!pageWithIg) {
    console.warn(`[IG] No Instagram Business Account found for ad account ${adAccountId}`);
    return null;
  }

  const igId = pageWithIg.instagram_business_account.id;

  // Store on the client record
  await supabaseAdmin
    .from('clients')
    .update({ ig_business_account_id: igId })
    .eq('id', clientId);

  console.log(`[IG] Discovered IG Business Account ${igId} for client ${clientId}`);
  return igId;
}

/**
 * Fetch current IG profile info (followers, media count, username).
 */
export async function fetchIgProfile(igUserId) {
  return metaFetch(`/${igUserId}`, {
    fields: 'followers_count,media_count,username',
  });
}

/**
 * Fetch daily account-level insights for a date range.
 * Returns array of daily metric values.
 */
export async function fetchIgAccountInsights(igUserId, since, until) {
  const sinceTs = Math.floor(new Date(since).getTime() / 1000);
  const untilTs = Math.floor(new Date(until).getTime() / 1000);

  const data = await metaFetch(`/${igUserId}/insights`, {
    metric: 'reach,follower_count,website_clicks,profile_views,views',
    period: 'day',
    since: String(sinceTs),
    until: String(untilTs),
  });

  // Transform from per-metric arrays to per-day objects
  const metrics = data.data || [];
  const dailyMap = {};

  for (const metric of metrics) {
    const metricName = metric.name;
    for (const val of (metric.values || [])) {
      const date = val.end_time.split('T')[0];
      if (!dailyMap[date]) dailyMap[date] = { date };
      dailyMap[date][metricName] = val.value;
    }
  }

  return Object.values(dailyMap);
}

/**
 * Fetch recent media (posts, reels, carousels).
 * Filters to items after `since` date.
 */
export async function fetchIgMedia(igUserId, since) {
  const results = [];
  let url = `/${igUserId}/media`;
  let params = {
    fields: 'timestamp,like_count,comments_count,media_type,caption,permalink,id',
    limit: '50',
  };

  // Fetch up to 2 pages (100 items max)
  for (let page = 0; page < 2; page++) {
    const data = await metaFetch(url, page === 0 ? params : {});
    const items = data.data || [];

    for (const item of items) {
      const itemDate = new Date(item.timestamp);
      if (since && itemDate < new Date(since)) {
        return results; // Reached items older than our window
      }
      results.push(item);
    }

    // Check for next page
    if (data.paging?.next) {
      // Extract the path from the full URL for metaFetch
      const nextUrl = new URL(data.paging.next);
      url = nextUrl.pathname.replace('/v19.0', '');
      params = {};
      // Carry over the cursor params
      for (const [k, v] of nextUrl.searchParams) {
        if (k !== 'access_token') params[k] = v;
      }
    } else {
      break;
    }
  }

  return results;
}

/**
 * Fetch insights for a single media item.
 * Note: `shares` metric is only available on Reels.
 */
export async function fetchIgMediaInsights(mediaId) {
  try {
    const data = await metaFetch(`/${mediaId}/insights`, {
      metric: 'reach,saved,shares',
    });

    const result = { impressions: 0 };
    for (const metric of (data.data || [])) {
      result[metric.name] = metric.values?.[0]?.value || 0;
    }
    // Use reach as a proxy for impressions since impressions was deprecated
    result.impressions = result.reach || 0;
    return result;
  } catch (err) {
    // Some media types don't support all metrics (e.g., shares on non-Reels)
    try {
      const data = await metaFetch(`/${mediaId}/insights`, {
        metric: 'reach,saved',
      });
      const result = { shares: 0, impressions: 0 };
      for (const metric of (data.data || [])) {
        result[metric.name] = metric.values?.[0]?.value || 0;
      }
      result.impressions = result.reach || 0;
      return result;
    } catch {
      return { impressions: 0, reach: 0, saved: 0, shares: 0 };
    }
  }
}

/**
 * Main orchestrator: sync all Instagram organic data for a client.
 */
export async function syncClientInstagram(clientId) {
  if (!META_ACCESS_TOKEN) {
    throw new ApiError(500, 'Meta access token not configured');
  }

  // 1. Get client
  const { data: client, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('ig_business_account_id, meta_ad_account_id, ig_handle, name')
    .eq('id', clientId)
    .single();

  if (clientErr || !client) throw new ApiError(404, 'Client not found');

  // 2. Get or discover IG business account ID
  let igUserId = client.ig_business_account_id;
  if (!igUserId && client.meta_ad_account_id) {
    igUserId = await discoverIgBusinessAccount(clientId, client.meta_ad_account_id);
  }
  if (!igUserId) {
    return { skipped: true, reason: 'No Instagram Business Account linked' };
  }

  // 3. Fetch profile
  const profile = await fetchIgProfile(igUserId);

  // 4. Fetch account insights (last 30 days)
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const since = thirtyDaysAgo.toISOString().split('T')[0];
  const until = now.toISOString().split('T')[0];

  const dailyInsights = await fetchIgAccountInsights(igUserId, since, until);

  // 5. Upsert daily account metrics
  let daysSynced = 0;
  for (const day of dailyInsights) {
    const row = {
      client_id: clientId,
      date: day.date,
      followers_count: day.follower_count || profile.followers_count || null,
      impressions: day.views || 0,
      reach: day.reach || 0,
      profile_views: day.profile_views || 0,
      website_clicks: day.website_clicks || 0,
      media_count: profile.media_count || null,
      synced_at: new Date().toISOString(),
    };

    const { data: existing } = await supabaseAdmin
      .from('ig_account_metrics')
      .select('id')
      .eq('client_id', clientId)
      .eq('date', day.date)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from('ig_account_metrics')
        .update(row)
        .eq('id', existing.id);
    } else {
      await supabaseAdmin
        .from('ig_account_metrics')
        .insert(row);
    }
    daysSynced++;
  }

  // 6. Fetch recent media
  const media = await fetchIgMedia(igUserId, since);

  // 7. Fetch per-media insights and upsert
  let mediaSynced = 0;
  await asyncPool(3, media, async (item) => {
    try {
      const insights = await fetchIgMediaInsights(item.id);

      const row = {
        client_id: clientId,
        ig_media_id: item.id,
        timestamp: item.timestamp,
        media_type: item.media_type,
        caption: item.caption?.substring(0, 500) || null,
        permalink: item.permalink,
        like_count: item.like_count || 0,
        comments_count: item.comments_count || 0,
        impressions: insights.impressions || 0,
        reach: insights.reach || 0,
        saved: insights.saved || 0,
        shares: insights.shares || 0,
        synced_at: new Date().toISOString(),
      };

      const { data: existing } = await supabaseAdmin
        .from('ig_media_metrics')
        .select('id')
        .eq('client_id', clientId)
        .eq('ig_media_id', item.id)
        .maybeSingle();

      if (existing) {
        await supabaseAdmin
          .from('ig_media_metrics')
          .update(row)
          .eq('id', existing.id);
      } else {
        await supabaseAdmin
          .from('ig_media_metrics')
          .insert(row);
      }
      mediaSynced++;
    } catch (err) {
      console.error(`[IG] Failed to sync media ${item.id}:`, err.message);
    }
  });

  return {
    ig_username: profile.username,
    followers_count: profile.followers_count,
    days_synced: daysSynced,
    media_synced: mediaSynced,
  };
}
