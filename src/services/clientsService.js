import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

export async function listClients(orgId) {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });

  if (error) throw new ApiError(500, error.message);
  return data;
}

export async function createClient(orgId, userId, clientData) {
  // Strip empty strings → null so Postgres doesn't reject type mismatches (e.g. invoice_day expects int)
  const cleaned = Object.fromEntries(
    Object.entries(clientData).map(([k, v]) => [k, v === '' ? null : v])
  );

  const { data, error } = await supabaseAdmin
    .from('clients')
    .insert({ ...cleaned, org_id: orgId, owner_id: userId })
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function getClientById(orgId, clientId) {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .eq('org_id', orgId)
    .single();

  if (error) throw new ApiError(404, 'Client not found');
  return data;
}

export async function updateClient(orgId, clientId, updates) {
  const cleaned = Object.fromEntries(
    Object.entries(updates).map(([k, v]) => [k, v === '' ? null : v])
  );

  const { data, error } = await supabaseAdmin
    .from('clients')
    .update(cleaned)
    .eq('id', clientId)
    .eq('org_id', orgId)
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function deleteClient(orgId, clientId) {
  const { error } = await supabaseAdmin
    .from('clients')
    .delete()
    .eq('id', clientId)
    .eq('org_id', orgId);

  if (error) throw new ApiError(400, error.message);
  return { success: true };
}

export async function getClientCampaigns(orgId, clientId) {
  // Verify ownership first
  await getClientById(orgId, clientId);

  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('client_id', clientId)
    .order('start_date', { ascending: false });

  if (error) throw new ApiError(500, error.message);
  return data;
}

export async function getClientCampaignMetrics(orgId, clientId, { startDate, endDate } = {}) {
  // Verify ownership first
  await getClientById(orgId, clientId);

  // Get all campaign IDs for this client
  const { data: campaigns, error: campError } = await supabaseAdmin
    .from('campaigns')
    .select('id')
    .eq('client_id', clientId);

  if (campError) throw new ApiError(500, campError.message);
  if (!campaigns.length) return [];

  const campaignIds = campaigns.map(c => c.id);

  let query = supabaseAdmin
    .from('campaign_metrics')
    .select('*, campaigns(name, status)')
    .in('campaign_id', campaignIds)
    .order('date', { ascending: false });

  if (startDate) query = query.gte('date', startDate);
  if (endDate) query = query.lte('date', endDate);

  const { data, error } = await query;

  if (error) throw new ApiError(500, error.message);
  return data;
}

export async function getClientIgMetrics(orgId, clientId, { startDate, endDate } = {}) {
  await getClientById(orgId, clientId);

  let accountQuery = supabaseAdmin
    .from('ig_account_metrics')
    .select('*')
    .eq('client_id', clientId)
    .order('date', { ascending: true });
  if (startDate) accountQuery = accountQuery.gte('date', startDate);
  if (endDate) accountQuery = accountQuery.lte('date', endDate);
  const { data: account, error: accErr } = await accountQuery;
  if (accErr) throw new ApiError(500, accErr.message);

  let mediaQuery = supabaseAdmin
    .from('ig_media_metrics')
    .select('*')
    .eq('client_id', clientId)
    .order('like_count', { ascending: false })
    .limit(20);
  if (startDate) mediaQuery = mediaQuery.gte('timestamp', startDate);
  if (endDate) mediaQuery = mediaQuery.lte('timestamp', endDate);
  const { data: media, error: mediaErr } = await mediaQuery;
  if (mediaErr) throw new ApiError(500, mediaErr.message);

  const latest = account && account.length > 0 ? account[account.length - 1] : null;
  return {
    account: account || [],
    media: media || [],
    profile: latest ? { followers_count: latest.followers_count, media_count: latest.media_count } : null,
  };
}
