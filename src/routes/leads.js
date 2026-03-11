import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import * as ctrl from '../controllers/leadsController.js';

const router = Router();
router.use(auth);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.get('/:id', ctrl.getById);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.post('/:id/convert', ctrl.convert);

export default router;
