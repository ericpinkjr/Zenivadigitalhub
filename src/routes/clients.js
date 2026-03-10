import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import * as ctrl from '../controllers/clientsController.js';

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

export default router;
