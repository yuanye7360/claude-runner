<script setup lang="ts">
useHead({ title: 'Claude Runner — PR Review' });

type RunnerJob = ReturnType<
  typeof import('~/composables/useRunnerJob').useRunnerJob
>;

const reviewTab = ref<{
  loadHistory: () => Promise<void>;
  loadPRs: () => Promise<void>;
  loadReviewHistory: () => Promise<void>;
  reviewer: RunnerJob;
}>();

// ── Lifecycle ──
onMounted(async () => {
  reviewTab.value?.loadHistory();
  reviewTab.value?.loadPRs();
  reviewTab.value?.loadReviewHistory();

  const rev = reviewTab.value?.reviewer;
  if (rev) {
    const revJobId = localStorage.getItem(rev.storageKey);
    if (revJobId) {
      await rev.restoreJob(revJobId);
    }
  }
});

onBeforeUnmount(() => {
  reviewTab.value?.reviewer.cleanup();
});
</script>

<template>
  <div class="flex flex-1 overflow-hidden">
    <PrReviewerTab ref="reviewTab" />
  </div>
</template>
