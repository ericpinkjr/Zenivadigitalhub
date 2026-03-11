import { supabaseAdmin } from '../config/supabase.js';
import { generateNarrative } from './aiService.js';
import { ApiError } from '../utils/apiError.js';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/**
 * Auto-generate a report for a client by pulling campaign_metrics
 * from Supabase for the given month/year, aggregating them, sending
 * to Claude for a narrative, and saving the report.
 */
export async function generateReport(ownerId, clientId, month, year) {
  // 1. Get client
  const { data: client, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .eq('owner_id', ownerId)
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

  // 5. Get metrics for the month
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

  // 6. Aggregate metrics
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

  // 7. Get previous month's report for comparison
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

  // 8. Build current data object for Claude (merging campaign metrics + any social data)
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
  };

  // 9. Generate narrative via Claude
  const narrative = await generateNarrative(client.name, current, prevReport, client.industry);

  // 10. Build slug
  const slug = `${client.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${month.toLowerCase()}-${year}`;

  // 11. Save report
  const reportPayload = {
    client_id: clientId,
    owner_id: ownerId,
    month,
    year: parseInt(year),
    published: false,
    share_slug: slug,
    ai_summary: narrative.summary || '',
    ai_ig_insight: narrative.ig_insight || '',
    ai_tk_insight: narrative.tk_insight || '',
    ai_headline_win: narrative.headline_win || '',
    ai_watch_out: narrative.watch_out || '',
    narrative: narrative.summary || '',
    // Store aggregated campaign metrics in the report
    meta_spend: agg.total_spend,
    meta_impressions: agg.total_impressions,
    meta_reach: agg.total_reach,
    meta_clicks: agg.total_clicks,
    meta_ctr: parseFloat(agg.avg_ctr.toFixed(4)),
    meta_cpm: parseFloat(agg.avg_cpm.toFixed(4)),
    meta_conversions: agg.total_conversions,
    meta_roas: parseFloat(agg.avg_roas.toFixed(4)),
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
    campaigns_count: campaigns ? campaigns.length : 0,
  };
}
