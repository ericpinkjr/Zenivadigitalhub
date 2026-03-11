import { Router } from 'express';
import healthRoutes from './health.js';
import clientRoutes from './clients.js';
import metaRoutes from './meta.js';
import aiRoutes from './ai.js';
import reportRoutes from './reports.js';
import commentRoutes from './comments.js';
import profileRoutes from './profiles.js';
import copyRoutes from './copy.js';
import taskRoutes from './tasks.js';
import calendarRoutes from './calendar.js';
import approvalRoutes from './approvals.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/clients', clientRoutes);
router.use('/meta', metaRoutes);
router.use('/ai', aiRoutes);
router.use('/reports', reportRoutes);
router.use('/reports', commentRoutes);
router.use('/profiles', profileRoutes);
router.use('/copy', copyRoutes);
router.use('/tasks', taskRoutes);
router.use('/calendar', calendarRoutes);
router.use('/approvals', approvalRoutes);

export default router;
