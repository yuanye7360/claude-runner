import type { Ref } from 'vue';

import type { JiraConfig } from './useJiraConfig';

import { ref } from 'vue';

interface AutoRunJob {
  id: string;
  issues: { key: string; summary: string }[];
  startedAt: number;
  trigger: string;
}

export function useAutoRun(options: {
  isRunning: Ref<boolean>;
  jiraConfig: Ref<JiraConfig>;
  jiraConfigured: Ref<boolean>;
  jiraHeaders: () => Record<string, string>;
  startJob: (
    id: string,
    issues: { key: string; summary: string }[],
    dynamicPhases?: { label: string }[],
    trigger?: 'auto' | 'manual',
  ) => void;
}) {
  const enabled = ref(false);
  const interval = ref(2);
  const loading = ref(false);
  const isPolling = ref(false);

  let pollTimer: null | ReturnType<typeof setInterval> = null;

  async function loadSettings() {
    try {
      const data = await $fetch<{ enabled: boolean; interval: number }>(
        '/api/settings/jira-auto-run',
      );
      enabled.value = data.enabled;
      interval.value = data.interval;
    } catch {
      // ignore
    }
  }

  async function toggle(val: boolean) {
    loading.value = true;
    try {
      if (val) {
        const c = options.jiraConfig.value;
        await $fetch('/api/settings/jira-creds', {
          method: 'PUT',
          body: {
            baseUrl: c.baseUrl,
            email: c.email,
            apiToken: c.apiToken,
            labels: c.labels,
          },
        });
      }
      await $fetch('/api/settings/jira-auto-run', {
        method: 'PUT',
        body: { enabled: val, interval: interval.value },
      });
      enabled.value = val;
    } catch (error) {
      useToast().add({
        title: '設定失敗',
        description: (error as Error).message,
        color: 'error',
      });
    } finally {
      loading.value = false;
    }
  }

  async function checkJobs(): Promise<AutoRunJob | null> {
    if (!enabled.value) return null;
    if (options.isRunning.value) return null;
    try {
      const activeJobs = await $fetch<AutoRunJob[]>(
        '/api/claude-runner/jobs/active',
        { params: { trigger: 'auto' } },
      );
      if (activeJobs.length > 0 && activeJobs[0]) {
        return activeJobs[0];
      }
    } catch {
      // ignore
    }
    return null;
  }

  function startPoll() {
    stopPoll();
    isPolling.value = true;
    pollTimer = setInterval(checkJobs, 15_000);
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    isPolling.value = false;
  }

  return {
    enabled,
    interval,
    loading,
    isPolling,
    loadSettings,
    toggle,
    checkJobs,
    startPoll,
    stopPoll,
  };
}
