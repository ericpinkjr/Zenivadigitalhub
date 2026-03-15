import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import {
  syncComments,
  listComments,
  replyToComment,
  hideComment,
  getStats,
} from '../controllers/engagementController.js';

const router = Router();
router.use(auth);

router.post('/:clientId/sync', syncComments);
router.get('/:clientId/comments', listComments);
router.post('/comments/:commentId/reply', replyToComment);
router.post('/comments/:commentId/hide', hideComment);
router.get('/:clientId/stats', getStats);

export default router;
