import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import * as ctrl from '../controllers/outboundController.js';

const router = Router();
router.use(auth);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.post('/:id/convert-to-lead', ctrl.convertToLead);
router.post('/:id/draft-outreach', ctrl.draftOutreach);

export default router;
