import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

export async function createInvitation(orgId, userId, { email, role, teamId }) {
  if (!email) throw new ApiError(400, 'email is required');

  // Check for an existing pending invitation for this email in this org
  const { data: existing } = await supabaseAdmin
    .from('invitations')
    .select('id')
    .eq('org_id', orgId)
    .eq('email', email)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) throw new ApiError(409, 'A pending invitation already exists for this email');

  const token = crypto.randomBytes(32).toString('hex');

  const { data, error } = await supabaseAdmin
    .from('invitations')
    .insert({
      org_id: orgId,
      email,
      role: role || 'member',
      team_id: teamId || null,
      token,
      invited_by: userId,
    })
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);

  // Send Supabase invite email
  const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { invited_to_org: orgId },
  });
  if (inviteErr) throw new ApiError(500, inviteErr.message);

  return data;
}

export async function listInvitations(orgId) {
  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) throw new ApiError(500, error.message);
  return data;
}

export async function revokeInvitation(orgId, invitationId) {
  const { data, error } = await supabaseAdmin
    .from('invitations')
    .update({ status: 'revoked' })
    .eq('id', invitationId)
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .select()
    .single();

  if (error) throw new ApiError(404, 'Invitation not found or already processed');
  return data;
}

export async function getInviteInfo(token) {
  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select('email, role, org_id, invited_by, organizations(name), profiles!invited_by(full_name)')
    .eq('token', token)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) throw new ApiError(404, 'Invitation not found or expired');

  return {
    orgName: data.organizations?.name,
    inviterName: data.profiles?.full_name,
    email: data.email,
    role: data.role,
  };
}

export async function acceptInvitation(token, userId) {
  const { data: invitation, error: findErr } = await supabaseAdmin
    .from('invitations')
    .select('*')
    .eq('token', token)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .single();

  if (findErr || !invitation) throw new ApiError(404, 'Invitation not found or expired');

  // Add user to organization
  const { error: memberErr } = await supabaseAdmin
    .from('org_members')
    .insert({ org_id: invitation.org_id, user_id: userId, role: invitation.role });

  if (memberErr) throw new ApiError(400, memberErr.message);

  // Add user to team if specified
  if (invitation.team_id) {
    const { error: teamErr } = await supabaseAdmin
      .from('team_members')
      .insert({ team_id: invitation.team_id, user_id: userId });

    if (teamErr) throw new ApiError(400, teamErr.message);
  }

  // Mark invitation as accepted
  const { error: updateErr } = await supabaseAdmin
    .from('invitations')
    .update({ status: 'accepted' })
    .eq('id', invitation.id);

  if (updateErr) throw new ApiError(500, updateErr.message);

  return { success: true };
}
