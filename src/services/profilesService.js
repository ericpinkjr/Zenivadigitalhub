import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

// Helper: attach email from auth.users to a profile object
async function attachEmail(profile) {
  try {
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(profile.id);
    if (user) profile.email = user.email;
  } catch { /* ignore */ }
  return profile;
}

export async function getProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  let profile;
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
    profile = newProfile;
  } else {
    profile = data;
  }

  return attachEmail(profile);
}

export async function updateProfile(userId, updates) {
  // Whitelist allowed fields
  const patch = {};
  if (updates.full_name !== undefined) patch.full_name = updates.full_name;
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.bio !== undefined) patch.bio = updates.bio;
  if (updates.avatar_url !== undefined) patch.avatar_url = updates.avatar_url;

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return attachEmail(data);
}

export async function changeEmail(userId, newEmail) {
  if (!newEmail || !newEmail.includes('@')) throw new ApiError(400, 'Valid email is required');

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email: newEmail,
  });

  if (error) throw new ApiError(400, error.message);
  return { message: 'Confirmation email sent to ' + newEmail };
}

export async function resetPassword(userId) {
  // Get the user's email first
  const { data: { user }, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userErr || !user) throw new ApiError(400, 'Could not find user');

  const appUrl = process.env.APP_URL || 'https://reports.zenivadigital.com';
  const { error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email: user.email,
    options: { redirectTo: appUrl },
  });

  if (error) throw new ApiError(400, error.message);
  return { message: 'Password reset email sent to ' + user.email };
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
  return attachEmail(data);
}
