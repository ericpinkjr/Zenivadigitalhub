import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

export async function createInvitation(orgId, userId, { email, role, teamId, team_id }) {
  // Accept both camelCase and snake_case for team ID
  const resolvedTeamId = teamId || team_id || null;
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
      team_id: resolvedTeamId,
      token,
      invited_by: userId,
    })
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);

  // Send Supabase invite email
  const appUrl = process.env.APP_URL || 'https://reports.zenivadigital.com';
  const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { invited_to_org: orgId },
    redirectTo: `${appUrl}?invite=${token}`,
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

export async function claimAccount(token, password, fullName) {
  if (!password || password.length < 6) throw new ApiError(400, 'Password must be at least 6 characters');

  const { data: invitation, error: findErr } = await supabaseAdmin
    .from('invitations')
    .select('*')
    .eq('token', token)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .single();

  if (findErr || !invitation) throw new ApiError(404, 'Invitation not found or expired');

  // Find the user created by inviteUserByEmail
  const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
  const user = users?.find(u => u.email === invitation.email);
  if (!user) throw new ApiError(404, 'No account found for this invitation');

  // Set password and confirm the user
  const updates = { password, email_confirm: true };
  if (fullName) updates.user_metadata = { full_name: fullName };
  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, updates);
  if (updateErr) throw new ApiError(400, updateErr.message);

  // Create/update profile
  const { error: profileErr } = await supabaseAdmin
    .from('profiles')
    .upsert({ id: user.id, full_name: fullName || '', role: invitation.role }, { onConflict: 'id' });
  if (profileErr) console.warn('Profile upsert:', profileErr.message);

  // Clean up any auto-created org from the DB trigger (e.g. "My Agency")
  // The trigger may have fired when inviteUserByEmail created the auth.users row
  const { data: existingMemberships } = await supabaseAdmin
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id);

  if (existingMemberships && existingMemberships.length > 0) {
    for (const m of existingMemberships) {
      if (m.org_id !== invitation.org_id) {
        // Check if user owns this auto-created org (they're the only member)
        const { data: orgMembers } = await supabaseAdmin
          .from('org_members')
          .select('user_id')
          .eq('org_id', m.org_id);
        if (orgMembers && orgMembers.length === 1 && orgMembers[0].user_id === user.id) {
          // Delete the auto-created org and membership
          await supabaseAdmin.from('org_members').delete().eq('org_id', m.org_id).eq('user_id', user.id);
          await supabaseAdmin.from('organizations').delete().eq('id', m.org_id).eq('owner_id', user.id);
        }
      }
    }
    // Remove any existing membership in the target org (so we can re-insert with correct role)
    await supabaseAdmin.from('org_members').delete().eq('org_id', invitation.org_id).eq('user_id', user.id);
  }

  // Add user to the correct org
  const { error: memberErr } = await supabaseAdmin
    .from('org_members')
    .insert({ org_id: invitation.org_id, user_id: user.id, role: invitation.role });
  if (memberErr) throw new ApiError(400, 'Failed to join organization: ' + memberErr.message);

  // Add to team if specified
  if (invitation.team_id) {
    await supabaseAdmin.from('team_members').delete().eq('team_id', invitation.team_id).eq('user_id', user.id);
    const { error: teamErr } = await supabaseAdmin
      .from('team_members')
      .insert({ team_id: invitation.team_id, user_id: user.id });
    if (teamErr) throw new ApiError(400, 'Failed to join team: ' + teamErr.message);
  }

  // Mark invitation as accepted
  await supabaseAdmin.from('invitations').update({ status: 'accepted' }).eq('id', invitation.id);

  return { success: true, email: invitation.email };
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
