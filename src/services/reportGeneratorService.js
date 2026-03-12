import { supabaseAdmin } from '../config/supabase.js';
import { generateNarrative } from './aiService.js';
import { ApiError } from '../utils/apiError.js';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/**
 * Auto-generate a report for a client by pulling campaign_metrics
 * and ig_account_metrics/ig_media_metrics from Supabase, aggregating them,
 * sending to Claude for a narrative, and saving the report.
 */
export async function generateReport(orgId, clientId, month, year) {
  // 1. Get client
  const { data: client, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .eq('org_id', orgId)
    .single();

  if (clientErr || !client) throw new ApiError(404, 'Client not found');

  // 2. Check for duplicate
  const { data: existing } = await supabaseAdmin
    .from('reports')
    .select('id')
    .eq('client_id', clientId)
    .eq('month', month)
    .eq('year', year)
    .single();

  if (existing) throw new ApiError(409, `Report for ${month} ${year} already exists`);

  // 3. Determine date range for the month
  const monthIdx = MONTHS.indexOf(month);
  if (monthIdx === -1) throw new ApiError(400, `Invalid month: ${month}`);
  const startDate = `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`;
  const endDate = monthIdx === 11
    ? `${year + 1}-01-01`
    : `${year}-${String(monthIdx + 2).padStart(2, '0')}-01`;

  // 4. Get all campaigns for this client
  const { data: campaigns } = await supabaseAdmin
    .from('campaigns')
    .select('id, name, objective, budget, status')
    .eq('client_id', clientId);

  // 5. Get ad campaign metrics for the month
  let metrics = [];
  if (campaigns && campaigns.length > 0) {
    const campaignIds = campaigns.map(c => c.id);
    const { data: metricsData } = await supabaseAdmin
      .from('campaign_metrics')
      .select('*')
      .in('campaign_id', campaignIds)
      .gte('date', startDate)
      .lt('date', endDate);
    metrics = metricsData || [];
  }

  // 6. Aggregate ad metrics
  const agg = {
    total_spend: 0,
    total_impressions: 0,
    total_reach: 0,
    total_clicks: 0,
    total_conversions: 0,
    total_days: metrics.length,
  };

  for (const m of metrics) {
    agg.total_spend += parseFloat(m.spend) || 0;
    agg.total_impressions += parseInt(m.impressions) || 0;
    agg.total_reach += parseInt(m.reach) || 0;
    agg.total_clicks += parseInt(m.clicks) || 0;
    agg.total_conversions += parseInt(m.conversions) || 0;
  }

  agg.avg_ctr = agg.total_impressions > 0 ? (agg.total_clicks / agg.total_impressions * 100) : 0;
  agg.avg_cpm = agg.total_impressions > 0 ? (agg.total_spend / agg.total_impressions * 1000) : 0;
  agg.avg_roas = agg.total_spend > 0
    ? metrics.reduce((s, m) => s + (parseFloat(m.roas) || 0) * (parseFloat(m.spend) || 0), 0) / agg.total_spend
    : 0;

  // 7. Get Instagram organic account metrics for the month
  const { data: igMetrics } = await supabaseAdmin
    .from('ig_account_metrics')
    .select('*')
    .eq('client_id', clientId)
    .gte('date', startDate)
    .lt('date', endDate)
    .order('date', { ascending: true });

  const igAgg = {
    ig_followers: 0,
    ig_reach: 0,
    ig_views: 0,
    ig_profile_visits: 0,
    ig_website_taps: 0,
  };

  if (igMetrics && igMetrics.length > 0) {
    for (const m of igMetrics) {
      igAgg.ig_reach += m.reach || 0;
      igAgg.ig_views += m.impressions || 0;
      igAgg.ig_profile_visits += m.profile_views || 0;
      igAgg.ig_website_taps += m.website_clicks || 0;
    }
    // Followers: take the last day's count
    igAgg.ig_followers = igMetrics[igMetrics.length - 1].followers_count || 0;
    // Compute new followers as difference between last and first day
    const firstFollowers = igMetrics[0].followers_count || 0;
    igAgg.ig_new_followers = igAgg.ig_followers - firstFollowers;
  }

  // 8. Get Instagram media metrics for the month (top content)
  const { data: igMedia } = await supabaseAdmin
    .from('ig_media_metrics')
    .select('*')
    .eq('client_id', clientId)
    .gte('timestamp', startDate)
    .lt('timestamp', endDate)
    .order('like_count', { ascending: false });

  const igMediaAgg = {
    ig_likes: 0,
    ig_comments: 0,
    ig_saves: 0,
    ig_shares: 0,
    ig_posts: 0,
    ig_reels_published: 0,
  };

  const topPosts = [];
  if (igMedia && igMedia.length > 0) {
    for (const m of igMedia) {
      igMediaAgg.ig_likes += m.like_count || 0;
      igMediaAgg.ig_comments += m.comments_count || 0;
      igMediaAgg.ig_saves += m.saved || 0;
      igMediaAgg.ig_shares += m.shares || 0;
      if (m.media_type === 'VIDEO') igMediaAgg.ig_reels_published++;
      else igMediaAgg.ig_posts++;

      if (topPosts.length < 5) {
        topPosts.push({
          platform: 'ig',
          url: m.permalink,
          caption: m.caption?.substring(0, 120) || '',
          likes: m.like_count || 0,
          comments: m.comments_count || 0,
          reach: m.reach || 0,
          saves: m.saved || 0,
          type: m.media_type,
        });
      }
    }
  }

  // 9. Get previous month's report for comparison
  const prevMonthIdx = monthIdx === 0 ? 11 : monthIdx - 1;
  const prevYear = monthIdx === 0 ? year - 1 : year;
  const prevMonth = MONTHS[prevMonthIdx];

  const { data: prevReport } = await supabaseAdmin
    .from('reports')
    .select('*')
    .eq('client_id', clientId)
    .eq('month', prevMonth)
    .eq('year', prevYear)
    .single();

  // 10. Build current data object for Claude
  const current = {
    month,
    year,
    // Meta ad metrics
    meta_spend: agg.total_spend.toFixed(2),
    meta_impressions: agg.total_impressions,
    meta_reach: agg.total_reach,
    meta_clicks: agg.total_clicks,
    meta_ctr: agg.avg_ctr.toFixed(2),
    meta_cpm: agg.avg_cpm.toFixed(2),
    meta_conversions: agg.total_conversions,
    meta_roas: agg.avg_roas.toFixed(2),
    meta_campaigns_active: campaigns ? campaigns.filter(c => c.status === 'active').length : 0,
    meta_total_campaigns: campaigns ? campaigns.length : 0,
    // Instagram organic metrics
    ig_followers: igAgg.ig_followers,
    ig_new_followers: igAgg.ig_new_followers || 0,
    ig_reach: igAgg.ig_reach,
    ig_views: igAgg.ig_views,
    ig_profile_visits: igAgg.ig_profile_visits,
    ig_website_taps: igAgg.ig_website_taps,
    ig_likes: igMediaAgg.ig_likes,
    ig_comments: igMediaAgg.ig_comments,
    ig_shares: igMediaAgg.ig_shares,
    ig_saves: igMediaAgg.ig_saves,
    ig_posts: igMediaAgg.ig_posts,
    ig_reels_published: igMediaAgg.ig_reels_published,
  };

  // 11. Generate narrative via Claude
  const narrative = await generateNarrative(client.name, current, prevReport, client.industry);

  // 12. Build slug
  const slug = `${client.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${month.toLowerCase()}-${year}`;

  // 13. Save report
  const reportPayload = {
    client_id: clientId,
    org_id: orgId,
    month,
    year: parseInt(year),
    published: false,
    share_slug: slug,
    platforms: JSON.stringify(['ig']),
    top_posts: JSON.stringify(topPosts),
    ig_handle: client.ig_handle || '',
    // AI insights
    ai_summary: narrative.summary || '',
    ai_ig_insight: narrative.ig_insight || '',
    ai_headline_win: narrative.headline_win || '',
    ai_watch_out: narrative.watch_out || '',
    narrative: narrative.summary || '',
    // Meta ad aggregates
    meta_spend: agg.total_spend,
    meta_impressions: agg.total_impressions,
    meta_reach: agg.total_reach,
    meta_clicks: agg.total_clicks,
    meta_ctr: parseFloat(agg.avg_ctr.toFixed(4)),
    meta_cpm: parseFloat(agg.avg_cpm.toFixed(4)),
    meta_conversions: agg.total_conversions,
    meta_roas: parseFloat(agg.avg_roas.toFixed(4)),
    // Instagram organic aggregates
    ig_followers: igAgg.ig_followers || null,
    ig_new_followers: igAgg.ig_new_followers || null,
    ig_reach: igAgg.ig_reach || null,
    ig_views: igAgg.ig_views || null,
    ig_profile_visits: igAgg.ig_profile_visits || null,
    ig_website_taps: igAgg.ig_website_taps || null,
    ig_likes: igMediaAgg.ig_likes || null,
    ig_comments: igMediaAgg.ig_comments || null,
    ig_shares: igMediaAgg.ig_shares || null,
    ig_saves: igMediaAgg.ig_saves || null,
    ig_posts: igMediaAgg.ig_posts || null,
    ig_reels_published: igMediaAgg.ig_reels_published || null,
  };

  const { data: saved, error: saveErr } = await supabaseAdmin
    .from('reports')
    .insert(reportPayload)
    .select()
    .single();

  if (saveErr) throw new ApiError(400, saveErr.message);

  return {
    report: saved,
    metrics_summary: agg,
    ig_summary: igAgg,
    campaigns_count: campaigns ? campaigns.length : 0,
  };
}
