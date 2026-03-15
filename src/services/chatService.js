import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

// ── Profile helper (FK goes to auth.users, not profiles — must fetch separately) ──

async function fetchProfiles(userIds) {
  if (!userIds.length) return {};
  const unique = [...new Set(userIds)];
  const { data } = await supabaseAdmin.from('profiles').select('id, full_name, avatar_url').in('id', unique);
  return Object.fromEntries((data || []).map(p => [p.id, p]));
}

async function attachProfilesToMessages(messages) {
  const senderIds = messages.map(m => m.sender_id).filter(Boolean);
  const reactionUserIds = messages.flatMap(m => (m.chat_reactions || []).map(r => r.user_id));
  const profileMap = await fetchProfiles([...senderIds, ...reactionUserIds]);
  messages.forEach(m => {
    m.profiles = profileMap[m.sender_id] || { id: m.sender_id, full_name: null, avatar_url: null };
    (m.chat_reactions || []).forEach(r => {
      r.profiles = profileMap[r.user_id] || { id: r.user_id, full_name: null, avatar_url: null };
    });
  });
  return messages;
}

// ── Channels ──

export async function listChannels(orgId, userId) {
  // Get all channels the user is a member of
  const { data: memberships, error: memErr } = await supabaseAdmin
    .from('chat_channel_members')
    .select('channel_id, last_read_at, notifications_muted')
    .eq('user_id', userId);
  if (memErr) throw new ApiError(500, memErr.message);
  if (!memberships.length) return [];

  const channelIds = memberships.map(m => m.channel_id);
  const readMap = Object.fromEntries(memberships.map(m => [m.channel_id, m]));

  // Get channels with members (no profile join — FK goes to auth.users, not profiles)
  const { data: channels, error: chErr } = await supabaseAdmin
    .from('chat_channels')
    .select('*, chat_channel_members(user_id, role)')
    .in('id', channelIds)
    .eq('org_id', orgId)
    .eq('is_archived', false)
    .order('updated_at', { ascending: false });
  if (chErr) throw new ApiError(500, chErr.message);

  // Batch-fetch profiles for all member user_ids
  const allUserIds = [...new Set(channels.flatMap(ch => (ch.chat_channel_members || []).map(m => m.user_id)))];
  const { data: profileRows } = allUserIds.length
    ? await supabaseAdmin.from('profiles').select('id, full_name, avatar_url').in('id', allUserIds)
    : { data: [] };
  const profileMap = Object.fromEntries((profileRows || []).map(p => [p.id, p]));

  // Attach profiles to members
  channels.forEach(ch => {
    (ch.chat_channel_members || []).forEach(m => {
      m.profiles = profileMap[m.user_id] || { id: m.user_id, full_name: null, avatar_url: null };
    });
  });

  // Get last message for each channel
  const lastMessages = await Promise.all(channelIds.map(async (cid) => {
    const { data } = await supabaseAdmin
      .from('chat_messages')
      .select('id, content, message_type, sender_id, created_at')
      .eq('channel_id', cid)
      .is('parent_message_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return [cid, data];
  }));
  const lastMsgMap = Object.fromEntries(lastMessages);

  // Attach sender profiles to last messages
  const lastMsgSenderIds = Object.values(lastMsgMap).filter(Boolean).map(m => m.sender_id);
  if (lastMsgSenderIds.length) {
    const senderProfiles = await fetchProfiles(lastMsgSenderIds);
    Object.values(lastMsgMap).filter(Boolean).forEach(m => {
      m.profiles = senderProfiles[m.sender_id] || { id: m.sender_id, full_name: null, avatar_url: null };
    });
  }

  // Get unread counts
  const unreadCounts = await Promise.all(memberships.map(async (m) => {
    const { count } = await supabaseAdmin
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('channel_id', m.channel_id)
      .gt('created_at', m.last_read_at)
      .neq('sender_id', userId)
      .is('parent_message_id', null);
    return [m.channel_id, count || 0];
  }));
  const unreadMap = Object.fromEntries(unreadCounts);

  return channels.map(ch => ({
    ...ch,
    last_message: lastMsgMap[ch.id] || null,
    unread_count: unreadMap[ch.id] || 0,
    notifications_muted: readMap[ch.id]?.notifications_muted || false,
  }));
}

export async function createChannel(orgId, userId, { type, name, description, memberIds }) {
  if (type === 'team') throw new ApiError(400, 'Team channels are auto-created');
  if (type === 'dm') throw new ApiError(400, 'Use findOrCreateDm for direct messages');
  if (!name) throw new ApiError(400, 'Group channels require a name');
  if (!memberIds?.length) throw new ApiError(400, 'At least one member is required');

  // Ensure creator is included
  const allMembers = [...new Set([userId, ...memberIds])];

  const { data: channel, error } = await supabaseAdmin
    .from('chat_channels')
    .insert({ org_id: orgId, type, name, description: description || null, created_by: userId })
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);

  // Add members
  const memberRows = allMembers.map(uid => ({
    channel_id: channel.id,
    user_id: uid,
    role: uid === userId ? 'admin' : 'member',
  }));
  const { error: memErr } = await supabaseAdmin
    .from('chat_channel_members')
    .insert(memberRows);
  if (memErr) throw new ApiError(400, memErr.message);

  // Insert system message
  await supabaseAdmin.from('chat_messages').insert({
    channel_id: channel.id,
    sender_id: userId,
    content: 'created this group',
    message_type: 'system',
  });

  // Update channel timestamp
  await supabaseAdmin.from('chat_channels').update({ updated_at: new Date().toISOString() }).eq('id', channel.id);

  return getChannel(orgId, userId, channel.id);
}

