import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

export async function listTasks(orgId, { clientId, status, dueBefore, dueAfter, assignedToUserId, assignedToUserIds } = {}) {
  let query = supabaseAdmin
    .from('tasks')
    .select('*, clients(name, brand_color), campaigns(name)')
    .eq('org_id', orgId)
    .order('due_date', { ascending: true, nullsFirst: false });

  if (clientId) query = query.eq('client_id', clientId);
  if (status) query = query.eq('status', status);
  if (dueBefore) query = query.lte('due_date', dueBefore);
  if (dueAfter) query = query.gte('due_date', dueAfter);
  if (assignedToUserId) query = query.eq('assigned_to_user_id', assignedToUserId);
  if (assignedToUserIds?.length) query = query.in('assigned_to_user_id', assignedToUserIds);

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);

  // Enrich with assigned user profile
  const userIds = [...new Set(data.filter(t => t.assigned_to_user_id).map(t => t.assigned_to_user_id))];
  if (userIds.length) {
    const { data: profiles } = await supabaseAdmin.from('profiles').select('id, full_name, avatar_url').in('id', userIds);
    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
    data.forEach(t => { t.assigned_user = profileMap[t.assigned_to_user_id] || null; });
  }

  return data;
}

export async function createTask(orgId, taskData) {
  const { client_id, campaign_id, title, description, task_type, assigned_to, assigned_to_user_id, due_date } = taskData;
  if (!client_id || !title) throw new ApiError(400, 'client_id and title are required');

  // Verify client ownership
  const { error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('id', client_id)
    .eq('org_id', orgId)
    .single();
  if (clientErr) throw new ApiError(404, 'Client not found');

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .insert({
      org_id: orgId,
      client_id,
      campaign_id: campaign_id || null,
      title,
      description: description || null,
      task_type: task_type || 'general',
      assigned_to: assigned_to || null,
      assigned_to_user_id: assigned_to_user_id || null,
      due_date: due_date || null,
    })
    .select('*, clients(name, brand_color), campaigns(name)')
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function updateTask(orgId, taskId, updates) {
  const { data: existing, error: findErr } = await supabaseAdmin
    .from('tasks')
    .select('id')
    .eq('id', taskId)
    .eq('org_id', orgId)
    .single();
  if (findErr || !existing) throw new ApiError(404, 'Task not found');

  const allowed = ['title', 'description', 'task_type', 'status', 'assigned_to', 'assigned_to_user_id', 'due_date', 'campaign_id', 'my_day_date'];
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  );

  // Auto-set completed_at
  if (filtered.status === 'done') filtered.completed_at = new Date().toISOString();
  if (filtered.status && filtered.status !== 'done') filtered.completed_at = null;

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .update(filtered)
    .eq('id', taskId)
    .select('*, clients(name, brand_color), campaigns(name)')
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function deleteTask(orgId, taskId) {
  const { error: findErr } = await supabaseAdmin
    .from('tasks')
    .select('id')
    .eq('id', taskId)
    .eq('org_id', orgId)
    .single();
  if (findErr) throw new ApiError(404, 'Task not found');

  const { error } = await supabaseAdmin
    .from('tasks')
    .delete()
    .eq('id', taskId);

  if (error) throw new ApiError(400, error.message);
  return { success: true };
}
