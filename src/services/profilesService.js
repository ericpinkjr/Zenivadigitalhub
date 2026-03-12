import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

export async function getProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    // Profile doesn't exist yet — auto-create one
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(userId);
    const fullName = user?.user_metadata?.full_name || '';
    const { data: newProfile, error: insertError } = await supabaseAdmin
      .from('profiles')
      .insert({ id: userId, full_name: fullName, role: 'admin' })
      .select()
      .single();

    if (insertError) throw new ApiError(500, 'Failed to create profile: ' + insertError.message);
    return newProfile;
  }

  return data;
}

export async function updateProfile(userId, updates) {
  // Whitelist allowed fields
  const patch = {};
  if (updates.full_name !== undefined) patch.full_name = updates.full_name;
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.avatar_url !== undefined) patch.avatar_url = updates.avatar_url;

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function uploadAvatar(userId, fileBuffer, mimeType) {
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const filePath = `${userId}/avatar.${ext}`;

  // Upload (upsert) to avatars bucket
  const { error: uploadErr } = await supabaseAdmin.storage
    .from('avatars')
    .upload(filePath, fileBuffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadErr) throw new ApiError(400, 'Upload failed: ' + uploadErr.message);

  // Get the public URL
  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('avatars')
    .getPublicUrl(filePath);

  // Save to profile
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}
