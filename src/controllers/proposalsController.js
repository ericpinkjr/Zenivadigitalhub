import * as proposalsService from '../services/proposalsService.js';

export async function create(req, res, next) {
  try {
    const data = await proposalsService.createProposal(req.org.id, req.body);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function update(req, res, next) {
  try {
    const data = await proposalsService.updateProposal(req.org.id, req.params.id, req.body);
    res.json(data);
  } catch (e) { next(e); }
}

export async function list(req, res, next) {
  try {
    const { lead_id, status } = req.query;
    const data = await proposalsService.getProposals(req.org.id, { leadId: lead_id, status });
    res.json(data);
  } catch (e) { next(e); }
}