export async function findOrCreateDm(orgId, userId, targetUserId) {
  if (userId === targetUserId) throw new ApiError(400, 'Cannot DM yourself');

  // Check both users are in the org
  const { data: members } = await supabaseAdmin
    .from('org_members')
    .select('user_id')
    .eq('org_id', orgId)
    .in('user_id', [userId, targetUserId]);
  if (!members || members.length < 2) throw new ApiError(404, 'User not found in organization');

  // Find existing DM
  const { data: existing } = await supabaseAdmin.rpc('find_dm_channel', {
    p_org_id: orgId,
    p_user1: userId,
    p_user2: targetUserId,
  });

  // Fallback: manual query if RPC doesn't exist
  if (existing && existing.length > 0) {
    return getChannel(orgId, userId, existing[0].id);
  }

  // Manual search for existing DM
  const { data: userChannels } = await supabaseAdmin
    .from('chat_channel_members')
    .select('channel_id')
    .eq('user_id', userId);

  if (userChannels?.length) {
    const { data: dmChannels } = await supabaseAdmin
      .from('chat_channels')
      .select('id')
      .in('id', userChannels.map(c => c.channel_id))
      .eq('type', 'dm')
      .eq('org_id', orgId);

    if (dmChannels?.length) {
      for (const dm of dmChannels) {
        const { data: members } = await supabaseAdmin
          .from('chat_channel_members')
          .select('user_id')
          .eq('channel_id', dm.id);
        const memberIds = members?.map(m => m.user_id) || [];
        if (memberIds.length === 2 && memberIds.includes(targetUserId)) {
          return getChannel(orgId, userId, dm.id);
        }
      }
    }
  }

  // Create new DM
  const { data: channel, error } = await supabaseAdmin
    .from('chat_channels')
    .insert({ org_id: orgId, type: 'dm', created_by: userId })
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);

  await supabaseAdmin.from('chat_channel_members').insert([
    { channel_id: channel.id, user_id: userId, role: 'member' },
    { channel_id: channel.id, user_id: targetUserId, role: 'member' },
  ]);

  return getChannel(orgId, userId, channel.id);
}

export async function getChannel(orgId, userId, channelId) {
  // Verify membership
  const { data: membership } = await supabaseAdmin
    .from('chat_channel_members')
    .select('id')
    .eq('channel_id', channelId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!membership) throw new ApiError(403, 'Not a member of this channel');

  const { data, error } = await supabaseAdmin
    .from('chat_channels')
    .select('*, chat_channel_members(user_id, role, joined_at)')
    .eq('id', channelId)
    .eq('org_id', orgId)
    .single();
  if (error) throw new ApiError(404, 'Channel not found');

  // Attach profiles to members
  const memberIds = (data.chat_channel_members || []).map(m => m.user_id);
  if (memberIds.length) {
    const { data: profiles } = await supabaseAdmin.from('profiles').select('id, full_name, avatar_url').in('id', memberIds);
    const pMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
    data.chat_channel_members.forEach(m => {
      m.profiles = pMap[m.user_id] || { id: m.user_id, full_name: null, avatar_url: null };
    });
  }
  return data;
}

