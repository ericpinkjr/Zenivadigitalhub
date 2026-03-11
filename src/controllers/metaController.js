import { syncClientMeta } from '../services/metaService.js';
import { syncClientInstagram } from '../services/instagramService.js';
import * as clientsService from '../services/clientsService.js';

export async function syncClient(req, res, next) {
  try {
    // Verify the user owns this client
    await clientsService.getClientById(req.user.id, req.params.clientId);

    // Sync Meta ad campaigns
    const metaResult = await syncClientMeta(req.params.clientId);

    // Sync Instagram organic data (don't let IG failure block the response)
    let igResult = null;
    try {
      igResult = await syncClientInstagram(req.params.clientId);
    } catch (err) {
      console.error(`[META] IG sync failed for client ${req.params.clientId}:`, err.message);
      igResult = { error: err.message };
    }

    res.json({ success: true, ...metaResult, ig: igResult });
  } catch (err) { next(err); }
}
