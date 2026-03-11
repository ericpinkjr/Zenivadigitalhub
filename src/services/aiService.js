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

function tkErCalc(likes, comments, shares, views) {
  const v = parseNum(views);
  if (!v) return null;
  return ((parseNum(likes) + parseNum(comments) + parseNum(shares)) / v) * 100;
}

// Industry benchmark defaults (mirrors frontend)
const BENCHMARKS = {
  "Fashion / Apparel": { ig_er: 1.5, tk_er: 5.0 },
  "Beauty / Cosmetics": { ig_er: 1.8, tk_er: 5.5 },
  "Food & Beverage": { ig_er: 2.0, tk_er: 6.0 },
  "Fitness / Health": { ig_er: 2.2, tk_er: 5.0 },
  "Real Estate": { ig_er: 1.0, tk_er: 3.5 },
  "E-Commerce (General)": { ig_er: 1.2, tk_er: 4.0 },
  "Faith / Ministry": { ig_er: 2.5, tk_er: 6.5 },
  "Music / Entertainment": { ig_er: 2.0, tk_er: 7.0 },
  "Tech / SaaS": { ig_er: 0.8, tk_er: 3.0 },
  "Other": { ig_er: 1.5, tk_er: 4.5 },
};

export async function generateNarrative(clientName, cur, prev, industry) {
  if (!client) {
    return { summary: 'Anthropic API key not configured', ig_insight: '', tk_insight: '', headline_win: '', watch_out: '' };
  }

  const igER = igErCalc(cur.ig_likes, cur.ig_comments, cur.ig_shares, cur.ig_saves, cur.ig_reach);
  const tkER = tkErCalc(cur.tk_likes, cur.tk_comments, cur.tk_shares, cur.tk_video_views);
  const bm = BENCHMARKS[industry] || BENCHMARKS['Other'];

  const igViews = cur.ig_views || cur.ig_reels_views || 0;
  const igNetGrowth = (parseNum(cur.ig_new_followers) - parseNum(cur.ig_unfollows)) || null;
  const igTotalInteractions = parseNum(cur.ig_likes) + parseNum(cur.ig_comments) + parseNum(cur.ig_shares) + parseNum(cur.ig_saves);
  const igConversions = parseNum(cur.ig_website_taps) + parseNum(cur.ig_call_taps) + parseNum(cur.ig_direction_taps);
  const tkTotalInteractions = parseNum(cur.tk_likes) + parseNum(cur.tk_comments) + parseNum(cur.tk_shares);

  const prompt = `You are a senior social media strategist writing a monthly performance summary.
Client: ${clientName} | Industry: ${industry || 'General'} | Period: ${cur.month} ${cur.year}
${prev ? `Previous: ${prev.month} ${prev.year}` : 'Baseline month.'}
IG Growth: Followers ${cur.ig_followers || 0}${prev ? ` (was ${prev.ig_followers || 0})` : ''}${igNetGrowth !== null ? `, Net Growth ${igNetGrowth > 0 ? '+' : ''}${igNetGrowth} (${cur.ig_new_followers || 0} new, ${cur.ig_unfollows || 0} unfollows)` : ''}
IG Visibility: Accounts Reached ${cur.ig_reach || 0}, Views ${igViews}${cur.ig_non_follower_reach_pct ? `, Non-Follower Reach ${cur.ig_non_follower_reach_pct}%` : ''}
IG Engagement: Total Interactions ${igTotalInteractions}, ER ${igER ? igER.toFixed(2) + '%' : 'n/a'} (industry avg ${bm.ig_er}%), Shares ${cur.ig_shares || 0}, Saves ${cur.ig_saves || 0}
IG Conversions: Profile Visits ${cur.ig_profile_visits || 0}, Website Taps ${cur.ig_website_taps || 0}, Call Taps ${cur.ig_call_taps || 0}, Direction Taps ${cur.ig_direction_taps || 0}${igConversions ? ` (${igConversions} total intent actions)` : ''}
${cur.ig_reels_reach || cur.ig_posts_reach ? `IG Content: Posts Reach ${cur.ig_posts_reach || 0}, Reels Reach ${cur.ig_reels_reach || 0}, Stories Reach ${cur.ig_stories_reach || 0}` : ''}
TK Growth: Followers ${cur.tk_followers || 0}${prev ? ` (was ${prev.tk_followers || 0})` : ''}${cur.tk_net_followers != null ? `, Net ${cur.tk_net_followers > 0 ? '+' : ''}${cur.tk_net_followers}` : ''}
TK Visibility: Total Views ${cur.tk_video_views || 0}${cur.tk_total_viewers ? `, Total Viewers ${cur.tk_total_viewers}` : ''}${cur.tk_new_viewers ? `, New Viewers ${cur.tk_new_viewers}` : ''}
TK Engagement: Total Interactions ${tkTotalInteractions}, ER ${tkER ? tkER.toFixed(2) + '%' : 'n/a'} (industry avg ${bm.tk_er}%), Likes ${cur.tk_likes || 0}, Comments ${cur.tk_comments || 0}, Shares ${cur.tk_shares || 0}${cur.tk_saves ? `, Saves ${cur.tk_saves}` : ''}
TK Discovery: Profile Views ${cur.tk_profile_views || 0}${cur.tk_for_you_pct ? `, For You ${cur.tk_for_you_pct}%` : ''}${cur.tk_search_pct ? `, Search ${cur.tk_search_pct}%` : ''}
Return ONLY JSON (no markdown): {"summary":"2-3 sentences executive summary with real numbers and benchmark comparison","ig_insight":"1-2 sentences IG insight focused on growth and conversions + recommendation","tk_insight":"1-2 sentences TK insight focused on views, engagement, and discovery + recommendation","headline_win":"One sentence biggest win this month","watch_out":"One sentence biggest risk or area to improve"}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0]?.text || '{}';
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    return { summary: text, ig_insight: '', tk_insight: '', headline_win: '', watch_out: '' };
  }
}