export async function updateChannel(orgId, userId, channelId, updates) {
  await verifyChannelAdmin(channelId, userId, orgId);

  const allowed = ['name', 'description', 'avatar_url'];
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  );
  filtered.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('chat_channels')
    .update(filtered)
    .eq('id', channelId)
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function archiveChannel(orgId, userId, channelId) {
  // Only org owner can archive
  const { data: orgMember } = await supabaseAdmin
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .single();
  if (!orgMember || orgMember.role !== 'owner') throw new ApiError(403, 'Only org owner can archive channels');

  const { data, error } = await supabaseAdmin
    .from('chat_channels')
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq('id', channelId)
    .eq('org_id', orgId)
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function addChannelMembers(orgId, userId, channelId, userIds) {
  await verifyChannelAdmin(channelId, userId, orgId);

  const rows = userIds.map(uid => ({ channel_id: channelId, user_id: uid, role: 'member' }));
  const { error } = await supabaseAdmin
    .from('chat_channel_members')
    .upsert(rows, { onConflict: 'channel_id,user_id' });
  if (error) throw new ApiError(400, error.message);

  // System message
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('full_name')
    .in('id', userIds);
  const names = (profiles || []).map(p => p.full_name).join(', ');
  await supabaseAdmin.from('chat_messages').insert({
    channel_id: channelId,
    sender_id: userId,
    content: `added ${names}`,
    message_type: 'system',
  });

  await supabaseAdmin.from('chat_channels').update({ updated_at: new Date().toISOString() }).eq('id', channelId);
  return getChannel(orgId, userId, channelId);
}

export async function removeChannelMember(orgId, userId, channelId, targetUserId) {
  // Allow self-removal or admin removal
  if (userId !== targetUserId) {
    await verifyChannelAdmin(channelId, userId, orgId);
  }

  const { error } = await supabaseAdmin
    .from('chat_channel_members')
    .delete()
    .eq('channel_id', channelId)
    .eq('user_id', targetUserId);
  if (error) throw new ApiError(400, error.message);

  // System message
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name')
    .eq('id', targetUserId)
    .single();
  const action = userId === targetUserId ? 'left the group' : `removed ${profile?.full_name || 'a member'}`;
  await supabaseAdmin.from('chat_messages').insert({
    channel_id: channelId,
    sender_id: userId,
    content: action,
    message_type: 'system',
  });

  return { success: true };
}

// ── Messages ──

export async function getMessages(orgId, userId, channelId, { before, limit = 50 } = {}) {
  await verifyMembership(channelId, userId);

  let query = supabaseAdmin
    .from('chat_messages')
    .select(`
      *,
      chat_message_attachments(*),
      chat_reactions(id, emoji, user_id),
      chat_mentions(id, mention_type, mention_id)
    `)
    .eq('channel_id', channelId)
    .is('parent_message_id', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) {
    const { data: cursorMsg } = await supabaseAdmin
      .from('chat_messages')
      .select('created_at')
      .eq('id', before)
      .single();
    if (cursorMsg) {
      query = query.lt('created_at', cursorMsg.created_at);
    }
  }

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);

  // Attach profiles to messages and reactions
  await attachProfilesToMessages(data);

  // Get thread reply counts
  const msgIds = data.map(m => m.id);
  if (msgIds.length) {
    const { data: replyCounts } = await supabaseAdmin
      .from('chat_messages')
      .select('parent_message_id')
      .in('parent_message_id', msgIds);

    const countMap = {};
    (replyCounts || []).forEach(r => {
      countMap[r.parent_message_id] = (countMap[r.parent_message_id] || 0) + 1;
    });
    data.forEach(m => { m.reply_count = countMap[m.id] || 0; });
  }

  return data.reverse();
}

