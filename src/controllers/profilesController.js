import * as profilesService from '../services/profilesService.js';

export async function getProfile(req, res, next) {
  try {
    const data = await profilesService.getProfile(req.user.id);
    res.json(data);
  } catch (e) { next(e); }
}

export async function updateProfile(req, res, next) {
  try {
    const data = await profilesService.updateProfile(req.user.id, req.body);
    res.json(data);
  } catch (e) { next(e); }
}
