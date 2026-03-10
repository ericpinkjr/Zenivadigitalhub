import { supabaseAdmin } from '../config/supabase.js';
import { META_ACCESS_TOKEN } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';

const META_API_BASE = 'https://graph.facebook.com/v19.0';

async function metaFetch(endpoint, params = {}) {
  const url = new URL(`${META_API_BASE}${endpoint}`);
  url.searchParams.set('access_token', META_ACCESS_TOKEN);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, val);
  }

  const res = await fetch(url.toString());
  const json = await res.json();

  if (json.error) {
    throw new ApiError(502, `Meta API error: ${json.error.message}`);
  }
  return json;
}

// Fetch all campaigns for an ad account
async function fetchCampaigns(adAccountId) {
  const data = await metaFetch(`/${adAccountId}/campaigns`, {
    fields: 'id,name,objective,status,start_time,stop_time,daily_budget,lifetime_budget',
    limit: '100',
  });
  return data.data || [];
}

// Fetch daily insights for a single campaign
async function fetchCampaignInsights(campaignId, since, until) {
  const data = await metaFetch(`/${campaignId}/insights`, {
    fields: 'impressions,reach,clicks,spend,ctr,cpm,actions,action_values',
    time_range: JSON.stringify({ since, until }),
    time_increment: '1',
    limit: '100',
  });
  return data.data || [];
}

// Map Meta campaign status to our status
function mapStatus(metaStatus) {
  const map = { ACTIVE: 'active', PAUSED: 'paused', ARCHIVED: 'completed' };
  return map[metaStatus] || 'draft';
}

// Extract conversions count from Meta actions array
function extractConversions(actions) {
  if (!actions) return 0;
  const conversionTypes = ['offsite_conversion', 'lead', 'purchase', 'complete_registration'];
  let total = 0;
  for (const action of actions) {
    if (conversionTypes.some(t => action.action_type?.includes(t))) {
      total += parseInt(action.value, 10) || 0;
    }
  }
  return total;
}

// Extract ROAS from action_values array
function extractRoas(actionValues, spend) {
  if (!actionValues || !spend || parseFloat(spend) === 0) return 0;
  let totalValue = 0;
  for (const av of actionValues) {
    if (av.action_type?.includes('purchase') || av.action_type?.includes('offsite_conversion')) {
      totalValue += parseFloat(av.value) || 0;
    }
  }
  return totalValue / parseFloat(spend);
}

// Run with concurrency limit
async function asyncPool(limit, items, fn) {
  const results = [];
  const executing = new Set();

  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean, clean);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

export async function syncClientMeta(clientId) {
  // 1. Get client's meta ad account ID
  const { data: client, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('meta_ad_account_id, name')
    .eq('id', clientId)
    .single();

  if (clientErr || !client) throw new ApiError(404, 'Client not found');
  if (!client.meta_ad_account_id) throw new ApiError(400, 'Client has no Meta ad account linked');

  if (!META_ACCESS_TOKEN) throw new ApiError(500, 'Meta access token not configured');

  const adAccountId = client.meta_ad_account_id;

  // 2. Fetch campaigns from Meta
  const metaCampaigns = await fetchCampaigns(adAccountId);

  // 3. Upsert campaigns into our DB
  let campaignsSynced = 0;
  const campaignMap = {}; // meta_campaign_id -> our campaign UUID

  for (const mc of metaCampaigns) {
    const budget = mc.daily_budget
      ? parseFloat(mc.daily_budget) / 100
      : mc.lifetime_budget
        ? parseFloat(mc.lifetime_budget) / 100
        : null;

    const campaignData = {
      client_id: clientId,
      name: mc.name,
      objective: mc.objective || null,
      start_date: mc.start_time ? mc.start_time.split('T')[0] : null,
      end_date: mc.stop_time ? mc.stop_time.split('T')[0] : null,
      budget,
      status: mapStatus(mc.status),
      meta_campaign_id: mc.id,
    };

    // Check if campaign already exists
    const { data: existing } = await supabaseAdmin
      .from('campaigns')
      .select('id')
      .eq('meta_campaign_id', mc.id)
      .eq('client_id', clientId)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from('campaigns')
        .update(campaignData)
        .eq('id', existing.id);
      campaignMap[mc.id] = existing.id;
    } else {
      const { data: created } = await supabaseAdmin
        .from('campaigns')
        .insert(campaignData)
        .select('id')
        .single();
      if (created) campaignMap[mc.id] = created.id;
    }
    campaignsSynced++;
  }

  // 4. Fetch insights for each campaign (last 30 days)
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const since = thirtyDaysAgo.toISOString().split('T')[0];
  const until = now.toISOString().split('T')[0];

  let metricsSynced = 0;

  await asyncPool(3, metaCampaigns, async (mc) => {
    const ourCampaignId = campaignMap[mc.id];
    if (!ourCampaignId) return;

    try {
      const insights = await fetchCampaignInsights(mc.id, since, until);

      for (const day of insights) {
        const spend = parseFloat(day.spend) || 0;

        const metricRow = {
          campaign_id: ourCampaignId,
          date: day.date_start,
          impressions: parseInt(day.impressions, 10) || 0,
          reach: parseInt(day.reach, 10) || 0,
          clicks: parseInt(day.clicks, 10) || 0,
          spend,
          ctr: parseFloat(day.ctr) || 0,
          cpm: parseFloat(day.cpm) || 0,
          conversions: extractConversions(day.actions),
          roas: extractRoas(day.action_values, day.spend),
          raw_response: day,
        };

        // Upsert using the unique constraint (campaign_id, date)
        const { data: existingMetric } = await supabaseAdmin
          .from('campaign_metrics')
          .select('id')
          .eq('campaign_id', ourCampaignId)
          .eq('date', day.date_start)
          .maybeSingle();

        if (existingMetric) {
          await supabaseAdmin
            .from('campaign_metrics')
            .update({ ...metricRow, synced_at: new Date().toISOString() })
            .eq('id', existingMetric.id);
        } else {
          await supabaseAdmin
            .from('campaign_metrics')
            .insert(metricRow);
        }

        metricsSynced++;
      }
    } catch (err) {
      console.error(`[META] Failed to sync insights for campaign ${mc.name}:`, err.message);
    }
  });

  return {
    client_name: client.name,
    campaigns_synced: campaignsSynced,
    metrics_synced: metricsSynced,
  };
}
