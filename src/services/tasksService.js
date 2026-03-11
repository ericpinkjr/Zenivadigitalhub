import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

export async function listTasks(ownerId, { clientId, status, dueBefore, dueAfter } = {}) {
  let query = supabaseAdmin
    .from('tasks')
    .select('*, clients(name, brand_color), campaigns(name)')
    .eq('owner_id', ownerId)
    .order('due_date', { ascending: true, nullsFirst: false });

  if (clientId) query = query.eq('client_id', clientId);
  if (status) query = query.eq('status', status);
  if (dueBefore) query = query.lte('due_date', dueBefore);
  if (dueAfter) query = query.gte('due_date', dueAfter);

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);
  return data;
}

export async function createTask(ownerId, taskData) {
  const { client_id, campaign_id, title, description, task_type, assigned_to, due_date } = taskData;
  if (!client_id || !title) throw new ApiError(400, 'client_id and title are required');

  // Verify client ownership
  const { error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('id', client_id)
    .eq('owner_id', ownerId)
    .single();
  if (clientErr) throw new ApiError(404, 'Client not found');

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .insert({
      owner_id: ownerId,
      client_id,
      campaign_id: campaign_id || null,
      title,
      description: description || null,
      task_type: task_type || 'general',
      assigned_to: assigned_to || null,
      due_date: due_date || null,
    })
    .select('*, clients(name, brand_color), campaigns(name)')
    .single();

  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function updateTask(ownerId, taskId, updates) {
  const { data: existing, error: findErr } = await supabaseAdmin
    .from('tasks')
    .select('id')
    .eq('id', taskId)
    .eq('owner_id', ownerId)
    .single();
  if (findErr || !existing) throw new ApiError(404, 'Task not found');

  const allowed = ['title', 'description', 'task_type', 'status', 'assigned_to', 'due_date', 'campaign_id'];
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

export async function deleteTask(ownerId, taskId) {
  const { error: findErr } = await supabaseAdmin
    .from('tasks')
    .select('id')
    .eq('id', taskId)
    .eq('owner_id', ownerId)
    .single();
  if (findErr) throw new ApiError(404, 'Task not found');

  const { error } = await supabaseAdmin
    .from('tasks')
    .delete()
    .eq('id', taskId);

  if (error) throw new ApiError(400, error.message);
  return { success: true };
}
