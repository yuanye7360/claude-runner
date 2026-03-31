import { refreshSlackCache } from '../utils/pr-inbox-cache';
import { getPrInboxChannel } from '../utils/workspaceConfig';

/** Scheduled hours (24h format) to auto-refresh Slack cache */
const SCHEDULED_HOURS = [12, 16];

function msUntilNextRun(): number {
  const now = new Date();
  const today = new Date(now);

  for (const hour of SCHEDULED_HOURS) {
    today.setHours(hour, 0, 0, 0);
    if (today.getTime() > now.getTime()) {
      return today.getTime() - now.getTime();
    }
  }

  // All today's runs passed — schedule for tomorrow's first run
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(SCHEDULED_HOURS[0], 0, 0, 0);
  return tomorrow.getTime() - now.getTime();
}

export default defineNitroPlugin((nitro) => {
  let timer: ReturnType<typeof setTimeout>;

  async function run() {
    try {
      const channel = await getPrInboxChannel();
      if (!channel) return;

      console.warn('[pr-inbox-cron] Scheduled Slack cache refresh starting...');
      await refreshSlackCache();
    } catch (error) {
      console.error('[pr-inbox-cron] Scheduled refresh failed:', error);
    }
  }

  function scheduleNext() {
    const ms = msUntilNextRun();
    const nextTime = new Date(Date.now() + ms).toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
    });
    console.warn(
      `[pr-inbox-cron] Next Slack refresh at ${nextTime} (in ${Math.round(ms / 60_000)}m)`,
    );

    timer = setTimeout(async () => {
      await run();
      scheduleNext();
    }, ms);
  }

  // Start after server boots
  timer = setTimeout(() => {
    scheduleNext();
  }, 5000);

  nitro.hooks.hook('close', () => {
    clearTimeout(timer);
  });
});
