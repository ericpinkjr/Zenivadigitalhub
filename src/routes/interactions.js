import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import * as ctrl from '../controllers/interactionsController.js';

const router = Router();
router.use(auth);

router.post('/', ctrl.log);
router.get('/', ctrl.list);
router.get('/follow-ups', ctrl.followUps);

export default router;
