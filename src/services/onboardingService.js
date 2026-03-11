import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

const CHECKLIST_STEPS = [
  'contract_signed',
  'intake_form_received',
  'kickoff_call_scheduled',
  'kickoff_call_completed',
  'brief_filled_in',
  'meta_account_connected',
  'first_report_generated',
  'onboarding_complete',
];

export async function getChecklist(ownerId, clientId) {
  // Verify ownership
  const { error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('owner_id', ownerId)
    .single();

  if (clientErr) throw new ApiError(404, 'Client not found');

  const { data, error } = await supabaseAdmin
    .from('onboarding_checklists')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle();

  if (error) throw new ApiError(500, error.message);
  return data;
}

export async function updateChecklist(ownerId, clientId, updates) {
  // Verify ownership
  const { error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('owner_id', ownerId)
    .single();

  if (clientErr) throw new ApiError(404, 'Client not found');

  // Build filtered updates — only allow checklist step fields
  const filtered = {};
  for (const step of CHECKLIST_STEPS) {
    if (step in updates) {
      filtered[step] = updates[step];
      // Auto-set timestamp when checking a step
      if (updates[step] === true) {
        filtered[`${step}_at`] = new Date().toISOString();
      } else if (updates[step] === false) {
        filtered[`${step}_at`] = null;
      }
    }
  }

  if (Object.keys(filtered).length === 0) {
    throw new ApiError(400, 'No valid checklist fields to update');
  }

  const { data, error } = await supabaseAdmin
    .from('onboarding_checklists')
    .update(filtered)
    .eq('client_id', clientId)
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);

  // If onboarding is complete, update client relationship status
  if (data.onboarding_complete) {
    await supabaseAdmin
      .from('clients')
      .update({ relationship_status: 'active' })
      .eq('id', clientId);
  }

  return data;
}

export async function getOnboardingOverview(ownerId) {
  // Get all clients owned by user that have onboarding checklists
  const { data: clients, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id, name, industry, brand_color')
    .eq('owner_id', ownerId);

  if (clientErr) throw new ApiError(500, clientErr.message);
  if (!clients || clients.length === 0) return [];

  const clientIds = clients.map(c => c.id);

  const { data: checklists, error } = await supabaseAdmin
    .from('onboarding_checklists')
    .select('*')
    .in('client_id', clientIds);

  if (error) throw new ApiError(500, error.message);

  // Merge client info with checklist data
  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));

  return (checklists || []).map(cl => {
    const completedSteps = CHECKLIST_STEPS.filter(s => cl[s] === true).length;
    return {
      ...cl,
      client: clientMap[cl.client_id] || null,
      completed_steps: completedSteps,
      total_steps: CHECKLIST_STEPS.length,
      progress: Math.round((completedSteps / CHECKLIST_STEPS.length) * 100),
    };
  });
}
