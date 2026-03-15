import * as svc from '../services/contentSchedulerService.js';

// ── Page Connections ──

export async function discoverPages(req, res, next) {
  try {
    const data = await svc.discoverPages(req.params.clientId, req.org.id);
    res.json(data);
  } catch (e) { next(e); }
}

export async function connectPage(req, res, next) {
  try {
    const data = await svc.connectPage(req.org.id, req.body);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function getConnectedPages(req, res, next) {
  try {
    const data = await svc.getConnectedPages(req.org.id, req.params.clientId);
    res.json(data);
  } catch (e) { next(e); }
}

export async function disconnectPage(req, res, next) {
  try {
    const data = await svc.disconnectPage(req.org.id, req.params.connectionId);
    res.json(data);
  } catch (e) { next(e); }
}

// ── Posts ──

export async function createPost(req, res, next) {
  try {
    const data = await svc.createPost(req.org.id, req.user.id, req.body);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function listPosts(req, res, next) {
  try {
    const { client_id, status, start_date, end_date, limit, offset } = req.query;
    const data = await svc.listPosts(req.org.id, {
      clientId: client_id,
      status,
      startDate: start_date,
      endDate: end_date,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });
    res.json(data);
  } catch (e) { next(e); }
}

export async function getPost(req, res, next) {
  try {
    const data = await svc.getPost(req.org.id, req.params.postId);
    res.json(data);
  } catch (e) { next(e); }
}

export async function updatePost(req, res, next) {
  try {
    const data = await svc.updatePost(req.org.id, req.params.postId, req.body);
    res.json(data);
  } catch (e) { next(e); }
}

export async function deletePost(req, res, next) {
  try {
    const data = await svc.deletePost(req.org.id, req.params.postId);
    res.json(data);
  } catch (e) { next(e); }
}

// ── Media ──

export async function uploadMedia(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file provided' });
    const clientId = req.body.client_id || req.query.client_id;
    if (!clientId) return res.status(400).json({ message: 'client_id is required' });

    const data = await svc.uploadMedia(
      req.org.id,
      clientId,
      req.file.buffer,
      req.file.originalname,
      req.file.size,
    );
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function deleteMedia(req, res, next) {
  try {
    const { storage_path } = req.body;
    if (!storage_path) return res.status(400).json({ message: 'storage_path is required' });
    const data = await svc.deleteMedia(req.org.id, storage_path);
    res.json(data);
  } catch (e) { next(e); }
}

// ── Publishing ──

export async function publishPost(req, res, next) {
  try {
    const data = await svc.publishPost(req.org.id, req.params.postId);
    res.json(data);
  } catch (e) { next(e); }
}

// ── Calendar ──

export async function getCalendar(req, res, next) {
  try {
    const { client_id, start_date, end_date } = req.query;
    const data = await svc.getCalendar(req.org.id, {
      clientId: client_id,
      startDate: start_date,
      endDate: end_date,
    });
    res.json(data);
  } catch (e) { next(e); }
}
