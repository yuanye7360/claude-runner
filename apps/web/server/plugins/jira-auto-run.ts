// apps/web/server/plugins/jira-auto-run.ts
import {
  getAutoRunInterval,
  getStoredJiraCreds,
  getStoredJiraLabels,
  isAutoRunEnabled,
  pollInDevelopmentIssues,
} from '../utils/jira-auto-run';

const DEFAULT_INTERVAL = 2 * 60 * 1000; // 2 minutes

export default defineNitroPlugin((nitro) => {
  let timer: ReturnType<typeof setTimeout>;

  async function poll() {
    try {
      const enabled = await isAutoRunEnabled();
      if (!enabled) return;

      const candidates = await pollInDevelopmentIssues();
      if (candidates.length === 0) return;

      console.warn(
        `[jira-auto-run] Found ${candidates.length} new "In Development" issues:`,
        candidates.map((c) => c.key).join(', '),
      );

      // Build headers from stored creds
      const creds = await getStoredJiraCreds();
      const labels = await getStoredJiraLabels();
      if (!creds) {
        console.error('[jira-auto-run] No JIRA credentials configured');
        return;
      }

      // Call the run API internally
      try {
        const result = await $fetch<{ jobId: string }>(
          '/api/claude-runner/run',
          {
            method: 'POST',
            headers: {
              'x-jira-base-url': creds.baseUrl,
              'x-jira-email': creds.email,
              'x-jira-api-token': creds.apiToken,
              'x-jira-labels': labels.join(','),
            },
            body: {
              issues: candidates.map((c) => ({
                key: c.key,
                summary: c.summary,
                labels: c.labels,
              })),
              mode: 'smart',
              trigger: 'auto',
            },
          },
        );
        console.warn(
          `[jira-auto-run] Triggered job ${result.jobId} for: ${candidates.map((c) => c.key).join(', ')}`,
        );
      } catch (error) {
        console.error('[jira-auto-run] Failed to trigger run:', error);
      }
    } catch (error) {
      console.error('[jira-auto-run] Poll failed:', error);
    }
  }

  async function scheduleNext() {
    const interval = await getAutoRunInterval().catch(() => DEFAULT_INTERVAL);
    timer = setTimeout(async () => {
      await poll();
      scheduleNext();
    }, interval);
  }

  // Start polling after a short delay (let server fully boot)
  timer = setTimeout(() => {
    poll().then(() => scheduleNext());
  }, 10_000);

  // Cleanup on close
  nitro.hooks.hook('close', () => {
    clearTimeout(timer);
  });
});
