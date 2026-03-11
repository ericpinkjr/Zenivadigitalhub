import * as clientsService from '../services/clientsService.js';

export async function list(req, res, next) {
  try {
    const data = await clientsService.listClients(req.user.id);
    res.json(data);
  } catch (err) { next(err); }
}

export async function create(req, res, next) {
  try {
    const data = await clientsService.createClient(req.user.id, req.body);
    res.status(201).json(data);
  } catch (err) { next(err); }
}

export async function getById(req, res, next) {
  try {
    const data = await clientsService.getClientById(req.user.id, req.params.id);
    res.json(data);
  } catch (err) { next(err); }
}

export async function update(req, res, next) {
  try {
    const data = await clientsService.updateClient(req.user.id, req.params.id, req.body);
    res.json(data);
  } catch (err) { next(err); }
}

export async function remove(req, res, next) {
  try {
    const data = await clientsService.deleteClient(req.user.id, req.params.id);
    res.json(data);
  } catch (err) { next(err); }
}

export async function getCampaigns(req, res, next) {
  try {
    const data = await clientsService.getClientCampaigns(req.user.id, req.params.id);
    res.json(data);
  } catch (err) { next(err); }
}

export async function getCampaignMetrics(req, res, next) {
  try {
    const { start_date, end_date } = req.query;
    const data = await clientsService.getClientCampaignMetrics(
      req.user.id,
      req.params.id,
      { startDate: start_date, endDate: end_date }
    );
    res.json(data);
  } catch (err) { next(err); }
}

export async function getIgMetrics(req, res, next) {
  try {
    const { start_date, end_date } = req.query;
    const data = await clientsService.getClientIgMetrics(
      req.user.id,
      req.params.id,
      { startDate: start_date, endDate: end_date }
    );
    res.json(data);
  } catch (err) { next(err); }
}
