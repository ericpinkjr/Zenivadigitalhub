import * as hashtagService from '../services/hashtagService.js';

export async function getHashtags(req, res, next) {
  try {
    const { id: clientId } = req.params;
    const { sortBy, order, limit } = req.query;
    const data = await hashtagService.getHashtags(req.org.id, clientId, {
      sortBy,
      order,
      limit: limit ? parseInt(limit) : undefined,
    });
    res.json(data);
  } catch (e) { next(e); }
}
