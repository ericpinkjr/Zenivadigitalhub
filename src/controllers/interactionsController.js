import * as interactionsService from '../services/interactionsService.js';

export async function log(req, res, next) {
  try {
    const data = await interactionsService.logInteraction(req.user.id, req.body);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function list(req, res, next) {
  try {
    const { lead_id, client_id } = req.query;
    const data = await interactionsService.getInteractions(req.user.id, { leadId: lead_id, clientId: client_id });
    res.json(data);
  } catch (e) { next(e); }
}

export async function followUps(req, res, next) {
  try {
    const data = await interactionsService.getFollowUps(req.user.id);
    res.json(data);
  } catch (e) { next(e); }
}
