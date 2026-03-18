import { getSetting } from '../../utils/app-settings';

export default defineEventHandler(async () => {
  const [enabled, interval] = await Promise.all([
    getSetting('jira-auto-run-enabled'),
    getSetting('jira-auto-run-interval'),
  ]);
  return {
    enabled: enabled === 'true',
    interval: interval ? Number(interval) : 2,
  };
});
