import * as dashboardService from '../services/dashboardService.js';

export async function summary(req, res, next) {
  try {
    const data = await dashboardService.getDashboardSummary(req.org.id);
    res.json(data);
  } catch (e) { next(e); }
}
