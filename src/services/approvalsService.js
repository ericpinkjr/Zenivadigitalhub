import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Create an approval token for a copy variant or report.
 * Token expires after the specified number of days (default 7).
 */
export async function createApprovalToken(orgId, { resourceType, resourceId, clientId, expiresInDays = 7 }) {
  if (!resourceType || !resourceId || !clientId) {
    throw new ApiError(400, 'resourceType, resourceId, and clientId are required');
  }

  // Verify client ownership
  const { error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('org_id', orgId)
    .single();
  if (clientErr) throw new ApiError(404, 'Client not found');

  // Verify the resource exists
  const tableMap = { copy: 'ad_copy', report: 'reports', mood_board: 'mood_boards' };
  const table = tableMap[resourceType];
  if (!table) throw new ApiError(400, `Invalid resource type: ${resourceType}`);
  const { error: resErr } = await supabaseAdmin
    .from(table)
    .select('id')
    .eq('id', resourceId)
    .single();
  if (resErr) throw new ApiError(404, `${resourceType} not found`);

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const { data, error } = await supabaseAdmin
    .from('approval_tokens')
    .insert({
      org_id: orgId,
      token,
      resource_type: resourceType,
      resource_id: resourceId,
      client_id: clientId,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}

/**
 * Get approval details by token (public — used by client portal).
 */
export async function getApprovalByToken(token) {
  const { data, error } = await supabaseAdmin
    .from('approval_tokens')
    .select('*, clients(name, brand_color, logo_url)')
    .eq('token', token)
    .single();

  if (error || !data) throw new ApiError(404, 'Approval link not found');

  if (new Date(data.expires_at) < new Date()) {
    throw new ApiError(410, 'This approval link has expired');
  }

  // Fetch the resource data
  let resource = null;
  const resourceTableMap = { copy: 'ad_copy', report: 'reports', mood_board: 'mood_boards' };
  const resourceTable = resourceTableMap[data.resource_type];
  if (resourceTable) {
    const { data: res } = await supabaseAdmin
      .from(resourceTable)
      .select('*')
      .eq('id', data.resource_id)
      .single();
    resource = res;
  }

  return { ...data, resource };
}

/**
 * Respond to an approval (approve/reject with optional comment).
 * Public endpoint — used by client portal.
 */
export async function respondToApproval(token, { status, comment }) {
  if (!['approved', 'rejected'].includes(status)) {
    throw new ApiError(400, 'Status must be approved or rejected');
  }

  const { data: existing, error: findErr } = await supabaseAdmin
    .from('approval_tokens')
    .select('*')
    .eq('token', token)
    .single();

  if (findErr || !existing) throw new ApiError(404, 'Approval link not found');
  if (new Date(existing.expires_at) < new Date()) throw new ApiError(410, 'This approval link has expired');
  if (existing.status !== 'pending') throw new ApiError(400, 'This approval has already been responded to');

  const { data, error } = await supabaseAdmin
    .from('approval_tokens')
    .update({
      status,
      client_comment: comment || null,
      responded_at: new Date().toISOString(),
    })
    .eq('token', token)
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);

  // If approved and resource is copy, update copy status to 'approved'
  if (status === 'approved' && existing.resource_type === 'copy') {
    await supabaseAdmin
      .from('ad_copy')
      .update({ status: 'approved' })
      .eq('id', existing.resource_id);
  }

  return data;
}

/**
 * List all approval tokens for the authenticated user.
 */
export async function listApprovals(orgId, { clientId, status } = {}) {
  let query = supabaseAdmin
    .from('approval_tokens')
    .select('*, clients(name, brand_color)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (clientId) query = query.eq('client_id', clientId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);
  return data;
}
