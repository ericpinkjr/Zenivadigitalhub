import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

export async function getOrganization(orgId) {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();

  if (error) throw new ApiError(404, 'Organization not found');
  return data;
}

export async function updateOrganization(orgId, userId, updates) {
  // Only owner can update
  const { data: org, error: orgErr } = await supabaseAdmin
    .from('organizations')
    .select('owner_id')
    .eq('id', orgId)
    .single();

  if (orgErr || !org) throw new ApiError(404, 'Organization not found');
  if (org.owner_id !== userId) throw new ApiError(403, 'Only the organization owner can update');

  const patch = {};
  if (updates.name !== undefined) patch.name = updates.name;

  const { data, error } = await supabaseAdmin
    .from('organizations')
    .update(patch)
    .eq('id', orgId)
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function listMembers(orgId) {
  const { data: members, error } = await supabaseAdmin
    .from('org_members')
    .select('*')
    .eq('org_id', orgId)
    .order('joined_at', { ascending: true });

  if (error) throw new ApiError(500, error.message);

  // Fetch profiles for each member
  if (members && members.length > 0) {
    const userIds = members.map(m => m.user_id);
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role')
      .in('id', userIds);

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    return members.map(m => ({
      ...m,
      profile: profileMap[m.user_id] || null,
    }));
  }

  return members;
}

export async function changeMemberRole(orgId, userId, targetUserId, newRole) {
  // Only owner can change roles
  const { data: org, error: orgErr } = await supabaseAdmin
    .from('organizations')
    .select('owner_id')
    .eq('id', orgId)
    .single();

  if (orgErr || !org) throw new ApiError(404, 'Organization not found');
  if (org.owner_id !== userId) throw new ApiError(403, 'Only the organization owner can change roles');
  if (userId === targetUserId) throw new ApiError(400, 'Cannot change your own role');

  const { data, error } = await supabaseAdmin
    .from('org_members')
    .update({ role: newRole })
    .eq('org_id', orgId)
    .eq('user_id', targetUserId)
    .select()
    .single();

  if (error) throw new ApiError(404, 'Member not found');
  return data;
}

export async function removeMember(orgId, userId, targetUserId) {
  // Only owner can remove members
  const { data: org, error: orgErr } = await supabaseAdmin
    .from('organizations')
    .select('owner_id')
    .eq('id', orgId)
    .single();

  if (orgErr || !org) throw new ApiError(404, 'Organization not found');
  if (org.owner_id !== userId) throw new ApiError(403, 'Only the organization owner can remove members');
  if (userId === targetUserId) throw new ApiError(400, 'Cannot remove yourself from the organization');

  // 1. Delete team_members rows for this user in this org's teams
  const { data: teams } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('org_id', orgId);

  if (teams && teams.length > 0) {
    const teamIds = teams.map(t => t.id);
    await supabaseAdmin
      .from('team_members')
      .delete()
      .in('team_id', teamIds)
      .eq('user_id', targetUserId);
  }

  // 2. Delete the org_members row
  const { error } = await supabaseAdmin
    .from('org_members')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', targetUserId);

  if (error) throw new ApiError(400, error.message);
  return { success: true };
}
