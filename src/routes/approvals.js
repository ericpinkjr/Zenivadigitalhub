import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { createApproval, listApprovals, getApproval, respondApproval } from '../controllers/approvalsController.js';

const router = Router();

// Authenticated routes
router.post('/', auth, createApproval);
router.get('/', auth, listApprovals);

// Public routes (client portal)
router.get('/token/:token', getApproval);
router.post('/token/:token/respond', respondApproval);

export default router;
