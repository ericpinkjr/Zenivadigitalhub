import * as invitationsService from '../services/invitationsService.js';

export async function create(req, res, next) {
  try {
    const data = await invitationsService.createInvitation(req.org.id, req.user.id, req.body);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function list(req, res, next) {
  try {
    const data = await invitationsService.listInvitations(req.org.id);
    res.json(data);
  } catch (e) { next(e); }
}

export async function revoke(req, res, next) {
  try {
    const data = await invitationsService.revokeInvitation(req.org.id, req.params.id);
    res.json(data);
  } catch (e) { next(e); }
}

export async function getInfo(req, res, next) {
  try {
    const data = await invitationsService.getInviteInfo(req.params.token);
    res.json(data);
  } catch (e) { next(e); }
}

export async function accept(req, res, next) {
  try {
    const data = await invitationsService.acceptInvitation(req.params.token, req.user.id);
    res.json(data);
  } catch (e) { next(e); }
}

export async function claim(req, res, next) {
  try {
    const { password, full_name } = req.body;
    const data = await invitationsService.claimAccount(req.params.token, password, full_name);
    res.json(data);
  } catch (e) { next(e); }
}
