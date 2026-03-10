import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import * as ctrl from '../controllers/metaController.js';

const router = Router();

router.use(auth);

router.post('/sync/:clientId', ctrl.syncClient);

export default router;
