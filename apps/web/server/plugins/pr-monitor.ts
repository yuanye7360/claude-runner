// apps/web/server/plugins/pr-monitor.ts
import { pollPrReviewComments } from '../utils/pr-monitor';

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

export default defineNitroPlugin((nitro) => {
  const timer = setInterval(async () => {
    try {
      const newCount = await pollPrReviewComments();
      if (newCount > 0) {
        console.warn(`[pr-monitor] Found ${newCount} new review comments`);
      }
    } catch (error) {
      console.error('[pr-monitor] Poll failed:', error);
    }
  }, POLL_INTERVAL);

  // Run once immediately on startup
  pollPrReviewComments().catch(console.error);

  // Cleanup on close
  nitro.hooks.hook('close', () => {
    clearInterval(timer);
  });
});
