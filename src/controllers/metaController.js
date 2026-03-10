import { syncClientMeta } from '../services/metaService.js';
import * as clientsService from '../services/clientsService.js';

export async function syncClient(req, res, next) {
  try {
    // Verify the user owns this client
    await clientsService.getClientById(req.user.id, req.params.clientId);

    const result = await syncClientMeta(req.params.clientId);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}
