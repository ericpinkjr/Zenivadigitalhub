import * as onboardingService from '../services/onboardingService.js';

export async function getChecklist(req, res, next) {
  try {
    const data = await onboardingService.getChecklist(req.org.id, req.params.clientId);
    res.json(data);
  } catch (e) { next(e); }
}

export async function updateChecklist(req, res, next) {
  try {
    const data = await onboardingService.updateChecklist(req.org.id, req.params.clientId, req.body);
    res.json(data);
  } catch (e) { next(e); }
}

export async function overview(req, res, next) {
  try {
    const data = await onboardingService.getOnboardingOverview(req.org.id);
    res.json(data);
  } catch (e) { next(e); }
}
