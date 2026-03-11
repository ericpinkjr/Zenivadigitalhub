import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import * as ctrl from '../controllers/dashboardController.js';

const router = Router();
router.use(auth);

router.get('/summary', ctrl.summary);

export default router;
