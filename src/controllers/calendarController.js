import { getCampaignSuggestions } from '../services/calendarService.js';

export async function getSuggestions(req, res, next) {
  try {
    const data = await getCampaignSuggestions(req.org.id);
    res.json(data);
  } catch (e) { next(e); }
}
