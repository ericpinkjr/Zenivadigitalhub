import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import * as ctrl from '../controllers/onboardingController.js';

const router = Router();
router.use(auth);

router.get('/', ctrl.overview);
router.get('/:clientId', ctrl.getChecklist);
router.put('/:clientId', ctrl.updateChecklist);

export default router;
