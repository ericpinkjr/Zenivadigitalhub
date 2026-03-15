import { Router } from 'express';
import multer from 'multer';
import { auth } from '../middleware/auth.js';
import { orgAccess } from '../middleware/orgAccess.js';
import * as ctrl from '../controllers/chatController.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB

// All chat routes require authentication and org context
router.use(auth, orgAccess);

// ── Channels ──
router.get('/channels', ctrl.listChannels);
router.post('/channels', ctrl.createChannel);
router.post('/channels/dm', ctrl.findOrCreateDm);
router.get('/channels/:channelId', ctrl.getChannel);
router.patch('/channels/:channelId', ctrl.updateChannel);
router.delete('/channels/:channelId', ctrl.archiveChannel);
router.post('/channels/:channelId/members', ctrl.addMembers);
router.delete('/channels/:channelId/members/:userId', ctrl.removeMember);

// ── Messages ──
router.get('/channels/:channelId/messages', ctrl.getMessages);
router.post('/channels/:channelId/messages', ctrl.sendMessage);
router.patch('/messages/:messageId', ctrl.editMessage);
router.delete('/messages/:messageId', ctrl.deleteMessage);

// ── Threads ──
router.get('/messages/:messageId/thread', ctrl.getThread);

// ── Reactions ──
router.post('/messages/:messageId/reactions', ctrl.addReaction);
router.delete('/messages/:messageId/reactions/:emoji', ctrl.removeReaction);

// ── File Upload ──
router.post('/channels/:channelId/upload', upload.single('file'), ctrl.uploadFile);

// ── Pins ──
router.get('/channels/:channelId/pins', ctrl.listPins);
router.post('/channels/:channelId/pins', ctrl.pinMessage);
router.delete('/channels/:channelId/pins/:messageId', ctrl.unpinMessage);

// ── Unread ──
router.post('/channels/:channelId/read', ctrl.markRead);
router.get('/unread', ctrl.getUnreadCounts);

// ── Search ──
router.get('/search', ctrl.searchMessages);

// ── Mentions ──
router.get('/mentions/search', ctrl.searchMentions);

// ── Notification Preferences ──
router.get('/notifications/preferences', ctrl.getNotificationPreferences);
router.put('/notifications/preferences', ctrl.updateNotificationPreferences);

export default router;
