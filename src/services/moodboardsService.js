import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

const BUCKET = 'mood-board-images';

// ── Helpers ──

async function verifyBoardOwner(orgId, boardId) {
  const { data, error } = await supabaseAdmin
    .from('mood_boards')
    .select('id')
    .eq('id', boardId)
    .eq('org_id', orgId)
    .single();
  if (error || !data) throw new ApiError(404, 'Board not found');
  return data;
}

async function verifyShotOwner(orgId, shotId) {
  const { data, error } = await supabaseAdmin
    .from('mood_board_shots')
    .select('id, board_id, mood_boards!inner(org_id)')
    .eq('id', shotId)
    .single();
  if (error || !data) throw new ApiError(404, 'Shot not found');
  if (data.mood_boards.org_id !== orgId) throw new ApiError(403, 'Forbidden');
  return data;
}

// ── Boards ──

export async function createBoard(orgId, { name, clientId, description, theme, isTemplate } = {}) {
  const row = {
    org_id: orgId,
    name: name || 'Untitled Board',
    client_id: clientId || null,
    description: description || null,
    is_template: isTemplate || false,
    theme: theme || undefined,
  };
  const { data, error } = await supabaseAdmin
    .from('mood_boards')
    .insert(row)
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function listBoards(orgId, { clientId } = {}) {
  let query = supabaseAdmin
    .from('mood_boards')
    .select('*, mood_board_shots(id), clients(name)')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });
  if (clientId) query = query.eq('client_id', clientId);
  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);
  return (data || []).map(b => ({
    ...b,
    shot_count: (b.mood_board_shots || []).length,
    mood_board_shots: undefined,
  }));
}

export async function getBoard(orgId, boardId) {
  await verifyBoardOwner(orgId, boardId);

  const { data: board, error } = await supabaseAdmin
    .from('mood_boards')
    .select('*, clients(name, brand_color, logo_url)')
    .eq('id', boardId)
    .single();
  if (error) throw new ApiError(500, error.message);

  const { data: shots } = await supabaseAdmin
    .from('mood_board_shots')
    .select('*, mood_board_images(*), mood_board_comments(*)')
    .eq('board_id', boardId)
    .order('position', { ascending: true });

  board.shots = (shots || []).map(s => ({
    ...s,
    images: (s.mood_board_images || []).sort((a, b) => a.position - b.position),
    comments: (s.mood_board_comments || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    mood_board_images: undefined,
    mood_board_comments: undefined,
  }));

  return board;
}

export async function updateBoard(orgId, boardId, updates) {
  await verifyBoardOwner(orgId, boardId);
  const allowed = ['name', 'description', 'client_id', 'theme', 'status', 'is_template'];
  const patch = { updated_at: new Date().toISOString() };
  for (const k of allowed) {
    if (updates[k] !== undefined) patch[k] = updates[k];
  }
  const { data, error } = await supabaseAdmin
    .from('mood_boards')
    .update(patch)
    .eq('id', boardId)
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function deleteBoard(orgId, boardId) {
  await verifyBoardOwner(orgId, boardId);

  // Delete images from storage
  const { data: shots } = await supabaseAdmin
    .from('mood_board_shots')
    .select('id')
    .eq('board_id', boardId);
  if (shots?.length) {
    const shotIds = shots.map(s => s.id);
    const { data: images } = await supabaseAdmin
      .from('mood_board_images')
      .select('storage_path')
      .in('shot_id', shotIds);
    if (images?.length) {
      await supabaseAdmin.storage
        .from(BUCKET)
        .remove(images.map(i => i.storage_path));
    }
  }

  const { error } = await supabaseAdmin
    .from('mood_boards')
    .delete()
    .eq('id', boardId);
  if (error) throw new ApiError(500, error.message);
  return { deleted: true };
}

export async function duplicateBoard(orgId, boardId, { name, clientId } = {}) {
  const original = await getBoard(orgId, boardId);

  const newBoard = await createBoard(orgId, {
    name: name || `${original.name} (Copy)`,
    clientId: clientId || original.client_id,
    description: original.description,
    theme: original.theme,
    isTemplate: false,
  });

  for (const shot of original.shots) {
    const { data: newShot } = await supabaseAdmin
      .from('mood_board_shots')
      .insert({
        board_id: newBoard.id,
        position: shot.position,
        title: shot.title,
        description: shot.description,
        notes: shot.notes,
      })
      .select()
      .single();

    if (shot.images?.length && newShot) {
      const imageRows = shot.images.map(img => ({
        shot_id: newShot.id,
        storage_path: img.storage_path,
        public_url: img.public_url,
        position: img.position,
        file_name: img.file_name,
        file_size: img.file_size,
      }));
      await supabaseAdmin.from('mood_board_images').insert(imageRows);
    }
  }

  return getBoard(orgId, newBoard.id);
}

// ── Shots ──

export async function addShot(orgId, boardId, { title, description, position } = {}) {
  await verifyBoardOwner(orgId, boardId);

  if (position === undefined) {
    const { count } = await supabaseAdmin
      .from('mood_board_shots')
      .select('id', { count: 'exact', head: true })
      .eq('board_id', boardId);
    position = count || 0;
  }

  const { data, error } = await supabaseAdmin
    .from('mood_board_shots')
    .insert({ board_id: boardId, title: title || 'New Shot', description, position })
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);

  await supabaseAdmin.from('mood_boards').update({ updated_at: new Date().toISOString() }).eq('id', boardId);
  return data;
}

export async function updateShot(orgId, shotId, updates) {
  const shot = await verifyShotOwner(orgId, shotId);
  const allowed = ['title', 'description', 'notes', 'position'];
  const patch = { updated_at: new Date().toISOString() };
  for (const k of allowed) {
    if (updates[k] !== undefined) patch[k] = updates[k];
  }
  const { data, error } = await supabaseAdmin
    .from('mood_board_shots')
    .update(patch)
    .eq('id', shotId)
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);

  await supabaseAdmin.from('mood_boards').update({ updated_at: new Date().toISOString() }).eq('id', shot.board_id);
  return data;
}

