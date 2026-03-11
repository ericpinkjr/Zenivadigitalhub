import * as copyService from '../services/copyService.js';

export async function generateCopy(req, res, next) {
  try {
    const { clientId } = req.params;
    const { campaignId, campaignGoal, currentOffer, tone } = req.body;
    const data = await copyService.generateCopy(req.user.id, clientId, { campaignId, campaignGoal, currentOffer, tone });
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function listCopy(req, res, next) {
  try {
    const { clientId } = req.params;
    const { status, campaign_id } = req.query;
    const data = await copyService.listCopy(req.user.id, clientId, { status, campaignId: campaign_id });
    res.json(data);
  } catch (e) { next(e); }
}

export async function updateCopy(req, res, next) {
  try {
    const { copyId } = req.params;
    const data = await copyService.updateCopy(req.user.id, copyId, req.body);
    res.json(data);
  } catch (e) { next(e); }
}

export async function duplicateCopy(req, res, next) {
  try {
    const { copyId } = req.params;
    const data = await copyService.duplicateCopy(req.user.id, copyId);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function deleteCopy(req, res, next) {
  try {
    const { copyId } = req.params;
    const data = await copyService.deleteCopy(req.user.id, copyId);
    res.json(data);
  } catch (e) { next(e); }
}
