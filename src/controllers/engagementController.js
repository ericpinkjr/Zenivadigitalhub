import * as engagementService from '../services/engagementService.js';
import { logSync } from '../jobs/metaSyncCron.js';

export async function syncComments(req, res, next) {
  try {
    const { clientId } = req.params;
    const start = new Date().toISOString();
    const result = await engagementService.syncCommentsForClient(clientId);
    await logSync(clientId, 'comments', 'manual', result.skipped ? 'skipped' : 'success', {
      comments_synced: result.comments_synced,
      posts_checked: result.posts_checked,
    }, start);
    res.json(result);
  } catch (e) { next(e); }
}

export async function listComments(req, res, next) {
  try {
    const { clientId } = req.params;
    const { filter, search, limit, offset } = req.query;
    const data = await engagementService.getComments(req.org.id, clientId, {
      filter,
      search,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });
    res.json(data);
  } catch (e) { next(e); }
}

export async function replyToComment(req, res, next) {
  try {
    const { commentId } = req.params;
    const { message, clientId } = req.body;
    if (!message || !clientId) {
      return res.status(400).json({ message: 'message and clientId are required' });
    }
    const data = await engagementService.replyToComment(req.org.id, clientId, commentId, message);
    res.json(data);
  } catch (e) { next(e); }
}

export async function hideComment(req, res, next) {
  try {
    const { commentId } = req.params;
    const { clientId } = req.body;
    if (!clientId) {
      return res.status(400).json({ message: 'clientId is required' });
    }
    const data = await engagementService.hideComment(req.org.id, clientId, commentId);
    res.json(data);
  } catch (e) { next(e); }
}

export async function getStats(req, res, next) {
  try {
    const { clientId } = req.params;
    const data = await engagementService.getEngagementStats(req.org.id, clientId);
    res.json(data);
  } catch (e) { next(e); }
}

// ── Global (all-client) endpoints ──

export async function syncAllComments(req, res, next) {
  try {
    const data = await engagementService.syncAllComments(req.org.id);
    res.json(data);
  } catch (e) { next(e); }
}

export async function listAllComments(req, res, next) {
  try {
    const { filter, search, limit, offset } = req.query;
    const data = await engagementService.getAllComments(req.org.id, {
      filter,
      search,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });
    res.json(data);
  } catch (e) { next(e); }
}

export async function getAllStats(req, res, next) {
  try {
    const data = await engagementService.getAllStats(req.org.id);
    res.json(data);
  } catch (e) { next(e); }
}
