import type { HistoryEntry } from '~/composables/useRunnerJob';

interface PrItem {
  number: number;
  title: string;
  author: string;
  headSha: string;
  updatedAt: string;
  htmlUrl: string;
  reviewStatus: 'not-reviewed' | 'outdated' | 'reviewed';
}

export function usePrReviewer() {
  const history = ref<HistoryEntry[]>([]);
  const rightTab = ref<'history' | 'progress'>('progress');

  const reviewer = useRunnerJob({
    storageKey: 'pr-review-active-jobId',
    apiBase: '/api/claude-runner',
    phases: [{ label: '分析 PR' }, { label: 'Review 中' }, { label: '完成' }],
    onComplete: () => {
      loadHistory();
      loadPRs();
      reviewHistory.fetch();
    },
  });

  // ── Job History ──
  async function loadHistory() {
    try {
      history.value = await $fetch<HistoryEntry[]>(
        '/api/claude-runner/jobs?type=pr-review',
      );
    } catch (error) {
      console.error('Failed to load PR review history:', error);
    }
  }

  // ── PR List ──
  const repos = ref<Array<{ githubRepo: string; label: string }>>([]);
  const selectedRepo = ref('');
  const prList = ref<PrItem[]>([]);
  const loading = ref(false);
  const loadError = ref('');
  const starting = ref(false);

  async function loadRepos() {
    try {
      const data =
        await $fetch<Array<{ githubRepo: string; label: string }>>(
          '/api/repos',
        );
      repos.value = data;
      if (data.length > 0 && !selectedRepo.value && data[0]) {
        selectedRepo.value = data[0].label;
      }
    } catch (error) {
      console.error('Failed to load repos:', error);
    }
  }

  async function loadPRs() {
    if (!selectedRepo.value) return;
    loading.value = true;
    loadError.value = '';
    try {
      prList.value = await $fetch<PrItem[]>('/api/pr-review/prs', {
        params: { repoLabel: selectedRepo.value },
      });
    } catch (error) {
      loadError.value = (error as Error).message;
    } finally {
      loading.value = false;
    }
  }

  watch(selectedRepo, () => {
    prList.value = [];
    loadPRs();
  });

  // ── Run Review ──
  async function runReview(prNumber: number) {
    if (reviewer.isRunning.value || starting.value) return;

    const pr = prList.value.find((p) => p.number === prNumber);
    if (!pr) return;

    starting.value = true;
    rightTab.value = 'progress';
    try {
      const result = await $fetch<{
        jobId?: string;
        message?: string;
        skipped?: boolean;
      }>('/api/pr-review/run', {
        method: 'POST',
        body: { repoLabel: selectedRepo.value, prNumber },
      });

      if (result.skipped) {
        useToast().add({
          title: '已跳過',
          description: result.message ?? 'Already reviewed',
          color: 'warning',
        });
        starting.value = false;
        return;
      }

      if (result.jobId) {
        reviewer.startJob(result.jobId, [
          {
            key: `#${prNumber}`,
            summary: `${selectedRepo.value} — ${pr.title}`,
          },
        ]);
      }
    } catch (error) {
      const msg =
        (error as any)?.data?.message ||
        (error instanceof Error ? error.message : 'Failed to start review');
      useToast().add({ title: '啟動失敗', description: msg, color: 'error' });
    } finally {
      starting.value = false;
    }
  }

  // ── Review History (today's reviews) ──
  const reviewHistory = usePrReviewHistory();

  return {
    // Repos
    repos,
    selectedRepo,
    loadRepos,
    // PR list
    prList,
    loading,
    loadError,
    loadPRs,
    // Run
    starting,
    runReview,
    // Job
    reviewer,
    history,
    rightTab,
    loadHistory,
    // Today's reviews
    reviewHistory,
  };
}
