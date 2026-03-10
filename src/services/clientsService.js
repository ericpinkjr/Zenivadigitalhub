import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

export async function listClients(ownerId) {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true });

  if (error) throw new ApiError(500, error.message);
  return data;
}

export async function createClient(ownerId, clientData) {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .insert({ ...clientData, owner_id: ownerId })
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function getClientById(ownerId, clientId) {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .eq('owner_id', ownerId)
    .single();

  if (error) throw new ApiError(404, 'Client not found');
  return data;
}

export async function updateClient(ownerId, clientId, updates) {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .update(updates)
    .eq('id', clientId)
    .eq('owner_id', ownerId)
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function deleteClient(ownerId, clientId) {
  const { error } = await supabaseAdmin
    .from('clients')
    .delete()
    .eq('id', clientId)
    .eq('owner_id', ownerId);

  if (error) throw new ApiError(400, error.message);
  return { success: true };
}

export async function getClientCampaigns(ownerId, clientId) {
  // Verify ownership first
  await getClientById(ownerId, clientId);

  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('client_id', clientId)
    .order('start_date', { ascending: false });

  if (error) throw new ApiError(500, error.message);
  return data;
}

export async function getClientCampaignMetrics(ownerId, clientId, { startDate, endDate } = {}) {
  // Verify ownership first
  await getClientById(ownerId, clientId);

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
