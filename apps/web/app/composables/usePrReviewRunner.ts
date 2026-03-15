import type { HistoryEntry } from '~/composables/useRunnerJob';
import type { PrsByRepo } from '~~/server/api/pr-runner/prs.get';

export function usePrReviewRunner(options?: {
  crCreatedPrUrls?: Ref<string[]>;
}) {
  const history = ref<HistoryEntry[]>([]);
  const rowExpanded = ref(false);
  const rightTab = ref<'history' | 'progress'>('progress');

  const prNotifications = usePrNotifications();

  const pr = useRunnerJob({
    storageKey: 'pr-active-jobId',
    apiBase: '/api/claude-runner',
    phases: [
      { label: '拉取分支 & 分析 Review' },
      { label: '實作修復' },
      { label: 'Push commits' },
    ],
    onComplete: () => {
      loadHistory();
    },
  });

  async function loadHistory() {
    try {
      history.value = await $fetch<HistoryEntry[]>(
        '/api/claude-runner/jobs?type=pr-runner',
      );
    } catch (error) {
      console.error('Failed to load PR history:', error);
    }
  }

  async function clearHistory() {
    await $fetch('/api/claude-runner/jobs?type=pr-runner', {
      method: 'DELETE',
    });
    history.value = [];
  }

  // ── PR Data ──
  const repoGroups = ref<PrsByRepo[]>([]);
  const selected = ref<Set<string>>(new Set());
  const loading = ref(true);
  const loadError = ref('');

  const filteredGroups = computed(() => repoGroups.value);

  // Count of open PRs that have unread review comments
  const openPrKeys = computed(() => {
    const keys = new Set<string>();
    for (const g of repoGroups.value) {
      for (const p of g.prs) {
        keys.add(`${g.repo}#${p.number}`);
      }
    }
    return keys;
  });
  const prsWithNotifications = computed(
    () =>
      prNotifications.byPr.value.filter((n) =>
        openPrKeys.value.has(`${n.repo}#${n.prNumber}`),
      ).length,
  );

  const collapsedRepos = ref<Set<string>>(new Set());

  function toggleRepoCollapse(repo: string) {
    const next = new Set(collapsedRepos.value);
    next.has(repo) ? next.delete(repo) : next.add(repo);
    collapsedRepos.value = next;
  }

  function prKey(repo: string, number: number) {
    return `${repo}#${number}`;
  }

  function togglePR(repo: string, number: number) {
    if (pr.isRunning.value) return;
    const key = prKey(repo, number);
    const next = new Set(selected.value);
    next.has(key) ? next.delete(key) : next.add(key);
    selected.value = next;
  }

  const selectedCount = computed(() => selected.value.size);

  async function loadPRs() {
    loading.value = true;
    loadError.value = '';
    try {
      const data = await $fetch<PrsByRepo[]>('/api/pr-runner/prs');
      repoGroups.value = Array.isArray(data) ? data : [];
    } catch (error) {
      loadError.value = (error as Error).message;
    } finally {
      loading.value = false;
    }
  }

  // Check if a PR was created by the last Claude Runner run
  function isFromClaudeRunner(htmlUrl: string): boolean {
    return (options?.crCreatedPrUrls?.value ?? []).includes(htmlUrl);
  }

  function getSelectedPRItems() {
    return filteredGroups.value.flatMap((g) =>
      g.prs
        .filter((p_) => selected.value.has(prKey(g.repo, p_.number)))
        .map((p_) => ({
          number: p_.number,
          title: p_.title,
          repo: g.repo,
          branch: p_.head.ref,
          html_url: p_.html_url,
        })),
    );
  }

  async function runPR() {
    const prs = getSelectedPRItems();
    if (prs.length === 0 || pr.isRunning.value) return;
    rightTab.value = 'progress';
    try {
      const { jobId } = await $fetch<{ jobId: string }>('/api/pr-runner/run', {
        method: 'POST',
        body: {
          prs,
        },
      });
      rowExpanded.value = true;
      pr.startJob(
        jobId,
        prs.map((p_) => ({
          key: `#${p_.number}`,
          summary: `${p_.repo} — ${p_.title}`,
        })),
      );
    } catch (error) {
      console.error('Failed to start PR Runner:', error);
    }
  }

  function getPrUrl(key: string): null | string {
    const num = Number(key.replace('#', ''));
    for (const group of filteredGroups.value) {
      const p_ = group.prs.find((p) => p.number === num);
      if (p_) return p_.html_url;
    }
    return null;
  }

  return {
    repoGroups,
    selected,
    loading,
    loadError,
    history,
    rowExpanded,
    rightTab,
    filteredGroups,
    collapsedRepos,
    openPrKeys,
    prsWithNotifications,
    selectedCount,
    toggleRepoCollapse,
    prKey,
    togglePR,
    loadPRs,
    getSelectedPRItems,
    runPR,
    getPrUrl,
    isFromClaudeRunner,
    loadHistory,
    clearHistory,
    pr,
    prNotifications,
  };
}
