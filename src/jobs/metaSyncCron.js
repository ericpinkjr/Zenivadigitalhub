import cron from 'node-cron';
import { supabaseAdmin } from '../config/supabase.js';
import { syncClientMeta } from '../services/metaService.js';
import { META_ACCESS_TOKEN } from '../config/env.js';

export function startMetaSyncCron() {
  if (!META_ACCESS_TOKEN) {
    console.log('[CRON] Meta access token not configured — skipping daily sync setup');
    return;
  }

  // Run daily at 6 AM UTC
  cron.schedule('0 6 * * *', async () => {
    console.log('[CRON] Starting daily Meta sync...');

    const { data: clients, error } = await supabaseAdmin
      .from('clients')
      .select('id, name, meta_ad_account_id')
      .not('meta_ad_account_id', 'is', null);

    if (error) {
      console.error('[CRON] Failed to fetch clients:', error.message);
      return;
    }

    for (const client of (clients || [])) {
      try {
        const result = await syncClientMeta(client.id);
        console.log(`[CRON] Synced ${client.name}: ${result.campaigns_synced} campaigns, ${result.metrics_synced} metric rows`);
      } catch (err) {
        console.error(`[CRON] Failed to sync ${client.name}:`, err.message);
      }
    }

    console.log('[CRON] Daily Meta sync complete');
  });

  console.log('[CRON] Daily Meta sync scheduled for 6 AM UTC');
}
