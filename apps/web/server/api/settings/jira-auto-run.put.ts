import { setSetting } from '../../utils/app-settings';

export default defineEventHandler(async (event) => {
  const { enabled, interval } = await readBody<{
    enabled?: boolean;
    interval?: number;
  }>(event);

  if (enabled !== undefined) {
    await setSetting('jira-auto-run-enabled', String(enabled));
  }
  if (interval !== undefined && interval > 0) {
    await setSetting('jira-auto-run-interval', String(interval));
  }

  return { ok: true };
});
