import { Router } from 'express';
import multer from 'multer';
import { auth } from '../middleware/auth.js';
import * as ctrl from '../controllers/moodboardsController.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

// ── Authenticated routes ──
router.post('/', auth, ctrl.createBoard);
router.get('/', auth, ctrl.listBoards);
router.get('/:boardId', auth, ctrl.getBoard);
router.patch('/:boardId', auth, ctrl.updateBoard);
router.delete('/:boardId', auth, ctrl.deleteBoard);
router.post('/:boardId/duplicate', auth, ctrl.duplicateBoard);

// Shots
router.post('/:boardId/shots', auth, ctrl.addShot);
router.patch('/shots/:shotId', auth, ctrl.updateShot);
router.delete('/shots/:shotId', auth, ctrl.deleteShot);
router.put('/:boardId/shots/reorder', auth, ctrl.reorderShots);
router.patch('/shots/:shotId/complete', auth, ctrl.toggleShotComplete);

// Images
router.post('/shots/:shotId/images', auth, upload.single('image'), ctrl.uploadImage);
router.delete('/images/:imageId', auth, ctrl.deleteImage);

// Comments
router.post('/shots/:shotId/comments', auth, ctrl.addComment);

// PDF Export
router.post('/:boardId/export-pdf', auth, ctrl.exportPdf);

// ── Public approval routes (no auth) ──
router.get('/approval/:token', ctrl.getBoardByToken);
router.post('/approval/:token/shots/:shotId/respond', ctrl.respondToShot);
router.post('/approval/:token/shots/:shotId/comments', ctrl.addClientComment);

export default router;
