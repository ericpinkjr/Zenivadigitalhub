import cron from 'node-cron';
import { supabaseAdmin } from '../config/supabase.js';
import { syncClientMeta } from '../services/metaService.js';
import { syncClientInstagram } from '../services/instagramService.js';
import { META_ACCESS_TOKEN } from '../config/env.js';

export function startMetaSyncCron() {
  if (!META_ACCESS_TOKEN) {
    console.log('[CRON] Meta access token not configured — skipping daily sync setup');
    return;
  }

  // Run daily at 6 AM UTC
  cron.schedule('0 6 * * *', async () => {
    console.log('[CRON] Starting daily Meta + Instagram sync...');

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
      try {
        const result = await syncClientMeta(client.id);
        console.log(`[CRON] Synced ads for ${client.name}: ${result.campaigns_synced} campaigns, ${result.metrics_synced} metric rows`);
      } catch (err) {
        console.error(`[CRON] Ad sync failed for ${client.name}:`, err.message);
      }

      // Sync Instagram organic data
      try {
        const igResult = await syncClientInstagram(client.id);
        if (igResult.skipped) {
          console.log(`[CRON] IG skipped for ${client.name}: ${igResult.reason}`);
        } else {
          console.log(`[CRON] Synced IG for ${client.name}: ${igResult.days_synced} days, ${igResult.media_synced} media`);
        }
      } catch (err) {
        console.error(`[CRON] IG sync failed for ${client.name}:`, err.message);
      }
    }

    console.log('[CRON] Daily sync complete');
  });

  console.log('[CRON] Daily Meta sync scheduled for 6 AM UTC');
}
