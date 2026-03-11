import { Router } from 'express';
import {
  listComments, createComment, listReactions, createReaction,
} from '../controllers/commentsController.js';

const router = Router();

// Comments and reactions are public (used by client portal)
router.get('/:reportId/comments', listComments);
router.post('/:reportId/comments', createComment);
router.get('/:reportId/reactions', listReactions);
router.post('/:reportId/reactions', createReaction);

export default router;
