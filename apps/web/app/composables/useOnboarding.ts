import type { ComputedRef } from 'vue';

import { computed, ref, watch } from 'vue';

export interface OnboardingStep {
  id: 'jira' | 'repos' | 'skills';
  label: string;
  completed: ComputedRef<boolean>;
  action: () => void;
}

const DISMISSED_KEY = 'cr-onboarding-dismissed';

// Module-level shared state (same pattern as useJiraConfig, useRepoConfigs)
const dismissed = ref(
  typeof localStorage === 'undefined'
    ? false
    : localStorage.getItem(DISMISSED_KEY) === 'true',
);

watch(dismissed, (v) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(DISMISSED_KEY, String(v));
  }
});

export function useOnboarding(deps: {
  jiraConfigured: ComputedRef<boolean>;
  openSettings: () => void;
  repoCount: ComputedRef<number>;
  skillCount: ComputedRef<number>;
}) {
  const steps: OnboardingStep[] = [
    {
      id: 'jira',
      label: '設定 JIRA 連線（左側齒輪）',
      completed: deps.jiraConfigured,
      action: deps.openSettings,
    },
    {
      id: 'repos',
      label: '新增 Repo（左側齒輪 → Repos）',
      completed: computed(() => deps.repoCount.value > 0),
      action: deps.openSettings,
    },
    {
      id: 'skills',
      label: '選擇 Skills',
      completed: computed(() => deps.skillCount.value > 0),
      action: () => navigateTo('/skills'),
    },
  ];

  const completedCount = computed(
    () => steps.filter((s) => s.completed.value).length,
  );
  const allCompleted = computed(() => completedCount.value === steps.length);
  const showChecklist = computed(() => !dismissed.value && !allCompleted.value);

  // Auto-dismiss when all completed
  watch(allCompleted, (v) => {
    if (v) dismissed.value = true;
  });

  function dismiss() {
    dismissed.value = true;
  }

  function reset() {
    dismissed.value = false;
  }

  return {
    steps,
    completedCount,
    allCompleted,
    showChecklist,
    dismissed,
    dismiss,
    reset,
  };
}