export async function deleteShot(orgId, shotId) {
  const shot = await verifyShotOwner(orgId, shotId);

  // Delete images from storage
  const { data: images } = await supabaseAdmin
    .from('mood_board_images')
    .select('storage_path')
    .eq('shot_id', shotId);
  if (images?.length) {
    await supabaseAdmin.storage.from(BUCKET).remove(images.map(i => i.storage_path));
  }

  const { error } = await supabaseAdmin.from('mood_board_shots').delete().eq('id', shotId);
  if (error) throw new ApiError(500, error.message);

  await supabaseAdmin.from('mood_boards').update({ updated_at: new Date().toISOString() }).eq('id', shot.board_id);
  return { deleted: true };
}

export async function reorderShots(orgId, boardId, shotIds) {
  await verifyBoardOwner(orgId, boardId);
  for (let i = 0; i < shotIds.length; i++) {
    await supabaseAdmin
      .from('mood_board_shots')
      .update({ position: i })
      .eq('id', shotIds[i])
      .eq('board_id', boardId);
  }
  await supabaseAdmin.from('mood_boards').update({ updated_at: new Date().toISOString() }).eq('id', boardId);
  return { reordered: true };
}

export async function toggleShotComplete(orgId, shotId) {
  const shot = await verifyShotOwner(orgId, shotId);
  const { data: current } = await supabaseAdmin
    .from('mood_board_shots')
    .select('is_completed')
    .eq('id', shotId)
    .single();

  const nowComplete = !current.is_completed;
  const { data, error } = await supabaseAdmin
    .from('mood_board_shots')
    .update({
      is_completed: nowComplete,
      completed_at: nowComplete ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', shotId)
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);

  await supabaseAdmin.from('mood_boards').update({ updated_at: new Date().toISOString() }).eq('id', shot.board_id);
  return data;
}

// ── Images ──

export async function uploadImage(orgId, shotId, fileBuffer, fileName, fileSize) {
  const shot = await verifyShotOwner(orgId, shotId);

  let ext = (fileName.split('.').pop() || 'jpg').toLowerCase();
  let buffer = fileBuffer;
  let contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

  // HEIC/HEIF should already be converted to JPEG on the client side
  // If somehow a HEIC still arrives, just store it as-is (won't preview in browser)

  const storagePath = `${shot.board_id}/${shotId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
    });
  if (uploadErr) throw new ApiError(500, `Upload failed: ${uploadErr.message}`);

  const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);

  // Get next position
  const { count } = await supabaseAdmin
    .from('mood_board_images')
    .select('id', { count: 'exact', head: true })
    .eq('shot_id', shotId);

  const { data, error } = await supabaseAdmin
    .from('mood_board_images')
    .insert({
      shot_id: shotId,
      storage_path: storagePath,
      public_url: urlData.publicUrl,
      position: count || 0,
      file_name: fileName,
      file_size: fileSize || null,
    })
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);

  await supabaseAdmin.from('mood_boards').update({ updated_at: new Date().toISOString() }).eq('id', shot.board_id);
  return data;
}

export async function deleteImage(orgId, imageId) {
  const { data: img, error: findErr } = await supabaseAdmin
    .from('mood_board_images')
    .select('*, mood_board_shots!inner(board_id, mood_boards!inner(org_id))')
    .eq('id', imageId)
    .single();
  if (findErr || !img) throw new ApiError(404, 'Image not found');
  if (img.mood_board_shots.mood_boards.org_id !== orgId) throw new ApiError(403, 'Forbidden');

  await supabaseAdmin.storage.from(BUCKET).remove([img.storage_path]);
  const { error } = await supabaseAdmin.from('mood_board_images').delete().eq('id', imageId);
  if (error) throw new ApiError(500, error.message);
  return { deleted: true };
}

// ── Comments ──

export async function addComment(orgId, shotId, { body, authorName }) {
  await verifyShotOwner(orgId, shotId);
  if (!body?.trim()) throw new ApiError(400, 'Comment body is required');
  const { data, error } = await supabaseAdmin
    .from('mood_board_comments')
    .insert({
      shot_id: shotId,
      author_name: authorName || 'Team',
      author_type: 'team',
      body: body.trim(),
    })
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);
  return data;
}
