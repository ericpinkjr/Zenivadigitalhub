import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Validate an approval token and return it.
 */
async function validateToken(token) {
  const { data, error } = await supabaseAdmin
    .from('approval_tokens')
    .select('*, clients(name, brand_color, logo_url)')
    .eq('token', token)
    .eq('resource_type', 'mood_board')
    .single();
  if (error || !data) throw new ApiError(404, 'Approval link not found');
  if (new Date(data.expires_at) < new Date()) throw new ApiError(410, 'This approval link has expired');
  return data;
}

/**
 * Get full mood board by approval token (public — client portal).
 */
export async function getBoardByApprovalToken(token) {
  const approval = await validateToken(token);

  const { data: board } = await supabaseAdmin
    .from('mood_boards')
    .select('*')
    .eq('id', approval.resource_id)
    .single();
  if (!board) throw new ApiError(404, 'Board not found');

  const { data: shots } = await supabaseAdmin
    .from('mood_board_shots')
    .select('*, mood_board_images(*), mood_board_comments(*)')
    .eq('board_id', board.id)
    .order('position', { ascending: true });

  board.shots = (shots || []).map(s => ({
    ...s,
    images: (s.mood_board_images || []).sort((a, b) => a.position - b.position),
    comments: (s.mood_board_comments || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    mood_board_images: undefined,
    mood_board_comments: undefined,
  }));

  return {
    approval,
    board,
    client: approval.clients,
  };
}

/**
 * Client responds to a specific shot (approve/reject).
 */
export async function respondToShot(token, shotId, { status, feedback }) {
  const approval = await validateToken(token);

  if (!['approved', 'rejected'].includes(status)) {
    throw new ApiError(400, 'Status must be approved or rejected');
  }

  // Verify shot belongs to this board
  const { data: shot, error: shotErr } = await supabaseAdmin
    .from('mood_board_shots')
    .select('id, board_id')
    .eq('id', shotId)
    .eq('board_id', approval.resource_id)
    .single();
  if (shotErr || !shot) throw new ApiError(404, 'Shot not found on this board');

  const { data, error } = await supabaseAdmin
    .from('mood_board_shots')
    .update({
      approval_status: status,
      client_feedback: feedback || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', shotId)
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);
  return data;
}

/**
 * Client adds a comment on a shot via approval portal.
 */
export async function addClientComment(token, shotId, { body, authorName }) {
  const approval = await validateToken(token);
  if (!body?.trim()) throw new ApiError(400, 'Comment body is required');

  // Verify shot belongs to this board
  const { error: shotErr } = await supabaseAdmin
    .from('mood_board_shots')
    .select('id')
    .eq('id', shotId)
    .eq('board_id', approval.resource_id)
    .single();
  if (shotErr) throw new ApiError(404, 'Shot not found on this board');

  const clientName = approval.clients?.name || authorName || 'Client';
  const { data, error } = await supabaseAdmin
    .from('mood_board_comments')
    .insert({
      shot_id: shotId,
      author_name: clientName,
      author_type: 'client',
      body: body.trim(),
    })
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);
  return data;
}
