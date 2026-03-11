import * as hashtagService from '../services/hashtagService.js';

export async function getHashtags(req, res, next) {
  try {
    const { clientId } = req.params;
    const { sortBy, order, limit } = req.query;
    const data = await hashtagService.getHashtags(req.user.id, clientId, {
      sortBy,
      order,
      limit: limit ? parseInt(limit) : undefined,
    });
    res.json(data);
  } catch (e) { next(e); }
}
