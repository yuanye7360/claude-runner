// apps/web/app/composables/usePrNotifications.ts
export interface PrNotification {
  prUrl: string;
  prNumber: number;
  repo: string;
  count: number;
}

export function usePrNotifications() {
  const total = ref(0);
  const byPr = ref<PrNotification[]>([]);
  let timer: null | ReturnType<typeof setInterval> = null;

  async function fetch() {
    try {
      const data = await $fetch<{ byPr: PrNotification[]; total: number }>(
        '/api/pr-runner/notifications',
      );
      total.value = data.total;
      byPr.value = data.byPr;
    } catch {
      /* silent */
    }
  }

  function startPolling(interval = 30_000) {
    stopPolling();
    fetch();
    timer = setInterval(fetch, interval);
  }

  function stopPolling() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { total, byPr, fetch, startPolling, stopPolling };
}
