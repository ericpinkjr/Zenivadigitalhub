import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { orgAccess, requireRole } from '../middleware/orgAccess.js';
import * as ctrl from '../controllers/invitationsController.js';

const router = Router();

// Public routes (no auth)
router.get('/:token/info', ctrl.getInfo);
router.post('/:token/claim', ctrl.claim);

// Authenticated routes
router.post('/', auth, orgAccess, requireRole('owner', 'lead'), ctrl.create);
router.get('/', auth, orgAccess, ctrl.list);
router.delete('/:id', auth, orgAccess, requireRole('owner', 'lead'), ctrl.revoke);
router.post('/:token/accept', auth, orgAccess, ctrl.accept);

export default router;
