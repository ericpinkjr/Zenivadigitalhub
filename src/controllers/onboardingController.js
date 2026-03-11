import * as onboardingService from '../services/onboardingService.js';

export async function getChecklist(req, res, next) {
  try {
    const data = await onboardingService.getChecklist(req.user.id, req.params.clientId);
    res.json(data);
  } catch (e) { next(e); }
}

export async function updateChecklist(req, res, next) {
  try {
    const data = await onboardingService.updateChecklist(req.user.id, req.params.clientId, req.body);
    res.json(data);
  } catch (e) { next(e); }
}

export async function overview(req, res, next) {
  try {
    const data = await onboardingService.getOnboardingOverview(req.user.id);
    res.json(data);
  } catch (e) { next(e); }
}
