import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '../config/supabase.js';
import { ANTHROPIC_API_KEY } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';

const claude = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

/**
 * Generate ad copy variants for a client using their creative brief.
 * Returns 3-5 headline/primary_text/cta combos, saves them to ad_copy table.
 */
export async function generateCopy(ownerId, clientId, { campaignId, campaignGoal, currentOffer, tone } = {}) {
  // 1. Get client brief
  const { data: client, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .eq('owner_id', ownerId)
    .single();

  if (clientErr || !client) throw new ApiError(404, 'Client not found');

  if (!client.target_audience && !client.brand_voice_notes) {
    throw new ApiError(400, 'Client needs a target audience or brand voice notes before generating copy. Update the client profile first.');
  }

  if (!claude) {
    throw new ApiError(500, 'Anthropic API key not configured');
  }

  // 2. Build the prompt
  const prompt = `You are an expert Meta Ads copywriter. Generate ad copy variants for this client.

CLIENT BRIEF:
- Business: ${client.name}
- Industry: ${client.industry || 'General'}
- Location: ${client.location || 'Not specified'}
- Target Audience: ${client.target_audience || 'General audience'}
- Brand Voice: ${client.brand_voice_notes || 'Professional and engaging'}
${currentOffer ? `- Current Offer: ${currentOffer}` : ''}
${campaignGoal ? `- Campaign Goal: ${campaignGoal}` : ''}
${tone ? `- Desired Tone: ${tone}` : ''}

REQUIREMENTS:
- Generate exactly 5 ad copy variants
- Each variant has: headline (max 40 chars), primary_text (max 125 chars for feed), and cta (one of: Learn More, Shop Now, Sign Up, Book Now, Get Offer, Contact Us, Get Quote, Subscribe)
- Make each variant distinct in angle/approach
- Use the brand voice consistently
- Include a clear value proposition
- Variants should range from direct/urgent to storytelling/emotional

Return ONLY valid JSON array (no markdown):
[{"headline":"...","primary_text":"...","cta":"..."},...]`;

  // 3. Call Claude
  const response = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0]?.text || '[]';
  let variants;
  try {
    variants = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    throw new ApiError(500, 'Failed to parse AI response');
  }

  if (!Array.isArray(variants) || variants.length === 0) {
    throw new ApiError(500, 'AI returned no copy variants');
  }

  // 4. Save all variants to ad_copy table
  const rows = variants.map(v => ({
    client_id: clientId,
    campaign_id: campaignId || null,
    headline: v.headline || '',
    primary_text: v.primary_text || '',
    cta: v.cta || 'Learn More',
    status: 'draft',
  }));

  const { data: saved, error: saveErr } = await supabaseAdmin
    .from('ad_copy')
    .insert(rows)
    .select();

  if (saveErr) throw new ApiError(400, saveErr.message);

  return saved;
}

/**
 * List all ad copy for a client, optionally filtered by status or campaign.
 */
export async function listCopy(ownerId, clientId, { status, campaignId } = {}) {
  // Verify ownership
  const { error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('owner_id', ownerId)
    .single();

  if (clientErr) throw new ApiError(404, 'Client not found');

  let query = supabaseAdmin
    .from('ad_copy')
    .select('*, campaigns(name)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (campaignId) query = query.eq('campaign_id', campaignId);

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);
  return data;
}

/**
 * Update a single ad copy variant (edit text or change status).
 */
export async function updateCopy(ownerId, copyId, updates) {
  // Get the copy to verify ownership chain
  const { data: copy, error: copyErr } = await supabaseAdmin
    .from('ad_copy')
    .select('client_id')
    .eq('id', copyId)
    .single();

  if (copyErr || !copy) throw new ApiError(404, 'Copy not found');

  // Verify client ownership
  const { error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('id', copy.client_id)
    .eq('owner_id', ownerId)
    .single();

  if (clientErr) throw new ApiError(403, 'Not authorized');

  const allowed = ['headline', 'primary_text', 'cta', 'status', 'campaign_id'];
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  );

  const { data, error } = await supabaseAdmin
    .from('ad_copy')
    .update(filtered)
    .eq('id', copyId)
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}

/**
 * Duplicate a copy variant as a new draft.
 */
export async function duplicateCopy(ownerId, copyId) {
  const { data: original, error: origErr } = await supabaseAdmin
    .from('ad_copy')
    .select('*')
    .eq('id', copyId)
    .single();

  if (origErr || !original) throw new ApiError(404, 'Copy not found');

  // Verify ownership
  const { error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('id', original.client_id)
    .eq('owner_id', ownerId)
    .single();

  if (clientErr) throw new ApiError(403, 'Not authorized');

  const { data, error } = await supabaseAdmin
    .from('ad_copy')
    .insert({
      client_id: original.client_id,
      campaign_id: original.campaign_id,
      headline: original.headline,
      primary_text: original.primary_text,
      cta: original.cta,
      status: 'draft',
    })
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}

/**
 * Delete a copy variant.
 */
export async function deleteCopy(ownerId, copyId) {
  const { data: copy, error: copyErr } = await supabaseAdmin
    .from('ad_copy')
    .select('client_id')
    .eq('id', copyId)
    .single();

  if (copyErr || !copy) throw new ApiError(404, 'Copy not found');

  const { error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('id', copy.client_id)
    .eq('owner_id', ownerId)
    .single();

  if (clientErr) throw new ApiError(403, 'Not authorized');

  const { error } = await supabaseAdmin
    .from('ad_copy')
    .delete()
    .eq('id', copyId);

  if (error) throw new ApiError(400, error.message);
  return { success: true };
}
