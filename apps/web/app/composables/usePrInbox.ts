import type { HistoryEntry } from '~/composables/useRunnerJob';

export interface PrInboxItem {
  repo: string;
  prNumber: number;
  prTitle: string;
  prAuthor: string;
  htmlUrl: string;
  headSha: string;
  slackUser: string;
  slackTs: string;
  requestedAt: string;
  reviewStatus: 'closed' | 'not-reviewed' | 'outdated' | 'reviewed';
  repoLabel: null | string;
}

type StatusFilter = 'all' | 'closed' | 'not-reviewed' | 'outdated' | 'reviewed';

function itemKey(item: PrInboxItem): string {
  return `${item.repo}#${item.prNumber}`;
}

export function usePrInbox() {
  // State
  const items = ref<PrInboxItem[]>([]);
  const loading = ref(false);
  const syncing = ref(false);
  const fetchError = ref('');
  const fetchedAt = ref<null | string>(null);
  const cachedAt = ref<null | string>(null);
  const selected = ref<Set<string>>(new Set());
  const starting = ref(false);
  const statusFilter = ref<StatusFilter>('all');
  const history = ref<HistoryEntry[]>([]);
  const rightTab = ref<'history' | 'progress'>('progress');

  // useRunnerJob for review execution (same pattern as usePrReviewer)
  const reviewer = useRunnerJob({
    storageKey: 'pr-inbox-active-jobId',
    apiBase: '/api/claude-runner',
    phases: [
      { label: '排隊中' },
      { label: '分析 PR' },
      { label: 'Review 中' },
      { label: '完成' },
    ],
    onComplete: () => {
      loadHistory();
    },
  });

  // Computed: filtered list
  const filteredItems = computed(() => {
    if (statusFilter.value === 'all') return items.value;
    return items.value.filter((i) => i.reviewStatus === statusFilter.value);
  });

  // Computed: grouped by slack user
  const groupedByUser = computed(() => {
    const map = new Map<string, PrInboxItem[]>();
    for (const item of filteredItems.value) {
      const arr = map.get(item.slackUser);
      if (arr) arr.push(item);
      else map.set(item.slackUser, [item]);
    }
    return map;
  });

  const selectedCount = computed(() => selected.value.size);

  // Computed: "N 分鐘前" display
  const fetchedAgo = computed(() => {
    if (!fetchedAt.value) return null;
    const diff = Date.now() - new Date(fetchedAt.value).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return '剛剛';
    return `${mins} 分鐘前`;
  });

  // Computed: "Slack 資料：N 分鐘前" display for cache age
  const cachedAgo = computed(() => {
    if (!cachedAt.value) return null;
    const diff = Date.now() - new Date(cachedAt.value).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return '剛剛';
    if (mins < 60) return `${mins} 分鐘前`;
    const hours = Math.floor(mins / 60);
    return `${hours} 小時前`;
  });

  // Actions

  let pollTimer: null | ReturnType<typeof setTimeout> = null;

  /** Fetch items from API. If server is syncing Slack, auto-poll every 3s. */
  async function fetchItems() {
    loading.value = true;
    fetchError.value = '';
    try {
      const data = await $fetch<{
        cachedAt: null | string;
        channel: string;
        fetchedAt: string;
        items: PrInboxItem[];
        syncing?: boolean;
      }>('/api/pr-inbox/fetch', { method: 'POST' });

      if (data.syncing) {
        // Server is fetching Slack in background — show syncing state and poll
        syncing.value = true;
        items.value = [];
        if (!pollTimer) {
          pollTimer = setTimeout(() => {
            pollTimer = null;
            fetchItems();
          }, 3000);
        }
      } else {
        syncing.value = false;
        items.value = data.items;
        fetchedAt.value = data.fetchedAt;
        cachedAt.value = data.cachedAt;
        selected.value = new Set();
      }
    } catch (error) {
      const msg =
        (error as any)?.data?.message ||
        (error instanceof Error ? error.message : '讀取失敗');
      fetchError.value = msg;
      syncing.value = false;
    } finally {
      loading.value = false;
    }
  }

  /** Force re-fetch Slack messages via Claude CLI (15-30s), then fast refresh */
  async function syncSlack() {
    syncing.value = true;
    try {
      await $fetch('/api/pr-inbox/refresh-slack', { method: 'POST' });
      await fetchItems();
    } catch (error) {
      const msg =
        (error as any)?.data?.message ||
        (error instanceof Error ? error.message : '同步失敗');
      useToast().add({ title: '同步失敗', description: msg, color: 'error' });
    } finally {
      syncing.value = false;
    }
  }

  function toggleItem(item: PrInboxItem) {
    if (reviewer.isRunning.value) return;
    if (!item.repoLabel) return;
    const key = itemKey(item);
    const next = new Set(selected.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selected.value = next;
  }

  function selectAllPending() {
    if (reviewer.isRunning.value) return;
    const next = new Set(selected.value);
    for (const item of filteredItems.value) {
      if (item.reviewStatus === 'not-reviewed' && item.repoLabel) {
        next.add(itemKey(item));
      }
    }
    selected.value = next;
  }

  function clearSelection() {
    selected.value = new Set();
  }

  // Run review — same pattern as usePrReviewer.runReview()
  async function runReview() {
    if (reviewer.isRunning.value || starting.value || selected.value.size === 0)
      return;

    const byRepo = new Map<string, PrInboxItem[]>();
    for (const key of selected.value) {
      const item = items.value.find((i) => itemKey(i) === key);
      if (!item?.repoLabel) continue;
      const arr = byRepo.get(item.repoLabel);
      if (arr) arr.push(item);
      else byRepo.set(item.repoLabel, [item]);
    }

    if (byRepo.size === 0) return;

    starting.value = true;
    rightTab.value = 'progress';
    try {
      const allIssues: Array<{ key: string; summary: string }> = [];
      let firstJobId: string | undefined;

      for (const [repoLabel, prItems] of byRepo) {
        const result = await $fetch<{
          jobId?: string;
          message?: string;
          skipped?: boolean | string[];
        }>('/api/pr-review/run', {
          method: 'POST',
          body: { repoLabel, prNumbers: prItems.map((p) => p.prNumber) },
        });

        if (result.skipped === true) continue;

        if (result.jobId) {
          if (!firstJobId) firstJobId = result.jobId;
          const activePrs = prItems.filter((p) => {
            if (Array.isArray(result.skipped))
              return !result.skipped.includes(`#${p.prNumber}`);
            return true;
          });
          allIssues.push(
            ...activePrs.map((p) => ({
              key: `#${p.prNumber}`,
              summary: `${repoLabel} — ${p.prTitle}`,
            })),
          );
        }
      }

      if (firstJobId && allIssues.length > 0) {
        reviewer.startJob(firstJobId, allIssues, undefined, undefined, 0);
        selected.value = new Set();
      } else {
        useToast().add({
          title: '已跳過',
          description: '所有選取的 PR 已經 Review 過',
          color: 'warning',
        });
      }
    } catch (error) {
      const msg =
        (error as any)?.data?.message ||
        (error instanceof Error ? error.message : '啟動失敗');
      useToast().add({ title: '啟動失敗', description: msg, color: 'error' });
    } finally {
      starting.value = false;
    }
  }

  async function loadHistory() {
    try {
      history.value = await $fetch<HistoryEntry[]>(
        '/api/claude-runner/jobs?type=pr-review',
      );
    } catch (error) {
      console.error('Failed to load PR inbox history:', error);
    }
  }

  return {
    items,
    loading,
    syncing,
    fetchError,
    fetchedAt,
    fetchedAgo,
    cachedAt,
    cachedAgo,
    selected,
    selectedCount,
    starting,
    statusFilter,
    filteredItems,
    groupedByUser,
    history,
    rightTab,
    reviewer,
    fetchItems,
    syncSlack,
    toggleItem,
    selectAllPending,
    clearSelection,
    runReview,
    loadHistory,
  };
}
