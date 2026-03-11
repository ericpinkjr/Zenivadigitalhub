import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { generateReport } from '../controllers/aiController.js';

const router = Router();

// POST /api/ai/narrative — Generate AI report narrative
router.post('/narrative', auth, generateReport);

export default router;