export async function sendMessage(orgId, userId, channelId, { content, parentMessageId, mentions, attachmentIds }) {
  await verifyMembership(channelId, userId);

  const messageData = {
    channel_id: channelId,
    sender_id: userId,
    content: content || null,
    message_type: 'text',
    parent_message_id: parentMessageId || null,
    metadata: {},
  };

  // If there are attachments, set message type
  if (attachmentIds?.length) {
    messageData.message_type = 'file';
  }

  const { data: message, error } = await supabaseAdmin
    .from('chat_messages')
    .insert(messageData)
    .select('*')
    .single();
  if (error) throw new ApiError(400, error.message);

  // Attach sender profile
  const pMap = await fetchProfiles([userId]);
  message.profiles = pMap[userId] || { id: userId, full_name: null, avatar_url: null };

  // Link attachments to message
  if (attachmentIds?.length) {
    await supabaseAdmin
      .from('chat_message_attachments')
      .update({ message_id: message.id })
      .in('id', attachmentIds);

    const { data: atts } = await supabaseAdmin
      .from('chat_message_attachments')
      .select('*')
      .eq('message_id', message.id);
    message.chat_message_attachments = atts || [];
  }

  // Insert mentions
  if (mentions?.length) {
    const mentionRows = mentions.map(m => ({
      message_id: message.id,
      mention_type: m.type,
      mention_id: m.id,
    }));
    await supabaseAdmin.from('chat_mentions').insert(mentionRows);
    message.chat_mentions = mentionRows;
  }

  // Update channel timestamp
  await supabaseAdmin
    .from('chat_channels')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', channelId);

  message.chat_reactions = [];
  message.reply_count = 0;
  return message;
}

