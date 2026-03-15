import cron from 'node-cron';
import { processScheduledPosts } from '../services/contentSchedulerService.js';

export function startContentPublishCron() {
  // Run every 2 minutes
  cron.schedule('*/2 * * * *', async () => {
    try {
      const result = await processScheduledPosts();
      if (result.processed > 0 || result.errors > 0) {
        console.log(`[SCHEDULER] Processed ${result.processed} posts, ${result.errors} errors`);
      }
    } catch (err) {
      console.error('[SCHEDULER] Cron error:', err.message);
    }
  });

  console.log('[SCHEDULER] Content publish cron started (every 2 min)');
}
