import { Router } from 'express';
import multer from 'multer';
import { auth } from '../middleware/auth.js';
import * as ctrl from '../controllers/contentSchedulerController.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

// ── Page Connections ──
router.get('/pages/discover/:clientId', auth, ctrl.discoverPages);
router.post('/pages/connect', auth, ctrl.connectPage);
router.get('/pages/:clientId', auth, ctrl.getConnectedPages);
router.delete('/pages/:connectionId', auth, ctrl.disconnectPage);

// ── Posts CRUD ──
router.post('/posts', auth, ctrl.createPost);
router.get('/posts', auth, ctrl.listPosts);
router.get('/posts/:postId', auth, ctrl.getPost);
router.patch('/posts/:postId', auth, ctrl.updatePost);
router.delete('/posts/:postId', auth, ctrl.deletePost);

// ── Media ──
router.post('/posts/upload', auth, upload.single('media'), ctrl.uploadMedia);
router.delete('/posts/media', auth, ctrl.deleteMedia);

// ── Publishing ──
router.post('/posts/:postId/publish', auth, ctrl.publishPost);

// ── Calendar ──
router.get('/calendar', auth, ctrl.getCalendar);

export default router;
