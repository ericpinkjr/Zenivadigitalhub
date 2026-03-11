import { getCampaignSuggestions } from '../services/calendarService.js';

export async function getSuggestions(req, res, next) {
  try {
    const data = await getCampaignSuggestions(req.user.id);
    res.json(data);
  } catch (e) { next(e); }
}
