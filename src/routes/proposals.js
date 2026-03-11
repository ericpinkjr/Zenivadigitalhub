import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import * as ctrl from '../controllers/proposalsController.js';

const router = Router();
router.use(auth);

router.post('/', ctrl.create);
router.get('/', ctrl.list);
router.put('/:id', ctrl.update);

export default router;
