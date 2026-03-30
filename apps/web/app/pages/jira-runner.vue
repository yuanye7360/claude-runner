<script setup lang="ts">
import { useSkills } from '~/composables/useSkills';

useHead({ title: 'Claude Runner — JIRA Runner' });

const { enabledSkillNames, fetchSkills } = useSkills();

// ── Mode (read from localStorage, shared with sidebar) ──
const mode = ref<'normal' | 'smart'>(
  import.meta.client
    ? (localStorage.getItem('cr-mode') as 'normal' | 'smart') || 'smart'
    : 'smart',
);

// ── Cross-feature state ──
const crCreatedPrUrls = ref<string[]>([]);

// ── Child ref ──
type RunnerJob = ReturnType<
  typeof import('~/composables/useRunnerJob').useRunnerJob
>;

const jiraTab = ref<{
  cr: RunnerJob;
  loadHistory: () => Promise<void>;
  loadIssues: () => Promise<void>;
}>();

function onPrCreated(urls: string[]) {
  crCreatedPrUrls.value = urls;
}

// ── Lifecycle ──
onMounted(async () => {
  fetchSkills();
  jiraTab.value?.loadHistory();
  jiraTab.value?.loadIssues();

  const cr = jiraTab.value?.cr;
  if (cr) {
    const crJobId = localStorage.getItem(cr.storageKey);
    if (crJobId) {
      await cr.restoreJob(crJobId);
    }
  }
});

onBeforeUnmount(() => {
  jiraTab.value?.cr.cleanup();
});
</script>

<template>
  <div class="flex flex-1 overflow-hidden">
    <JiraRunnerTab
      ref="jiraTab"
      :mode="mode"
      :enabled-skill-names="enabledSkillNames"
      @pr-created="onPrCreated"
    />
  </div>
</template>
