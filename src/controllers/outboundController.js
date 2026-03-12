import * as outboundService from '../services/outboundService.js';

export async function list(req, res, next) {
  try {
    const { month, status } = req.query;
    const data = await outboundService.getTargets(req.org.id, { month, status });
    res.json(data);
  } catch (e) { next(e); }
}

export async function create(req, res, next) {
  try {
    const data = await outboundService.createTarget(req.org.id, req.body);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function update(req, res, next) {
  try {
    const data = await outboundService.updateTarget(req.org.id, req.params.id, req.body);
    res.json(data);
  } catch (e) { next(e); }
}

export async function convertToLead(req, res, next) {
  try {
    const data = await outboundService.convertTargetToLead(req.org.id, req.params.id);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function draftOutreach(req, res, next) {
  try {
    const data = await outboundService.draftOutreach(req.org.id, req.params.id);
    res.json(data);
  } catch (e) { next(e); }
}
