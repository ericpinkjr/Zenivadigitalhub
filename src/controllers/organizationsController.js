import * as organizationsService from '../services/organizationsService.js';

export async function getOrg(req, res, next) {
  try {
    const data = await organizationsService.getOrganization(req.org.id);
    res.json(data);
  } catch (err) { next(err); }
}

export async function updateOrg(req, res, next) {
  try {
    const data = await organizationsService.updateOrganization(req.org.id, req.user.id, req.body);
    res.json(data);
  } catch (err) { next(err); }
}

export async function listMembers(req, res, next) {
  try {
    const data = await organizationsService.listMembers(req.org.id);
    res.json(data);
  } catch (err) { next(err); }
}

export async function changeRole(req, res, next) {
  try {
    const data = await organizationsService.changeMemberRole(req.org.id, req.user.id, req.params.userId, req.body.role);
    res.json(data);
  } catch (err) { next(err); }
}

export async function removeMember(req, res, next) {
  try {
    const data = await organizationsService.removeMember(req.org.id, req.user.id, req.params.userId);
    res.json(data);
  } catch (err) { next(err); }
}
