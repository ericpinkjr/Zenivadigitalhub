import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import * as ctrl from '../controllers/clientsController.js';
import {
  getHashtags,
  getHashtagPosts,
  getHashtagTrend,
  getClientPosts,
  syncInstagram,
} from '../controllers/hashtagController.js';

const router = Router();

// All client routes require authentication
router.use(auth);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.get('/:id', ctrl.getById);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.get('/:id/campaigns', ctrl.getCampaigns);
router.get('/:id/campaign-metrics', ctrl.getCampaignMetrics);
router.get('/:id/ig-metrics', ctrl.getIgMetrics);
router.get('/:id/hashtags', getHashtags);
router.get('/:id/hashtags/:hashtag/posts', getHashtagPosts);
router.get('/:id/hashtags/:hashtag/trend', getHashtagTrend);
router.get('/:id/ig-posts', getClientPosts);
router.post('/:id/sync-instagram', syncInstagram);

export default router;
