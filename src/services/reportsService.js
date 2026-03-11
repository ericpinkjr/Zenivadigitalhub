import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

export async function getReports(ownerId, clientId) {
  const { data, error } = await supabaseAdmin
    .from('reports')
    .select('*')
    .eq('client_id', clientId)
    .eq('owner_id', ownerId)
    .order('year', { ascending: true });

  if (error) throw new ApiError(500, error.message);
  return data;
}

export async function getAllReports(ownerId) {
  const { data, error } = await supabaseAdmin
    .from('reports')
    .select('id, client_id, month, year, published, created_at, ig_followers, ig_new_followers, ig_unfollows, ig_reach, ig_likes, ig_comments, ig_shares, ig_saves, tk_followers, tk_net_followers, tk_video_views, tk_likes, tk_comments, tk_shares')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });

  if (error) throw new ApiError(500, error.message);
  return data;
}

export async function saveReport(ownerId, reportData) {
  const { data, error } = await supabaseAdmin
    .from('reports')
    .insert({ ...reportData, owner_id: ownerId })
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function patchReport(ownerId, reportId, updates) {
  const { data, error } = await supabaseAdmin
    .from('reports')
    .update(updates)
    .eq('id', reportId)
    .eq('owner_id', ownerId)
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function getPublicReport(slug) {
  const { data, error } = await supabaseAdmin
    .from('reports')
    .select('*')
    .eq('share_slug', slug)
    .eq('published', true)
    .single();

  if (error) throw new ApiError(404, 'Report not found');
  return data;
}

export async function getPublicReportsForClient(clientId) {
  const { data, error } = await supabaseAdmin
    .from('reports')
    .select('*')
    .eq('client_id', clientId)
    .eq('published', true)
    .order('year', { ascending: true });

  if (error) throw new ApiError(500, error.message);
  return data;
}
