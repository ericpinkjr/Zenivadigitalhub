import cron from 'node-cron';
import { supabaseAdmin } from '../config/supabase.js';
import { syncClientMeta } from '../services/metaService.js';
import { syncClientInstagram } from '../services/instagramService.js';
import { syncCommentsForClient } from '../services/engagementService.js';
import { META_ACCESS_TOKEN } from '../config/env.js';

/**
 * Write a row to sync_log for observability.
 */
async function logSync(clientId, syncType, trigger, status, details = {}, startedAt) {
  try {
    await supabaseAdmin.from('sync_log').insert({
      client_id: clientId,
      sync_type: syncType,
      trigger,
      status,
      details,
      started_at: startedAt || new Date().toISOString(),
      finished_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[SYNC-LOG] Failed to write log:`, err.message);
  }
}

/**
 * Run the full sync for all clients that have a Meta ad account.
 * Called by both the morning and evening cron schedules.
 */
async function runDailySync(label) {
  console.log(`[CRON] Starting ${label} Meta + Instagram sync...`);

  const { data: clients, error } = await supabaseAdmin
    .from('clients')
    .select('id, name, meta_ad_account_id')
    .not('meta_ad_account_id', 'is', null);

  if (error) {
    console.error('[CRON] Failed to fetch clients:', error.message);
    return;
  }

  for (const client of (clients || [])) {
    // Sync ad campaigns
    const metaStart = new Date().toISOString();
    try {
      const result = await syncClientMeta(client.id);
      console.log(`[CRON] Synced ads for ${client.name}: ${result.campaigns_synced} campaigns, ${result.metrics_synced} metric rows`);
      await logSync(client.id, 'meta_ads', 'cron', 'success', {
        campaigns_synced: result.campaigns_synced,
        metrics_synced: result.metrics_synced,
      }, metaStart);
    } catch (err) {
      console.error(`[CRON] Ad sync failed for ${client.name}:`, err.message);
      await logSync(client.id, 'meta_ads', 'cron', 'error', {
        error: err.message,
      }, metaStart);
    }

    // Sync Instagram organic data
    const igStart = new Date().toISOString();
    try {
      const igResult = await syncClientInstagram(client.id);
      if (igResult.skipped) {
        console.log(`[CRON] IG skipped for ${client.name}: ${igResult.reason}`);
        await logSync(client.id, 'instagram', 'cron', 'skipped', {
          reason: igResult.reason,
        }, igStart);
      } else {
        console.log(`[CRON] Synced IG for ${client.name}: ${igResult.days_synced} days, ${igResult.media_synced} media, ${igResult.hashtags_parsed} hashtags`);
        await logSync(client.id, 'instagram', 'cron', 'success', {
          days_synced: igResult.days_synced,
          media_synced: igResult.media_synced,
          hashtags_parsed: igResult.hashtags_parsed,
        }, igStart);
      }
    } catch (err) {
      console.error(`[CRON] IG sync failed for ${client.name}:`, err.message);
      await logSync(client.id, 'instagram', 'cron', 'error', {
        error: err.message,
      }, igStart);
    }

    // Sync social comments
    const commentStart = new Date().toISOString();
    try {
      const commentResult = await syncCommentsForClient(client.id);
      if (!commentResult.skipped) {
        console.log(`[CRON] Synced comments for ${client.name}: ${commentResult.comments_synced} comments from ${commentResult.posts_checked} posts`);
        await logSync(client.id, 'comments', 'cron', 'success', {
          comments_synced: commentResult.comments_synced,
          posts_checked: commentResult.posts_checked,
        }, commentStart);
      }
    } catch (err) {
      console.error(`[CRON] Comment sync failed for ${client.name}:`, err.message);
      await logSync(client.id, 'comments', 'cron', 'error', {
        error: err.message,
      }, commentStart);
    }
  }

  console.log(`[CRON] ${label} sync complete`);
}

export function startMetaSyncCron() {
  if (!META_ACCESS_TOKEN) {
    console.log('[CRON] Meta access token not configured — skipping daily sync setup');
    return;
  }

  // Morning sync: 6 AM UTC
  cron.schedule('0 6 * * *', () => runDailySync('Morning (6 AM UTC)'));

  // Evening sync: 6 PM UTC (safety net)
  cron.schedule('0 18 * * *', () => runDailySync('Evening (6 PM UTC)'));

  console.log('[CRON] Daily Meta sync scheduled for 6 AM + 6 PM UTC');
}

/**
 * Export logSync so manual sync endpoints can log too.
 */
export { logSync };
