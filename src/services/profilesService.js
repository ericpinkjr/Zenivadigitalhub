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
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}
