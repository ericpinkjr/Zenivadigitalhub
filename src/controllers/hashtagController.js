import * as hashtagService from '../services/hashtagService.js';
import { syncClientInstagram } from '../services/instagramService.js';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';
import { logSync } from '../jobs/metaSyncCron.js';

export async function getHashtags(req, res, next) {
  try {
    const { id: clientId } = req.params;
    const { sortBy, order, limit } = req.query;
    const data = await hashtagService.getHashtags(req.org.id, clientId, {
      sortBy,
      order,
      limit: limit ? parseInt(limit) : undefined,
    });
    res.json(data);
  } catch (e) { next(e); }
}

export async function getHashtagPosts(req, res, next) {
  try {
    const { id: clientId, hashtag } = req.params;
    const { limit } = req.query;
    const data = await hashtagService.getHashtagPosts(req.org.id, clientId, hashtag, {
      limit: limit ? parseInt(limit) : undefined,
    });
    res.json(data);
  } catch (e) { next(e); }
}

export async function getHashtagTrend(req, res, next) {
  try {
    const { id: clientId, hashtag } = req.params;
    const data = await hashtagService.getHashtagTrend(req.org.id, clientId, hashtag);
    res.json(data);
  } catch (e) { next(e); }
}

export async function getClientPosts(req, res, next) {
  try {
    const { id: clientId } = req.params;
    const { limit, offset, sortBy } = req.query;
    const data = await hashtagService.getClientPosts(req.org.id, clientId, {
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
      sortBy,
    });
    res.json(data);
  } catch (e) { next(e); }
}

const SYNC_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

export async function syncInstagram(req, res, next) {
  try {
    const { id: clientId } = req.params;

    // Verify ownership
    const { error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('org_id', req.org.id)
      .single();
    if (clientErr) throw new ApiError(404, 'Client not found');

    // Rate limit: check last sync time
    const { data: latest } = await supabaseAdmin
      .from('ig_account_metrics')
      .select('synced_at')
      .eq('client_id', clientId)
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest?.synced_at) {
      const elapsed = Date.now() - new Date(latest.synced_at).getTime();
      if (elapsed < SYNC_COOLDOWN_MS) {
        const waitMin = Math.ceil((SYNC_COOLDOWN_MS - elapsed) / 60000);
        throw new ApiError(429, `Please wait ${waitMin} minute(s) before syncing again`);
      }
    }

    const igStart = new Date().toISOString();
    const result = await syncClientInstagram(clientId);
    await logSync(clientId, 'instagram', 'manual', result.skipped ? 'skipped' : 'success', {
      days_synced: result.days_synced,
      media_synced: result.media_synced,
      hashtags_parsed: result.hashtags_parsed,
    }, igStart);
    res.json(result);
  } catch (e) { next(e); }
}

export async function getSyncLog(req, res, next) {
  try {
    const { id: clientId } = req.params;
    const { limit } = req.query;

    // Verify ownership
    const { error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('org_id', req.org.id)
      .single();
    if (clientErr) throw new ApiError(404, 'Client not found');

    const { data, error } = await supabaseAdmin
      .from('sync_log')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(limit ? parseInt(limit) : 20);

    if (error) throw new ApiError(500, error.message);
    res.json(data || []);
  } catch (e) { next(e); }
}
