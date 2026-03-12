import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { orgAccess, requireRole } from '../middleware/orgAccess.js';
import * as ctrl from '../controllers/teamsController.js';

const router = Router();

// All team routes require authentication and org context
router.use(auth, orgAccess);

router.get('/', ctrl.list);
router.post('/', requireRole('owner'), ctrl.create);
router.patch('/:teamId', requireRole('owner', 'lead'), ctrl.update);
router.delete('/:teamId', requireRole('owner'), ctrl.remove);
router.post('/:teamId/members', requireRole('owner', 'lead'), ctrl.addMember);
router.delete('/:teamId/members/:userId', requireRole('owner', 'lead'), ctrl.removeMember);

export default router;
