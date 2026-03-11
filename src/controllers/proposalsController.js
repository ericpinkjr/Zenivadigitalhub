import * as proposalsService from '../services/proposalsService.js';

export async function create(req, res, next) {
  try {
    const data = await proposalsService.createProposal(req.user.id, req.body);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function update(req, res, next) {
  try {
    const data = await proposalsService.updateProposal(req.user.id, req.params.id, req.body);
    res.json(data);
  } catch (e) { next(e); }
}

export async function list(req, res, next) {
  try {
    const { lead_id, status } = req.query;
    const data = await proposalsService.getProposals(req.user.id, { leadId: lead_id, status });
    res.json(data);
  } catch (e) { next(e); }
}
