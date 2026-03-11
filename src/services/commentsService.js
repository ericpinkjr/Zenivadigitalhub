import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

export async function getComments(reportId) {
  const { data, error } = await supabaseAdmin
    .from('report_comments')
    .select('*')
    .eq('report_id', reportId)
    .order('created_at', { ascending: true });

  if (error) throw new ApiError(500, error.message);
  return data;
}

export async function addComment(commentData) {
  const { data, error } = await supabaseAdmin
    .from('report_comments')
    .insert(commentData)
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function getReactions(reportId) {
  const { data, error } = await supabaseAdmin
    .from('report_reactions')
    .select('*')
    .eq('report_id', reportId);

  if (error) throw new ApiError(500, error.message);
  return data;
}

export async function addReaction(reactionData) {
  const { data, error } = await supabaseAdmin
    .from('report_reactions')
    .insert(reactionData)
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}
