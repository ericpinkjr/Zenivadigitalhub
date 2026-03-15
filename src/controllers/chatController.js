import * as chatService from '../services/chatService.js';

// ── Channels ──

export async function listChannels(req, res, next) {
  try {
    const data = await chatService.listChannels(req.org.id, req.user.id);
    res.json(data);
  } catch (e) { next(e); }
}

export async function createChannel(req, res, next) {
  try {
    const data = await chatService.createChannel(req.org.id, req.user.id, req.body);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function findOrCreateDm(req, res, next) {
  try {
    const data = await chatService.findOrCreateDm(req.org.id, req.user.id, req.body.userId);
    res.json(data);
  } catch (e) { next(e); }
}

export async function getChannel(req, res, next) {
  try {
    const data = await chatService.getChannel(req.org.id, req.user.id, req.params.channelId);
    res.json(data);
  } catch (e) { next(e); }
}

export async function updateChannel(req, res, next) {
  try {
    const data = await chatService.updateChannel(req.org.id, req.user.id, req.params.channelId, req.body);
    res.json(data);
  } catch (e) { next(e); }
}

export async function archiveChannel(req, res, next) {
  try {
    const data = await chatService.archiveChannel(req.org.id, req.user.id, req.params.channelId);
    res.json(data);
  } catch (e) { next(e); }
}

export async function addMembers(req, res, next) {
  try {
    const data = await chatService.addChannelMembers(req.org.id, req.user.id, req.params.channelId, req.body.userIds);
    res.json(data);
  } catch (e) { next(e); }
}

export async function removeMember(req, res, next) {
  try {
    const data = await chatService.removeChannelMember(req.org.id, req.user.id, req.params.channelId, req.params.userId);
    res.json(data);
  } catch (e) { next(e); }
}

// ── Messages ──

export async function getMessages(req, res, next) {
  try {
    const { before, limit } = req.query;
    const data = await chatService.getMessages(req.org.id, req.user.id, req.params.channelId, {
      before,
      limit: limit ? parseInt(limit) : 50,
    });
    res.json(data);
  } catch (e) { next(e); }
}

export async function sendMessage(req, res, next) {
  try {
    const data = await chatService.sendMessage(req.org.id, req.user.id, req.params.channelId, req.body);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function editMessage(req, res, next) {
  try {
    const data = await chatService.editMessage(req.user.id, req.params.messageId, req.body.content);
    res.json(data);
  } catch (e) { next(e); }
}

export async function deleteMessage(req, res, next) {
  try {
    const data = await chatService.deleteMessage(req.user.id, req.params.messageId);
    res.json(data);
  } catch (e) { next(e); }
}

// ── Threads ──

export async function getThread(req, res, next) {
  try {
    const data = await chatService.getThread(req.user.id, req.params.messageId);
    res.json(data);
  } catch (e) { next(e); }
}

// ── Reactions ──

export async function addReaction(req, res, next) {
  try {
    const data = await chatService.addReaction(req.user.id, req.params.messageId, req.body.emoji);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function removeReaction(req, res, next) {
  try {
    const data = await chatService.removeReaction(req.user.id, req.params.messageId, req.params.emoji);
    res.json(data);
  } catch (e) { next(e); }
}

// ── File Upload ──

export async function uploadFile(req, res, next) {
  try {
    if (!req.file) throw new Error('No file provided');
    const data = await chatService.uploadAttachment(
      req.org.id,
      req.params.channelId,
      req.user.id,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      req.file.size
    );
    res.status(201).json(data);
  } catch (e) { next(e); }
}

// ── Pins ──

export async function listPins(req, res, next) {
  try {
    const data = await chatService.listPins(req.user.id, req.params.channelId);
    res.json(data);
  } catch (e) { next(e); }
}

export async function pinMessage(req, res, next) {
  try {
    const data = await chatService.pinMessage(req.user.id, req.params.channelId, req.body.messageId);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function unpinMessage(req, res, next) {
  try {
    const data = await chatService.unpinMessage(req.user.id, req.params.channelId, req.params.messageId);
    res.json(data);
  } catch (e) { next(e); }
}

// ── Unread ──

export async function markRead(req, res, next) {
  try {
    const data = await chatService.markChannelRead(req.user.id, req.params.channelId);
    res.json(data);
  } catch (e) { next(e); }
}

export async function getUnreadCounts(req, res, next) {
  try {
    const data = await chatService.getUnreadCounts(req.org.id, req.user.id);
    res.json(data);
  } catch (e) { next(e); }
}

// ── Search ──

export async function searchMessages(req, res, next) {
  try {
    const data = await chatService.searchMessages(req.org.id, req.user.id, req.query.q, req.query.channelId);
    res.json(data);
  } catch (e) { next(e); }
}

// ── Mentions ──

export async function searchMentions(req, res, next) {
  try {
    const data = await chatService.searchMentions(req.org.id, req.user.id, req.query.q, req.query.type);
    res.json(data);
  } catch (e) { next(e); }
}

// ── Notification Preferences ──

export async function getNotificationPreferences(req, res, next) {
  try {
    const data = await chatService.getNotificationPreferences(req.user.id);
    res.json(data);
  } catch (e) { next(e); }
}

export async function updateNotificationPreferences(req, res, next) {
  try {
    const data = await chatService.updateNotificationPreferences(req.user.id, req.body);
    res.json(data);
  } catch (e) { next(e); }
}
