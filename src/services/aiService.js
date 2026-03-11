import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '../config/env.js';

const client = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

function parseNum(v) {
  if (v == null || v === '') return 0;
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : Number(v);
  return isNaN(n) ? 0 : n;
}

function igErCalc(likes, comments, shares, saves, reach) {
  const r = parseNum(reach);
  if (!r) return null;
  return ((parseNum(likes) + parseNum(comments) + parseNum(shares) + parseNum(saves)) / r) * 100;
}

// Industry benchmarks for actively engaged pages (reach-based ER)
// These reflect realistic averages for pages that post consistently
const BENCHMARKS = {
  "Fashion / Apparel": { ig_er: 4.0 },
  "Beauty / Cosmetics": { ig_er: 4.5 },
  "Food & Beverage": { ig_er: 5.5 },
  "Fitness / Health": { ig_er: 5.0 },
  "Real Estate": { ig_er: 3.5 },
  "E-Commerce (General)": { ig_er: 3.8 },
  "Faith / Ministry": { ig_er: 6.0 },
  "Music / Entertainment": { ig_er: 5.0 },
  "Tech / SaaS": { ig_er: 3.5 },
  "Other": { ig_er: 4.0 },
};

export async function generateNarrative(clientName, cur, prev, industry) {
  if (!client) {
    return { summary: 'Anthropic API key not configured', ig_insight: '', headline_win: '', watch_out: '' };
  }

  const igER = igErCalc(cur.ig_likes, cur.ig_comments, cur.ig_shares, cur.ig_saves, cur.ig_reach);
  const bm = BENCHMARKS[industry] || BENCHMARKS['Other'];

  const igViews = parseNum(cur.ig_views);
  const igNewFollowers = parseNum(cur.ig_new_followers);
  const igTotalInteractions = parseNum(cur.ig_likes) + parseNum(cur.ig_comments) + parseNum(cur.ig_shares) + parseNum(cur.ig_saves);
  const igConversions = parseNum(cur.ig_website_taps) + parseNum(cur.ig_profile_visits);

  const metaSpend = parseFloat(cur.meta_spend) || 0;

  // Build prompt sections
  let promptSections = `You are a senior digital marketing strategist writing a monthly performance summary.
Client: ${clientName} | Industry: ${industry || 'General'} | Period: ${cur.month} ${cur.year}
${prev ? `Previous: ${prev.month} ${prev.year}` : 'Baseline month.'}

INSTAGRAM ORGANIC:
Followers: ${cur.ig_followers || 0}${prev ? ` (was ${prev.ig_followers || 0})` : ''}${igNewFollowers ? `, +${igNewFollowers} new this month` : ''}
Visibility: Accounts Reached ${cur.ig_reach || 0}, Impressions ${igViews}
Engagement: Total Interactions ${igTotalInteractions}, ER ${igER ? igER.toFixed(2) + '%' : 'n/a'} (industry avg ${bm.ig_er}%), Shares ${cur.ig_shares || 0}, Saves ${cur.ig_saves || 0}
Conversions: Profile Visits ${cur.ig_profile_visits || 0}, Website Taps ${cur.ig_website_taps || 0}${igConversions ? ` (${igConversions} total intent actions)` : ''}
Content: ${cur.ig_posts || 0} posts, ${cur.ig_reels_published || 0} reels published`;

  if (metaSpend > 0) {
    promptSections += `

META ADS PERFORMANCE:
Spend: $${cur.meta_spend}, Impressions: ${cur.meta_impressions || 0}, Reach: ${cur.meta_reach || 0}
Clicks: ${cur.meta_clicks || 0}, CTR: ${cur.meta_ctr}%, CPM: $${cur.meta_cpm}
Conversions: ${cur.meta_conversions || 0}, ROAS: ${cur.meta_roas}x
Active Campaigns: ${cur.meta_campaigns_active || 0} of ${cur.meta_total_campaigns || 0}`;
  }

  promptSections += `

Return ONLY JSON (no markdown): {"summary":"2-3 sentences executive summary with real numbers and benchmark comparison","ig_insight":"1-2 sentences IG insight focused on growth, engagement, and conversions + recommendation"${metaSpend > 0 ? ',"ads_insight":"1-2 sentences on ad performance, spend efficiency, and ROAS"' : ''},"headline_win":"One sentence biggest win this month","watch_out":"One sentence biggest risk or area to improve"}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: promptSections }],
  });

  const text = response.content[0]?.text || '{}';
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    return { summary: text, ig_insight: '', headline_win: '', watch_out: '' };
  }
}
