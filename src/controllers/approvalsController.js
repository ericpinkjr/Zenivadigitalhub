import * as approvalsService from '../services/approvalsService.js';

export async function createApproval(req, res, next) {
  try {
    const data = await approvalsService.createApprovalToken(req.org.id, req.body);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function listApprovals(req, res, next) {
  try {
    const { client_id, status } = req.query;
    const data = await approvalsService.listApprovals(req.org.id, { clientId: client_id, status });
    res.json(data);
  } catch (e) { next(e); }
}

// Public — no auth
export async function getApproval(req, res, next) {
  try {
    const data = await approvalsService.getApprovalByToken(req.params.token);
    res.json(data);
  } catch (e) { next(e); }
}

// Public — no auth
export async function respondApproval(req, res, next) {
  try {
    const data = await approvalsService.respondToApproval(req.params.token, req.body);
    res.json(data);
  } catch (e) { next(e); }
}
