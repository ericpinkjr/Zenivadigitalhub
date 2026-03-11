import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { getProfile, updateProfile } from '../controllers/profilesController.js';

const router = Router();

router.get('/me', auth, getProfile);
router.put('/me', auth, updateProfile);

export default router;
