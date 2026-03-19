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
  const selected = ref<Set<number>>(new Set());
  const loading = ref(false);
  const loadError = ref('');
  const starting = ref(false);

  const selectedCount = computed(() => selected.value.size);

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
    selected.value = new Set();
    loadPRs();
  });

  function togglePR(prNumber: number) {
    if (reviewer.isRunning.value) return;
    const next = new Set(selected.value);
    if (next.has(prNumber)) {
      next.delete(prNumber);
    } else {
      next.add(prNumber);
    }
    selected.value = next;
  }

  // ── Run Review (batch) ──
  async function runReview() {
    if (reviewer.isRunning.value || starting.value || selected.value.size === 0)
      return;

    const prsToReview = prList.value.filter((p) => selected.value.has(p.number));
    if (prsToReview.length === 0) return;

    starting.value = true;
    rightTab.value = 'progress';
    try {
      const result = await $fetch<{
        jobId?: string;
        message?: string;
        skipped?: boolean | string[];
      }>('/api/pr-review/run', {
        method: 'POST',
        body: {
          repoLabel: selectedRepo.value,
          prNumbers: prsToReview.map((p) => p.number),
        },
      });

      if (result.skipped === true) {
        useToast().add({
          title: '已跳過',
          description: result.message ?? 'All PRs already reviewed',
          color: 'warning',
        });
        starting.value = false;
        return;
      }

      if (Array.isArray(result.skipped) && result.skipped.length > 0) {
        useToast().add({
          title: '部分跳過',
          description: `已跳過: ${result.skipped.join(', ')}`,
          color: 'warning',
        });
      }

      if (result.jobId) {
        reviewer.startJob(
          result.jobId,
          prsToReview
            .filter((p) => {
              if (Array.isArray(result.skipped)) {
                return !result.skipped.includes(`#${p.number}`);
              }
              return true;
            })
            .map((p) => ({
              key: `#${p.number}`,
              summary: `${selectedRepo.value} — ${p.title}`,
            })),
        );
        selected.value = new Set();
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
    selected,
    selectedCount,
    loading,
    loadError,
    loadPRs,
    togglePR,
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
