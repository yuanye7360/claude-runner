import { ref } from 'vue';

export function useTransitionDialog(options: {
  jiraHeaders: () => Record<string, string>;
}) {
  const showDialog = ref(false);
  const cancelledIssueKeys = ref<string[]>([]);
  const transitioning = ref(false);

  async function handleCancel(
    job: { issues: { key: string }[]; trigger?: string },
    cancelJob: () => Promise<void>,
  ) {
    const isAutoTriggered = job.trigger === 'auto';
    const issueKeys = job.issues.map((i) => i.key);

    await cancelJob();

    if (isAutoTriggered && issueKeys.length > 0) {
      cancelledIssueKeys.value = [
        ...new Set(issueKeys.map((k) => k.split('@')[0] ?? k)),
      ];
      showDialog.value = true;
    }
  }

  async function transitionToOpen() {
    transitioning.value = true;
    try {
      const result = await $fetch<{
        results: Array<{ error?: string; issueKey: string; ok: boolean }>;
      }>('/api/claude-runner/transition', {
        method: 'POST',
        headers: options.jiraHeaders(),
        body: {
          issueKeys: cancelledIssueKeys.value,
          targetStatus: 'Open',
        },
      });
      const failed = result.results.filter((r) => !r.ok);
      if (failed.length > 0) {
        useToast().add({
          title: '部分轉換失敗',
          description: failed
            .map((f) => `${f.issueKey}: ${f.error}`)
            .join('\n'),
          color: 'warning',
        });
      } else {
        useToast().add({
          title: '已切回 Open',
          description: cancelledIssueKeys.value.join(', '),
          color: 'success',
        });
      }
    } catch (error) {
      useToast().add({
        title: '轉換失敗',
        description: (error as Error).message,
        color: 'error',
      });
    } finally {
      transitioning.value = false;
      showDialog.value = false;
      cancelledIssueKeys.value = [];
    }
  }

  function dismiss() {
    showDialog.value = false;
    cancelledIssueKeys.value = [];
  }

  return {
    showDialog,
    cancelledIssueKeys,
    transitioning,
    handleCancel,
    transitionToOpen,
    dismiss,
  };
}
