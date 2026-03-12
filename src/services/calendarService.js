import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '../config/supabase.js';
import { ANTHROPIC_API_KEY } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';

const claude = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

/**
 * Get AI-powered campaign suggestions for the next 30-60 days,
 * tailored to each client's industry and location.
 */
export async function getCampaignSuggestions(orgId) {
  if (!claude) throw new ApiError(500, 'Anthropic API key not configured');

  // Get all clients for this user
  const { data: clients, error } = await supabaseAdmin
    .from('clients')
    .select('id, name, industry, location, target_audience')
    .eq('org_id', orgId);

  if (error) throw new ApiError(500, error.message);
  if (!clients || clients.length === 0) return [];

  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 60);

  const clientBriefs = clients.map(c =>
    `- ${c.name} (${c.industry || 'General'}${c.location ? `, ${c.location}` : ''}${c.target_audience ? `, audience: ${c.target_audience}` : ''})`
  ).join('\n');

  const prompt = `You are a Meta Ads campaign strategist for a digital marketing agency. Today is ${today.toISOString().split('T')[0]}.

Review the next 60 days and suggest campaign ideas for these clients:

${clientBriefs}

REQUIREMENTS:
- Suggest 2-3 campaign ideas per client
- Consider upcoming holidays, seasonal events, and industry-specific opportunities
- Each suggestion should include: client_name, title (short campaign name), date (suggested launch date YYYY-MM-DD), objective (awareness/traffic/conversions/engagement), and rationale (1-2 sentences)
- Be specific to each client's industry and audience
- Only suggest dates within the next 60 days

Return ONLY valid JSON array (no markdown):
[{"client_name":"...","title":"...","date":"YYYY-MM-DD","objective":"...","rationale":"..."},...]`;

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0]?.text || '[]';
  let suggestions;
  try {
    suggestions = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    throw new ApiError(500, 'Failed to parse AI suggestions');
  }

  // Map client_name back to client_id
  return suggestions.map(s => {
    const client = clients.find(c => c.name === s.client_name);
    return {
      ...s,
      client_id: client?.id || null,
      client_color: null, // frontend will resolve from client data
    };
  });
}
