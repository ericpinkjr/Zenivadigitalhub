import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

export async function getProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw new ApiError(404, 'Profile not found');
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
