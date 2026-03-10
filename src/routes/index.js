import { Router } from 'express';
import healthRoutes from './health.js';
import clientRoutes from './clients.js';
import metaRoutes from './meta.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/clients', clientRoutes);
router.use('/meta', metaRoutes);

export default router;
