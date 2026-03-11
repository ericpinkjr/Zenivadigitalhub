import * as dashboardService from '../services/dashboardService.js';

export async function summary(req, res, next) {
  try {
    const data = await dashboardService.getDashboardSummary(req.user.id);
    res.json(data);
  } catch (e) { next(e); }
}
