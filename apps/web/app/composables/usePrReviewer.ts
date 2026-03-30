import type { HistoryEntry } from '~/composables/useRunnerJob';

import { useRepoConfigs } from '~/composables/useRepoConfigs';

interface PrItem {
  number: number;
  title: string;
  author: string;
  headSha: string;
  updatedAt: string;
  htmlUrl: string;
  reviewStatus: 'not-reviewed' | 'outdated' | 'reviewed';
  repoLabel: string;
}

/** Unique key for a PR across repos */
function prKey(repoLabel: string, prNumber: number): string {
  return `${repoLabel}#${prNumber}`;
}

export function usePrReviewer() {
  const history = ref<HistoryEntry[]>([]);
  const rightTab = ref<'history' | 'progress'>('progress');

  const reviewer = useRunnerJob({
    storageKey: 'pr-review-active-jobId',
    apiBase: '/api/claude-runner',
    phases: [
      { label: '排隊中' },
      { label: '分析 PR' },
      { label: 'Review 中' },
      { label: '完成' },
    ],
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

  // ── PR List (repos from shared useRepoConfigs) ──
  const { repoConfigs } = useRepoConfigs();
  const repos = computed(() =>
    repoConfigs.value.map((r) => ({
      githubRepo: r.githubRepo,
      label: r.label,
    })),
  );
  const selectedRepos = ref<Set<string>>(new Set());
  const prList = ref<PrItem[]>([]);
  const selected = ref<Set<string>>(new Set()); // "repoLabel#prNumber"
  const loading = ref(false);
  const loadError = ref('');
  const starting = ref(false);

  const selectedCount = computed(() => selected.value.size);

  // Auto-select first repo when repos load
  watch(
    repos,
    (val) => {
      if (val.length > 0 && selectedRepos.value.size === 0 && val[0]) {
        selectedRepos.value = new Set([val[0].label]);
      }
    },
    { immediate: true },
  );

  // ── Filters ──
  type StatusFilter = 'all' | 'not-reviewed' | 'outdated' | 'reviewed';
  const statusFilter = ref<StatusFilter>('all');
  const searchQuery = ref('');
  const authorFilter = ref('');

  /** Unique authors from loaded PRs */
  const authors = computed(() => {
    const set = new Set<string>();
    for (const pr of prList.value) set.add(pr.author);
    return [...set].toSorted();
  });

  const filteredPrList = computed(() => {
    let list = prList.value;

    // Status filter
    if (statusFilter.value !== 'all') {
      list = list.filter((p) => p.reviewStatus === statusFilter.value);
    }

    // Author filter
    if (authorFilter.value) {
      list = list.filter((p) => p.author === authorFilter.value);
    }

    // Search (JIRA ticket, title, @author)
    const q = searchQuery.value.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          `#${p.number}`.includes(q) ||
          `@${p.author}`.toLowerCase().includes(q) ||
          p.author.toLowerCase().includes(q),
      );
    }

    return list;
  });

  /** Filtered PR list grouped by repo */
  const filteredGrouped = computed(() => {
    const map = new Map<string, PrItem[]>();
    for (const pr of filteredPrList.value) {
      const arr = map.get(pr.repoLabel);
      if (arr) {
        arr.push(pr);
      } else {
        map.set(pr.repoLabel, [pr]);
      }
    }
    return map;
  });

  /** PR count per repo (unfiltered) */
  const repoCount = computed(() => {
    const map = new Map<string, number>();
    for (const pr of prList.value) {
      map.set(pr.repoLabel, (map.get(pr.repoLabel) ?? 0) + 1);
    }
    return map;
  });

  /** Select all unreviewed PRs in a repo */
  function selectAllUnreviewed(repoLabel: string) {
    if (reviewer.isRunning.value) return;
    const next = new Set(selected.value);
    const prs = filteredPrList.value.filter(
      (p) => p.repoLabel === repoLabel && p.reviewStatus !== 'reviewed',
    );
    for (const p of prs) {
      next.add(prKey(repoLabel, p.number));
    }
    selected.value = next;
  }

  /** Deselect all PRs in a repo */
  function deselectAllInRepo(repoLabel: string) {
    if (reviewer.isRunning.value) return;
    const next = new Set(selected.value);
    for (const key of next) {
      if (key.startsWith(`${repoLabel}#`)) next.delete(key);
    }
    selected.value = next;
  }

  function toggleRepo(label: string) {
    const next = new Set(selectedRepos.value);
    if (next.has(label)) {
      next.delete(label);
    } else {
      next.add(label);
    }
    selectedRepos.value = next;
  }

  async function loadPRs() {
    if (selectedRepos.value.size === 0) {
      prList.value = [];
      return;
    }
    loading.value = true;
    loadError.value = '';
    try {
      const results = await Promise.all(
        [...selectedRepos.value].map(async (repoLabel) => {
          const prs = await $fetch<Omit<PrItem, 'repoLabel'>[]>(
            '/api/pr-review/prs',
            { params: { repoLabel } },
          );
          return prs.map((pr) => ({ ...pr, repoLabel }));
        }),
      );
      prList.value = results.flat();
    } catch (error) {
      loadError.value = (error as Error).message;
    } finally {
      loading.value = false;
    }
  }

  /** Group PR list by repo for display */
  const prListGrouped = computed(() => {
    const map = new Map<string, PrItem[]>();
    for (const pr of prList.value) {
      const arr = map.get(pr.repoLabel);
      if (arr) {
        arr.push(pr);
      } else {
        map.set(pr.repoLabel, [pr]);
      }
    }
    return map;
  });

  watch(selectedRepos, () => {
    // Remove selections from deselected repos
    const next = new Set(selected.value);
    for (const key of next) {
      const repo = key.split('#')[0] ?? '';
      if (!selectedRepos.value.has(repo)) next.delete(key);
    }
    selected.value = next;
    loadPRs();
  });

  function togglePR(repoLabel: string, prNumber: number) {
    if (reviewer.isRunning.value) return;
    const key = prKey(repoLabel, prNumber);
    const next = new Set(selected.value);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    selected.value = next;
  }

  // ── Run Review (batch, multi-repo) ──
  async function runReview() {
    if (reviewer.isRunning.value || starting.value || selected.value.size === 0)
      return;

    // Group selected PRs by repo
    const byRepo = new Map<string, PrItem[]>();
    for (const key of selected.value) {
      const [repo] = key.split('#');
      const prNumber = Number(key.split('#')[1]);
      const pr = prList.value.find(
        (p) => p.repoLabel === repo && p.number === prNumber,
      );
      if (!pr) continue;
      const arr = byRepo.get(pr.repoLabel);
      if (arr) {
        arr.push(pr);
      } else {
        byRepo.set(pr.repoLabel, [pr]);
      }
    }

    if (byRepo.size === 0) return;

    starting.value = true;
    rightTab.value = 'progress';
    try {
      // Send one request per repo, collect jobIds
      const allIssues: Array<{ key: string; summary: string }> = [];
      let firstJobId: string | undefined;
      const allSkipped: string[] = [];

      for (const [repoLabel, prs] of byRepo) {
        const result = await $fetch<{
          jobId?: string;
          message?: string;
          skipped?: boolean | string[];
        }>('/api/pr-review/run', {
          method: 'POST',
          body: {
            repoLabel,
            prNumbers: prs.map((p) => p.number),
          },
        });

        if (result.skipped === true) {
          allSkipped.push(result.message ?? `${repoLabel} all skipped`);
          continue;
        }

        if (Array.isArray(result.skipped) && result.skipped.length > 0) {
          allSkipped.push(...result.skipped.map((s) => `${repoLabel} ${s}`));
        }

        if (result.jobId) {
          if (!firstJobId) firstJobId = result.jobId;
          const activePrs = prs.filter((p) => {
            if (Array.isArray(result.skipped)) {
              return !result.skipped.includes(`#${p.number}`);
            }
            return true;
          });
          allIssues.push(
            ...activePrs.map((p) => ({
              key: `#${p.number}`,
              summary: `${repoLabel} — ${p.title}`,
            })),
          );
        }
      }

      if (allSkipped.length > 0) {
        useToast().add({
          title: '部分跳過',
          description: allSkipped.join(', '),
          color: 'warning',
        });
      }

      if (firstJobId && allIssues.length > 0) {
        reviewer.startJob(firstJobId, allIssues, undefined, undefined, 0);
        selected.value = new Set();
      } else if (allIssues.length === 0) {
        useToast().add({
          title: '已跳過',
          description: '所有 PR 已經 Review 過',
          color: 'warning',
        });
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
    // Repos (from shared useRepoConfigs)
    repos,
    selectedRepos,
    toggleRepo,
    // PR list
    prList,
    prListGrouped,
    filteredGrouped,
    repoCount,
    selected,
    selectedCount,
    loading,
    loadError,
    loadPRs,
    togglePR,
    selectAllUnreviewed,
    deselectAllInRepo,
    // Filters
    statusFilter,
    searchQuery,
    authorFilter,
    authors,
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
