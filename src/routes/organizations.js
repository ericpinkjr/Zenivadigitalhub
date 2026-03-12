import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { orgAccess, requireRole } from '../middleware/orgAccess.js';
import * as ctrl from '../controllers/organizationsController.js';

const router = Router();

// All organization routes require authentication and org context
router.use(auth, orgAccess);

router.get('/me', ctrl.getOrg);
router.patch('/me', requireRole('owner'), ctrl.updateOrg);
router.get('/me/members', ctrl.listMembers);
router.patch('/me/members/:userId', requireRole('owner'), ctrl.changeRole);
router.delete('/me/members/:userId', requireRole('owner'), ctrl.removeMember);

export default router;
