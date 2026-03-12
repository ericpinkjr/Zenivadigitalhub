import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

export async function createProposal(orgId, data) {
  // Verify lead ownership
  const { error: leadErr } = await supabaseAdmin
    .from('leads')
    .select('id')
    .eq('id', data.lead_id)
    .eq('org_id', orgId)
    .single();

  if (leadErr) throw new ApiError(404, 'Lead not found');

  const row = {
    org_id: orgId,
    lead_id: data.lead_id,
    service_type: data.service_type || null,
    monthly_value: data.monthly_value || null,
    status: 'draft',
    notes: data.notes || null,
  };

  const { data: proposal, error } = await supabaseAdmin
    .from('proposals')
    .insert(row)
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);

  // Auto-update lead status to proposal-sent
  await supabaseAdmin
    .from('leads')
    .update({ status: 'proposal-sent', updated_at: new Date().toISOString() })
    .eq('id', data.lead_id)
    .eq('org_id', orgId);

  return proposal;
}

export async function updateProposal(orgId, proposalId, updates) {
  const { data: proposal, error: findErr } = await supabaseAdmin
    .from('proposals')
    .select('*')
    .eq('id', proposalId)
    .eq('org_id', orgId)
    .single();

  if (findErr || !proposal) throw new ApiError(404, 'Proposal not found');

  const allowed = ['service_type', 'monthly_value', 'status', 'notes'];
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  );

  // Set timestamps based on status changes
  if (filtered.status === 'sent' && proposal.status !== 'sent') {
    filtered.sent_at = new Date().toISOString();
  }
  if ((filtered.status === 'accepted' || filtered.status === 'declined') && !proposal.responded_at) {
    filtered.responded_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from('proposals')
    .update(filtered)
    .eq('id', proposalId)
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function getProposals(orgId, { leadId, status } = {}) {
  let query = supabaseAdmin
    .from('proposals')
    .select('*, leads(business_name)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (leadId) query = query.eq('lead_id', leadId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);
  return data;
}
