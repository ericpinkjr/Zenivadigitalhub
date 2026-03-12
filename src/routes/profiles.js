import { Router } from 'express';
import multer from 'multer';
import { auth } from '../middleware/auth.js';
import { getProfile, updateProfile, uploadAvatar } from '../controllers/profilesController.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/me', auth, getProfile);
router.put('/me', auth, updateProfile);
router.post('/me/avatar', auth, upload.single('avatar'), uploadAvatar);

export default router;
