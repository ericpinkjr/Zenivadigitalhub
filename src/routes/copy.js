import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { generateCopy, listCopy, updateCopy, duplicateCopy, deleteCopy } from '../controllers/copyController.js';

const router = Router();

router.post('/generate/:clientId', auth, generateCopy);
router.get('/client/:clientId', auth, listCopy);
router.patch('/:copyId', auth, updateCopy);
router.post('/:copyId/duplicate', auth, duplicateCopy);
router.delete('/:copyId', auth, deleteCopy);

export default router;
