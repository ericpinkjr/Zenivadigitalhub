import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

export async function getLeads(ownerId, { status, source, industry, assignedTo } = {}) {
  let query = supabaseAdmin
    .from('leads')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('is_deleted', false)
    .order('updated_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (source) query = query.eq('source', source);
  if (industry) query = query.ilike('industry', `%${industry}%`);
  if (assignedTo) query = query.eq('assigned_to', assignedTo);

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);
  return data;
}

export async function getLead(ownerId, leadId) {
  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .eq('owner_id', ownerId)
    .single();

  if (error || !lead) throw new ApiError(404, 'Lead not found');

  // Fetch interactions
  const { data: interactions } = await supabaseAdmin
    .from('interactions')
    .select('*')
    .eq('lead_id', leadId)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });

  // Fetch proposals
  const { data: proposals } = await supabaseAdmin
    .from('proposals')
    .select('*')
    .eq('lead_id', leadId)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });

  return { ...lead, interactions: interactions || [], proposals: proposals || [] };
}

export async function createLead(ownerId, data) {
  const row = {
    owner_id: ownerId,
    business_name: data.business_name,
    contact_name: data.contact_name || null,
    contact_email: data.contact_email || null,
    contact_phone: data.contact_phone || null,
    location: data.location || null,
    industry: data.industry || null,
    source: data.source || 'inbound',
    status: data.status || 'target',
    assigned_to: data.assigned_to || null,
    notes: data.notes || null,
    next_follow_up_date: data.next_follow_up_date || null,
  };

  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .insert(row)
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return lead;
}

export async function updateLead(ownerId, leadId, updates) {
  const { error: findErr } = await supabaseAdmin
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .eq('owner_id', ownerId)
    .single();

  if (findErr) throw new ApiError(404, 'Lead not found');

  const allowed = [
    'business_name', 'contact_name', 'contact_email', 'contact_phone',
    'location', 'industry', 'source', 'status', 'assigned_to',
    'notes', 'next_follow_up_date',
  ];
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  );
  filtered.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('leads')
    .update(filtered)
    .eq('id', leadId)
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function deleteLead(ownerId, leadId) {
  const { error: findErr } = await supabaseAdmin
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .eq('owner_id', ownerId)
    .single();

  if (findErr) throw new ApiError(404, 'Lead not found');

  // Soft delete
  const { error } = await supabaseAdmin
    .from('leads')
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', leadId);

  if (error) throw new ApiError(400, error.message);
  return { success: true };
}

/**
 * Convert a won lead to a client record.
 * Creates the client, sets converted_client_id on the lead,
 * and creates an onboarding checklist.
 */
export async function convertLeadToClient(ownerId, leadId) {
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .eq('owner_id', ownerId)
    .single();

  if (leadErr || !lead) throw new ApiError(404, 'Lead not found');

  if (lead.converted_client_id) {
    throw new ApiError(400, 'Lead has already been converted to a client');
  }

  // Create client record
  const { data: client, error: clientErr } = await supabaseAdmin
    .from('clients')
    .insert({
      owner_id: ownerId,
      name: lead.business_name,
      industry: lead.industry || null,
      location: lead.location || null,
      contact_name: lead.contact_name || null,
      contact_email: lead.contact_email || null,
      contact_phone: lead.contact_phone || null,
      relationship_status: 'active',
    })
    .select()
    .single();

  if (clientErr) throw new ApiError(400, 'Failed to create client: ' + clientErr.message);

  // Update lead
  await supabaseAdmin
    .from('leads')
    .update({
      status: 'won',
      converted_client_id: client.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);

  // Create onboarding checklist
  await supabaseAdmin
    .from('onboarding_checklists')
    .insert({ client_id: client.id });

  return client;
}
