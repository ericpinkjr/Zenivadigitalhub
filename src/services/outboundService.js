import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '../config/supabase.js';
import { ANTHROPIC_API_KEY } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';

const claude = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

export async function getTargets(orgId, { month, status } = {}) {
  let query = supabaseAdmin
    .from('outbound_targets')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (month) query = query.eq('month_targeted', month);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);
  return data;
}

export async function createTarget(orgId, data) {
  const row = {
    org_id: orgId,
    business_name: data.business_name,
    contact_name: data.contact_name || null,
    contact_email: data.contact_email || null,
    contact_phone: data.contact_phone || null,
    location: data.location || null,
    industry: data.industry || null,
    added_by: data.added_by || null,
    month_targeted: data.month_targeted || null,
    status: 'not-contacted',
  };

  const { data: target, error } = await supabaseAdmin
    .from('outbound_targets')
    .insert(row)
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return target;
}

export async function updateTarget(orgId, targetId, updates) {
  const { error: findErr } = await supabaseAdmin
    .from('outbound_targets')
    .select('id')
    .eq('id', targetId)
    .eq('org_id', orgId)
    .single();

  if (findErr) throw new ApiError(404, 'Target not found');

  const allowed = [
    'business_name', 'contact_name', 'contact_email', 'contact_phone',
    'location', 'industry', 'month_targeted', 'status', 'outreach_draft',
  ];
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  );

  const { data, error } = await supabaseAdmin
    .from('outbound_targets')
    .update(filtered)
    .eq('id', targetId)
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function convertTargetToLead(orgId, targetId) {
  const { data: target, error: targetErr } = await supabaseAdmin
    .from('outbound_targets')
    .select('*')
    .eq('id', targetId)
    .eq('org_id', orgId)
    .single();

  if (targetErr || !target) throw new ApiError(404, 'Target not found');

  // Create lead from target data
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from('leads')
    .insert({
      org_id: orgId,
      business_name: target.business_name,
      contact_name: target.contact_name,
      contact_email: target.contact_email,
      contact_phone: target.contact_phone,
      location: target.location,
      industry: target.industry,
      source: 'outbound',
      status: 'contacted',
    })
    .select()
    .single();

  if (leadErr) throw new ApiError(400, 'Failed to create lead: ' + leadErr.message);

  // Update target status
  await supabaseAdmin
    .from('outbound_targets')
    .update({ status: 'converted-to-lead' })
    .eq('id', targetId);

  return lead;
}

export async function draftOutreach(orgId, targetId) {
  if (!claude) throw new ApiError(500, 'Anthropic API key not configured');

  const { data: target, error } = await supabaseAdmin
    .from('outbound_targets')
    .select('*')
    .eq('id', targetId)
    .eq('org_id', orgId)
    .single();

  if (error || !target) throw new ApiError(404, 'Target not found');

  const prompt = `You are a digital marketing agency outreach specialist. Write a personalized first outreach message (DM or email) to this business prospect.

TARGET BUSINESS:
- Business Name: ${target.business_name}
- Industry: ${target.industry || 'Not specified'}
- Location: ${target.location || 'Not specified'}
- Contact Name: ${target.contact_name || 'Business Owner'}

REQUIREMENTS:
- Keep it short (3-5 sentences max)
- Be genuine and conversational, not salesy
- Reference something specific about their industry or location
- Mention one way you could help their business grow online
- End with a soft call to action (question, not a demand)
- Do NOT use generic templates or clichés

Return ONLY the message text, no subject line or formatting.`;

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  const draft = response.content[0]?.text || '';

  // Save draft to target record
  await supabaseAdmin
    .from('outbound_targets')
    .update({ outreach_draft: draft })
    .eq('id', targetId);

  return { draft };
}