export async function editMessage(userId, messageId, content) {
  const { data: existing } = await supabaseAdmin
    .from('chat_messages')
    .select('sender_id')
    .eq('id', messageId)
    .single();
  if (!existing) throw new ApiError(404, 'Message not found');
  if (existing.sender_id !== userId) throw new ApiError(403, 'Can only edit your own messages');

  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .update({ content, is_edited: true, edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .select('*')
    .single();
  if (error) throw new ApiError(400, error.message);

  const pMap = await fetchProfiles([data.sender_id]);
  data.profiles = pMap[data.sender_id] || { id: data.sender_id, full_name: null, avatar_url: null };
  return data;
}

export async function deleteMessage(userId, messageId) {
  const { data: existing } = await supabaseAdmin
    .from('chat_messages')
    .select('sender_id, channel_id')
    .eq('id', messageId)
    .single();
  if (!existing) throw new ApiError(404, 'Message not found');

  // Allow sender or channel admin
  if (existing.sender_id !== userId) {
    const { data: mem } = await supabaseAdmin
      .from('chat_channel_members')
      .select('role')
      .eq('channel_id', existing.channel_id)
      .eq('user_id', userId)
      .single();
    if (!mem || mem.role !== 'admin') throw new ApiError(403, 'Not authorized to delete this message');
  }

  // Delete attachments from storage
  const { data: atts } = await supabaseAdmin
    .from('chat_message_attachments')
    .select('storage_path')
    .eq('message_id', messageId);
  if (atts?.length) {
    await supabaseAdmin.storage
      .from('chat-attachments')
      .remove(atts.map(a => a.storage_path));
  }

  const { error } = await supabaseAdmin
    .from('chat_messages')
    .delete()
    .eq('id', messageId);
  if (error) throw new ApiError(400, error.message);
  return { success: true };
}

// ── Threads ──

export async function getThread(userId, messageId, { limit = 50 } = {}) {
  // Get the parent message
  const { data: parent, error: pErr } = await supabaseAdmin
    .from('chat_messages')
    .select(`
      *,
      chat_message_attachments(*),
      chat_reactions(id, emoji, user_id),
      chat_mentions(id, mention_type, mention_id)
    `)
    .eq('id', messageId)
    .single();
  if (pErr || !parent) throw new ApiError(404, 'Message not found');

  await verifyMembership(parent.channel_id, userId);

  // Get replies
  const { data: replies, error: rErr } = await supabaseAdmin
    .from('chat_messages')
    .select(`
      *,
      chat_message_attachments(*),
      chat_reactions(id, emoji, user_id),
      chat_mentions(id, mention_type, mention_id)
    `)
    .eq('parent_message_id', messageId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (rErr) throw new ApiError(500, rErr.message);

  // Attach profiles to parent + replies
  await attachProfilesToMessages([parent, ...replies]);

  return { parent, replies };
}

// ── Reactions ──

export async function addReaction(userId, messageId, emoji) {
  const { data: msg } = await supabaseAdmin
    .from('chat_messages')
    .select('channel_id')
    .eq('id', messageId)
    .single();
  if (!msg) throw new ApiError(404, 'Message not found');
  await verifyMembership(msg.channel_id, userId);

  const { data, error } = await supabaseAdmin
    .from('chat_reactions')
    .insert({ message_id: messageId, user_id: userId, emoji })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') throw new ApiError(409, 'Already reacted');
    throw new ApiError(400, error.message);
  }
  return data;
}

export async function removeReaction(userId, messageId, emoji) {
  const { error } = await supabaseAdmin
    .from('chat_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', emoji);
  if (error) throw new ApiError(400, error.message);
  return { success: true };
}

// ── File Upload ──

export async function uploadAttachment(orgId, channelId, userId, fileBuffer, originalName, mimeType, fileSize) {
  await verifyMembership(channelId, userId);

  const ext = originalName.split('.').pop() || 'bin';
  const uuid = crypto.randomUUID();
  const storagePath = `${orgId}/${channelId}/${uuid}.${ext}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from('chat-attachments')
    .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: false });
  if (uploadErr) throw new ApiError(400, 'Upload failed: ' + uploadErr.message);

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('chat-attachments')
    .getPublicUrl(storagePath);

  // Determine if image for thumbnail
  const isImage = mimeType?.startsWith('image/');

  const { data, error } = await supabaseAdmin
    .from('chat_message_attachments')
    .insert({
      message_id: null, // Will be linked when message is sent
      file_url: publicUrl,
      file_name: originalName,
      file_type: mimeType,
      file_size: fileSize,
      storage_path: storagePath,
      thumbnail_url: isImage ? publicUrl : null,
    })
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);
  return data;
}

// ── Pins ──

export async function listPins(userId, channelId) {
  await verifyMembership(channelId, userId);

  const { data, error } = await supabaseAdmin
    .from('chat_pins')
    .select(`
      *,
      chat_messages(*)
    `)
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false });
  if (error) throw new ApiError(500, error.message);

  // Attach profiles to pinned messages
  const pinnedMsgs = data.filter(p => p.chat_messages).map(p => p.chat_messages);
  if (pinnedMsgs.length) await attachProfilesToMessages(pinnedMsgs);
  return data;
}

export async function pinMessage(userId, channelId, messageId) {
  await verifyMembership(channelId, userId);

  const { data, error } = await supabaseAdmin
    .from('chat_pins')
    .insert({ channel_id: channelId, message_id: messageId, pinned_by: userId })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') throw new ApiError(409, 'Already pinned');
    throw new ApiError(400, error.message);
  }

  // System message
  await supabaseAdmin.from('chat_messages').insert({
    channel_id: channelId,
    sender_id: userId,
    content: 'pinned a message',
    message_type: 'system',
  });

  return data;
}

export async function unpinMessage(userId, channelId, messageId) {
  await verifyMembership(channelId, userId);

  const { error } = await supabaseAdmin
    .from('chat_pins')
    .delete()
    .eq('channel_id', channelId)
    .eq('message_id', messageId);
  if (error) throw new ApiError(400, error.message);
  return { success: true };
}

// ── Unread ──

export async function markChannelRead(userId, channelId) {
  const { error } = await supabaseAdmin
    .from('chat_channel_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('channel_id', channelId)
    .eq('user_id', userId);
  if (error) throw new ApiError(400, error.message);
  return { success: true };
}

export async function getUnreadCounts(orgId, userId) {
  const { data: memberships, error } = await supabaseAdmin
    .from('chat_channel_members')
    .select('channel_id, last_read_at')
    .eq('user_id', userId);
  if (error) throw new ApiError(500, error.message);
  if (!memberships.length) return { channels: {}, total: 0 };

  const counts = await Promise.all(memberships.map(async (m) => {
    const { count } = await supabaseAdmin
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('channel_id', m.channel_id)
      .gt('created_at', m.last_read_at)
      .neq('sender_id', userId)
      .is('parent_message_id', null);
    return [m.channel_id, count || 0];
  }));

  const channels = Object.fromEntries(counts);
  const total = Object.values(channels).reduce((s, c) => s + c, 0);
  return { channels, total };
}

// ── Search ──

export async function searchMessages(orgId, userId, query, channelId) {
  if (!query || query.trim().length < 2) throw new ApiError(400, 'Query too short');

  // Get user's channel IDs
  const { data: memberships } = await supabaseAdmin
    .from('chat_channel_members')
    .select('channel_id')
    .eq('user_id', userId);
  const allowedIds = (memberships || []).map(m => m.channel_id);
  if (!allowedIds.length) return [];

  const searchIds = channelId ? [channelId].filter(id => allowedIds.includes(id)) : allowedIds;
  if (!searchIds.length) return [];

  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .select(`
      *,
      chat_channels!inner(id, name, type)
    `)
    .in('channel_id', searchIds)
    .textSearch('content', query, { type: 'websearch' })
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new ApiError(500, error.message);

  await attachProfilesToMessages(data);
  return data;
}

// ── Mention Autocomplete ──

export async function searchMentions(orgId, userId, query, type) {
  if (!query) return [];
  const q = `%${query}%`;

  if (type === 'user' || !type) {
    const { data: users } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', supabaseAdmin.from('org_members').select('user_id').eq('org_id', orgId))
      .ilike('full_name', q)
      .limit(10);
    if (type === 'user') return (users || []).map(u => ({ ...u, mention_type: 'user' }));
    var userResults = (users || []).map(u => ({ ...u, mention_type: 'user' }));
  }

  if (type === 'client' || !type) {
    const { data: clients } = await supabaseAdmin
      .from('clients')
      .select('id, name, brand_color')
      .eq('org_id', orgId)
      .ilike('name', q)
      .limit(10);
    if (type === 'client') return (clients || []).map(c => ({ ...c, mention_type: 'client' }));
    var clientResults = (clients || []).map(c => ({ ...c, mention_type: 'client' }));
  }

  if (type === 'task' || !type) {
    const { data: tasks } = await supabaseAdmin
      .from('tasks')
      .select('id, title, status, client_id')
      .eq('org_id', orgId)
      .ilike('title', q)
      .limit(10);
    if (type === 'task') return (tasks || []).map(t => ({ ...t, mention_type: 'task' }));
    var taskResults = (tasks || []).map(t => ({ ...t, mention_type: 'task' }));
  }

  return [...(userResults || []), ...(clientResults || []), ...(taskResults || [])];
}

// ── Notification Preferences ──

export async function getNotificationPreferences(userId) {
  const { data, error } = await supabaseAdmin
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);

  // Return defaults if not set
  if (!data) {
    const { data: created, error: cErr } = await supabaseAdmin
      .from('notification_preferences')
      .insert({ user_id: userId })
      .select()
      .single();
    if (cErr) throw new ApiError(400, cErr.message);
    return created;
  }
  return data;
}

export async function updateNotificationPreferences(userId, updates) {
  const allowed = ['push_enabled', 'sound_enabled', 'desktop_enabled', 'dm_notifications', 'group_notifications', 'team_notifications', 'quiet_hours_start', 'quiet_hours_end'];
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  );
  filtered.updated_at = new Date().toISOString();

  // Upsert
  const { data, error } = await supabaseAdmin
    .from('notification_preferences')
    .upsert({ user_id: userId, ...filtered }, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);
  return data;
}

// ── Helpers ──

async function verifyMembership(channelId, userId) {
  const { data } = await supabaseAdmin
    .from('chat_channel_members')
    .select('id')
    .eq('channel_id', channelId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) throw new ApiError(403, 'Not a member of this channel');
  return data;
}

async function verifyChannelAdmin(channelId, userId, orgId) {
  const { data: mem } = await supabaseAdmin
    .from('chat_channel_members')
    .select('role')
    .eq('channel_id', channelId)
    .eq('user_id', userId)
    .maybeSingle();

  if (mem?.role === 'admin') return;

  // Allow org owners/leads
  const { data: orgMem } = await supabaseAdmin
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .single();
  if (orgMem && ['owner', 'lead'].includes(orgMem.role)) return;

  throw new ApiError(403, 'Admin access required');
}
