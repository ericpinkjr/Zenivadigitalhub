import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

export async function listTeams(orgId) {
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('*, team_members(id, user_id, role, profiles:user_id(full_name))')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });

  if (error) throw new ApiError(500, error.message);
  return data;
}

export async function createTeam(orgId, { name, description }) {
  if (!name) throw new ApiError(400, 'Team name is required');

  const { data, error } = await supabaseAdmin
    .from('teams')
    .insert({ org_id: orgId, name, description })
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function updateTeam(orgId, teamId, updates) {
  const { name, description } = updates;
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;

  const { data, error } = await supabaseAdmin
    .from('teams')
    .update(patch)
    .eq('id', teamId)
    .eq('org_id', orgId)
    .select()
    .single();

  if (error) throw new ApiError(404, 'Team not found or does not belong to this organization');
  return data;
}

export async function deleteTeam(orgId, teamId) {
  const { error } = await supabaseAdmin
    .from('teams')
    .delete()
    .eq('id', teamId)
    .eq('org_id', orgId);

  if (error) throw new ApiError(400, error.message);
  return { success: true };
}

export async function addTeamMember(orgId, teamId, { userId, role }) {
  // 1. Verify team belongs to this org
  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('id', teamId)
    .eq('org_id', orgId)
    .single();

  if (teamErr || !team) throw new ApiError(404, 'Team not found in this organization');

  // 2. Verify target user is an org member
  const { data: membership, error: memErr } = await supabaseAdmin
    .from('org_members')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .single();

  if (memErr || !membership) throw new ApiError(400, 'User is not a member of this organization');

  // 3. If role is 'lead', demote any existing lead to 'member'
  if (role === 'lead') {
    await supabaseAdmin
      .from('team_members')
      .update({ role: 'member' })
      .eq('team_id', teamId)
      .eq('role', 'lead');
  }

  // 4. Insert (upsert) the team member
  const { data, error } = await supabaseAdmin
    .from('team_members')
    .upsert({ team_id: teamId, user_id: userId, role: role || 'member' }, { onConflict: 'team_id,user_id' })
    .select()
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function removeTeamMember(orgId, teamId, targetUserId) {
  // 1. Verify team belongs to this org
  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('id', teamId)
    .eq('org_id', orgId)
    .single();

  if (teamErr || !team) throw new ApiError(404, 'Team not found in this organization');

  // 2. Delete the team member row
  const { error } = await supabaseAdmin
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', targetUserId);

  if (error) throw new ApiError(400, error.message);
  return { success: true };
}
