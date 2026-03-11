import * as commentsService from '../services/commentsService.js';

export async function listComments(req, res, next) {
  try {
    const { reportId } = req.params;
    const data = await commentsService.getComments(reportId);
    res.json(data);
  } catch (e) { next(e); }
}

export async function createComment(req, res, next) {
  try {
    const data = await commentsService.addComment(req.body);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function listReactions(req, res, next) {
  try {
    const { reportId } = req.params;
    const data = await commentsService.getReactions(reportId);
    res.json(data);
  } catch (e) { next(e); }
}

export async function createReaction(req, res, next) {
  try {
    const data = await commentsService.addReaction(req.body);
    res.status(201).json(data);
  } catch (e) { next(e); }
}
