import { syncClientMeta } from '../services/metaService.js';
import { syncClientInstagram } from '../services/instagramService.js';
import * as clientsService from '../services/clientsService.js';
import { logSync } from '../jobs/metaSyncCron.js';

export async function syncClient(req, res, next) {
  try {
    const clientId = req.params.clientId;
    // Verify the org owns this client
    await clientsService.getClientById(req.org.id, clientId);

    // Sync Meta ad campaigns
    const metaStart = new Date().toISOString();
    const metaResult = await syncClientMeta(clientId);
    await logSync(clientId, 'meta_ads', 'manual', 'success', {
      campaigns_synced: metaResult.campaigns_synced,
      metrics_synced: metaResult.metrics_synced,
    }, metaStart);

    // Sync Instagram organic data (don't let IG failure block the response)
    let igResult = null;
    const igStart = new Date().toISOString();
    try {
      igResult = await syncClientInstagram(clientId);
      await logSync(clientId, 'instagram', 'manual', igResult.skipped ? 'skipped' : 'success', {
        days_synced: igResult.days_synced,
        media_synced: igResult.media_synced,
        hashtags_parsed: igResult.hashtags_parsed,
      }, igStart);
    } catch (err) {
      console.error(`[META] IG sync failed for client ${clientId}:`, err.message);
      await logSync(clientId, 'instagram', 'manual', 'error', { error: err.message }, igStart);
      igResult = { error: err.message };
    }

    res.json({ success: true, ...metaResult, ig: igResult });
  } catch (err) { next(err); }
}
