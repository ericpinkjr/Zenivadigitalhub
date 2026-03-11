import * as leadsService from '../services/leadsService.js';

export async function list(req, res, next) {
  try {
    const { status, source, industry, assigned_to } = req.query;
    const data = await leadsService.getLeads(req.user.id, { status, source, industry, assignedTo: assigned_to });
    res.json(data);
  } catch (e) { next(e); }
}

export async function getById(req, res, next) {
  try {
    const data = await leadsService.getLead(req.user.id, req.params.id);
    res.json(data);
  } catch (e) { next(e); }
}

export async function create(req, res, next) {
  try {
    const data = await leadsService.createLead(req.user.id, req.body);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function update(req, res, next) {
  try {
    const data = await leadsService.updateLead(req.user.id, req.params.id, req.body);
    res.json(data);
  } catch (e) { next(e); }
}

export async function remove(req, res, next) {
  try {
    const data = await leadsService.deleteLead(req.user.id, req.params.id);
    res.json(data);
  } catch (e) { next(e); }
}

export async function convert(req, res, next) {
  try {
    const data = await leadsService.convertLeadToClient(req.user.id, req.params.id);
    res.status(201).json(data);
  } catch (e) { next(e); }
}
