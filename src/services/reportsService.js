import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

export async function getReports(orgId, clientId) {
  const { data, error } = await supabaseAdmin
    .from('reports')
    .select('*')
    .eq('client_id', clientId)
    .eq('org_id', orgId)
    .order('year', { ascending: true });

  if (error) throw new ApiError(500, error.message);
  return data;
}

export async function getAllReports(orgId) {
  const { data, error } = await supabaseAdmin
    .from('reports')
    .select('*')
    .eq('org_id', orgId)
    .order('generated_at', { ascending: false });

  if (error) throw new ApiError(500, error.message);
  return data;
}

export async function saveReport(orgId, reportData) {
  const { data, error } = await supabaseAdmin
    .from('reports')
    .insert({ ...reportData, org_id: orgId })
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function patchReport(orgId, reportId, updates) {
  const { data, error } = await supabaseAdmin
    .from('reports')
    .update(updates)
    .eq('id', reportId)
    .eq('org_id', orgId)
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
