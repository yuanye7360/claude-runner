<script setup lang="ts">
useHead({ title: 'Claude Runner — PR Runner' });

// ── Cross-feature state (PR URLs created by JIRA runner in another tab) ──
const crCreatedPrUrls = ref<string[]>([]);

// ── Child ref ──
type RunnerJob = ReturnType<
  typeof import('~/composables/useRunnerJob').useRunnerJob
>;
type PrNotifs = ReturnType<
  typeof import('~/composables/usePrNotifications').usePrNotifications
>;

const prTab = ref<{
  loadHistory: () => Promise<void>;
  loadPRs: () => Promise<void>;
  pr: RunnerJob;
  prNotifications: PrNotifs;
  prsWithNotifications: { value: number };
}>();

// ── Lifecycle ──
onMounted(async () => {
  prTab.value?.loadHistory();
  prTab.value?.loadPRs();
  prTab.value?.prNotifications.startPolling();

  const pr = prTab.value?.pr;
  if (pr) {
    const prJobId = localStorage.getItem(pr.storageKey);
    if (prJobId) {
      await pr.restoreJob(prJobId);
    }
  }
});

onBeforeUnmount(() => {
  prTab.value?.pr.cleanup();
  prTab.value?.prNotifications.stopPolling();
});
</script>

<template>
  <div class="flex flex-1 overflow-hidden">
    <PrRunnerTab ref="prTab" :cr-created-pr-urls="crCreatedPrUrls" />
  </div>
</template>
