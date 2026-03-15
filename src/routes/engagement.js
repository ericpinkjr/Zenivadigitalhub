import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import {
  syncComments,
  listComments,
  replyToComment,
  hideComment,
  likeComment,
  draftReply,
  getStats,
  syncAllComments,
  listAllComments,
  getAllStats,
} from '../controllers/engagementController.js';

const router = Router();
router.use(auth);

// Global (all-client) routes — must come before :clientId routes
router.post('/all/sync', syncAllComments);
router.get('/all/comments', listAllComments);
router.get('/all/stats', getAllStats);

// Per-client routes
router.post('/:clientId/sync', syncComments);
router.get('/:clientId/comments', listComments);
router.post('/comments/:commentId/reply', replyToComment);
router.post('/comments/:commentId/hide', hideComment);
router.post('/comments/:commentId/like', likeComment);
router.post('/comments/:commentId/draft', draftReply);
router.get('/:clientId/stats', getStats);

export default router;
