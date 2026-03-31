<script setup lang="ts">
useHead({ title: 'Claude Runner — PR Inbox' });

type RunnerJob = ReturnType<
  typeof import('~/composables/useRunnerJob').useRunnerJob
>;

const inboxTab = ref<{
  fetchItems: () => Promise<void>;
  loadHistory: () => Promise<void>;
  reviewer: RunnerJob;
}>();

onMounted(async () => {
  inboxTab.value?.loadHistory();

  const rev = inboxTab.value?.reviewer;
  if (rev) {
    const jobId = localStorage.getItem(rev.storageKey);
    if (jobId) {
      await rev.restoreJob(jobId);
    }
  }
});

onBeforeUnmount(() => {
  inboxTab.value?.reviewer.cleanup();
});
</script>

<template>
  <div class="flex flex-1 overflow-hidden">
    <PrInboxTab ref="inboxTab" />
  </div>
</template>
