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

export async function changeEmail(req, res, next) {
  try {
    const data = await profilesService.changeEmail(req.user.id, req.body.email);
    res.json(data);
  } catch (e) { next(e); }
}

export async function resetPassword(req, res, next) {
  try {
    const data = await profilesService.resetPassword(req.user.id);
    res.json(data);
  } catch (e) { next(e); }
}

export async function uploadAvatar(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    const data = await profilesService.uploadAvatar(
      req.user.id,
      req.file.buffer,
      req.file.mimetype
    );
    res.json(data);
  } catch (e) { next(e); }
}
