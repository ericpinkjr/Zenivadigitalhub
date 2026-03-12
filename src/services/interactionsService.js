import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

export async function logInteraction(orgId, data) {
  const row = {
    org_id: orgId,
    lead_id: data.lead_id || null,
    client_id: data.client_id || null,
    type: data.type,
    notes: data.notes || null,
    outcome: data.outcome || null,
    follow_up_required: data.follow_up_required || false,
    follow_up_date: data.follow_up_date || null,
    logged_by: data.logged_by || null,
  };

  if (!row.lead_id && !row.client_id) {
    throw new ApiError(400, 'An interaction must be linked to a lead or client');
  }

  const { data: interaction, error } = await supabaseAdmin
    .from('interactions')
    .insert(row)
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);

  // If follow-up required, update the lead's next_follow_up_date
  if (row.follow_up_required && row.follow_up_date && row.lead_id) {
    await supabaseAdmin
      .from('leads')
      .update({
        next_follow_up_date: row.follow_up_date,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.lead_id)
      .eq('org_id', orgId);
  }

  return interaction;
}

export async function getInteractions(orgId, { leadId, clientId } = {}) {
  let query = supabaseAdmin
    .from('interactions')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (leadId) query = query.eq('lead_id', leadId);
  if (clientId) query = query.eq('client_id', clientId);

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);
  return data;
}

export async function getFollowUps(orgId) {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabaseAdmin
    .from('interactions')
    .select('*, leads(business_name, status)')
    .eq('org_id', orgId)
    .eq('follow_up_required', true)
    .lte('follow_up_date', today)
    .order('follow_up_date', { ascending: true });

  if (error) throw new ApiError(500, error.message);
  return data;
}
