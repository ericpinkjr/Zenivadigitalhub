import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

export async function getDashboardSummary(ownerId) {
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = today.substring(0, 7); // "2026-03"

  // First fetch client IDs (needed for onboarding query)
  const clientsResult = await supabaseAdmin
    .from('clients')
    .select('id', { count: 'exact' })
    .eq('owner_id', ownerId);

  const clientIds = (clientsResult.data || []).map(c => c.id);

  // Run remaining queries in parallel
  const [
    leadsResult,
    followUpsResult,
    onboardingResult,
    proposalsResult,
    outboundResult,
    reportsResult,
  ] = await Promise.all([
    // Leads by status
    supabaseAdmin
      .from('leads')
      .select('status')
      .eq('owner_id', ownerId)
      .eq('is_deleted', false),

    // Follow-ups due today or earlier
    supabaseAdmin
      .from('interactions')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId)
      .eq('follow_up_required', true)
      .lte('follow_up_date', today),

    // Clients in onboarding (not complete)
    clientIds.length > 0
      ? supabaseAdmin
          .from('onboarding_checklists')
          .select('client_id')
          .eq('onboarding_complete', false)
          .in('client_id', clientIds)
      : Promise.resolve({ data: [] }),

    // Accepted proposals for MRR
    supabaseAdmin
      .from('proposals')
      .select('monthly_value')
      .eq('owner_id', ownerId)
      .eq('status', 'accepted'),

    // Outbound targets this month
    supabaseAdmin
      .from('outbound_targets')
      .select('status')
      .eq('owner_id', ownerId)
      .eq('month_targeted', currentMonth),

    // Reports generated this month
    supabaseAdmin
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId)
      .gte('created_at', `${currentMonth}-01`),
  ]);

  // Calculate pipeline by stage
  const pipeline = {};
  for (const lead of (leadsResult.data || [])) {
    pipeline[lead.status] = (pipeline[lead.status] || 0) + 1;
  }

  // Calculate MRR from accepted proposals
  const mrr = (proposalsResult.data || [])
    .reduce((sum, p) => sum + (parseFloat(p.monthly_value) || 0), 0);

  // Outbound stats
  const outboundTotal = (outboundResult.data || []).length;
  const outboundContacted = (outboundResult.data || [])
    .filter(t => t.status !== 'not-contacted').length;

  return {
    active_clients: clientsResult.count || 0,
    mrr: parseFloat(mrr.toFixed(2)),
    pipeline,
    total_leads: (leadsResult.data || []).length,
    follow_ups_due: followUpsResult.count || 0,
    clients_in_onboarding: (onboardingResult.data || []).length,
    outbound_this_month: {
      total: outboundTotal,
      contacted: outboundContacted,
    },
    reports_this_month: reportsResult.count || 0,
  };
}
