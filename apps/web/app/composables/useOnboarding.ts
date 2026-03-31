import type { ComputedRef } from 'vue';

import { computed, onMounted, ref, watch } from 'vue';

import { driver } from 'driver.js';

import 'driver.js/dist/driver.css';

export interface OnboardingStep {
  id: 'jira' | 'labels' | 'repos' | 'skills';
  label: string;
  completed: ComputedRef<boolean>;
  /** Tour step index this checklist item maps to, or null if not in tour */
  tourIndex: null | number;
}

const TOUR_STEPS = [
  {
    element: '[data-tour="repos"]',
    popover: {
      title: '步驟 1：新增 Repo',
      description:
        '新增要自動修復的 Git Repo，設定本機路徑和 GitHub Repo 名稱。',
      side: 'right' as const,
      align: 'start' as const,
    },
  },
  {
    element: '[data-tour="jira-connection"]',
    popover: {
      title: '步驟 2：設定 JIRA 連線',
      description:
        '切換到 Integrations 分頁，填寫 JIRA URL、Email 和 API Token。',
      side: 'right' as const,
      align: 'start' as const,
    },
  },
  {
    element: '[data-tour="jira-labels"]',
    popover: {
      title: '步驟 3：設定 JIRA Labels',
      description: '新增 JIRA label 篩選要處理的 ticket（例如 "claude"）。',
      side: 'right' as const,
      align: 'start' as const,
    },
  },
  {
    element: '[data-tour="skills"]',
    popover: {
      title: '步驟 4：選擇 Skills',
      description:
        '點擊前往 Skills 頁面，選擇 Claude 執行時使用的技能，完成後即可開始修復！',
      side: 'bottom' as const,
      align: 'center' as const,
    },
  },
];

const DISMISSED_KEY = 'cr-onboarding-dismissed';

// Module-level shared state — starts hidden (true) to avoid SSR flash
const dismissed = ref(true);

// (removed — JIRA settings now live on /repos?tab=integrations)

// Signal to reset/restart the onboarding tour
export const requestResetTour = ref(false);

// Whether onboarding has incomplete steps (readable from any component)
export const onboardingIncomplete = ref(false);

function patchOverflow() {
  const patched = new Map<HTMLElement, string>();

  // Walk up from each tour target and patch every ancestor whose
  // computed overflow clips content (hidden, auto, scroll).
  document.querySelectorAll<HTMLElement>('[data-tour]').forEach((target) => {
    let el: HTMLElement | null = target.parentElement;
    while (el && el !== document.body) {
      const style = getComputedStyle(el);
      const ov = `${style.overflow} ${style.overflowX} ${style.overflowY}`;
      if (/hidden|auto|scroll/.test(ov) && !patched.has(el)) {
        patched.set(el, el.style.overflow);
        el.style.overflow = 'visible';
      }
      el = el.parentElement;
    }
  });

  return () => {
    for (const [el, prev] of patched) el.style.overflow = prev;
  };
}

export function useOnboarding(deps: {
  jiraConfigured: ComputedRef<boolean>;
  labelCount: ComputedRef<number>;
  repoCount: ComputedRef<number>;
  skillCount: ComputedRef<number>;
}) {
  onMounted(() => {
    dismissed.value = localStorage.getItem(DISMISSED_KEY) === 'true';

    // Auto-start tour for first-time users
    if (!dismissed.value && !allCompleted.value) {
      setTimeout(() => startTour(), 600);
    }
  });

  // Allow external components to trigger reset via signal
  watch(requestResetTour, (v) => {
    if (v) {
      requestResetTour.value = false;
      reset();
    }
  });

  watch(dismissed, (v) => {
    if (import.meta.client) {
      localStorage.setItem(DISMISSED_KEY, String(v));
    }
  });

  const steps: OnboardingStep[] = [
    {
      id: 'repos',
      label: '新增 Repo',
      completed: computed(() => deps.repoCount.value > 0),
      tourIndex: 0,
    },
    {
      id: 'jira',
      label: '設定 JIRA 連線',
      completed: deps.jiraConfigured,
      tourIndex: 1,
    },
    {
      id: 'labels',
      label: '設定 JIRA Labels',
      completed: computed(() => deps.labelCount.value > 0),
      tourIndex: 2,
    },
    {
      id: 'skills',
      label: '選擇 Skills',
      completed: computed(() => deps.skillCount.value > 0),
      tourIndex: null,
    },
  ];

  const completedCount = computed(
    () => steps.filter((s) => s.completed.value).length,
  );
  const allCompleted = computed(() => completedCount.value === steps.length);
  const showChecklist = computed(() => !dismissed.value && !allCompleted.value);

  // Sync module-level indicator
  watch(
    showChecklist,
    (v) => {
      onboardingIncomplete.value = v;
    },
    { immediate: true },
  );

  // Auto-dismiss when all completed
  watch(allCompleted, (v) => {
    if (v) dismissed.value = true;
  });

  function startTour(fromStep = 0) {
    // Step 0 = Repos tab, Steps 1-2 = Integrations tab, Step 3 = Skills (header, always visible)
    const initialTab = fromStep === 0 ? 'repos' : 'integrations';
    navigateTo(`/repos?tab=${initialTab}`);

    // Wait for the page to render and layout to settle,
    // then patch overflow and start the tour
    setTimeout(() => {
      const restoreOverflow = patchOverflow();

      const driverObj = driver({
        showProgress: true,
        animate: true,
        overlayColor: 'rgba(0, 0, 0, 0.7)',
        stagePadding: 10,
        stageRadius: 8,
        popoverClass: 'cr-tour-popover',
        nextBtnText: '下一步',
        prevBtnText: '上一步',
        doneBtnText: '完成',
        progressText: '{{current}} / {{total}}',
        onHighlightStarted: (el, step) => {
          // Switch to Integrations tab when moving from Repos step to JIRA steps
          const idx = TOUR_STEPS.indexOf(step);
          if (idx === 1) {
            navigateTo('/repos?tab=integrations');
          }
          setTimeout(() => {
            (el as HTMLElement)?.scrollIntoView?.({
              block: 'center',
              behavior: 'smooth',
            });
          }, 100);
        },
        onDestroyed: () => {
          restoreOverflow();
        },
        steps: TOUR_STEPS,
      });

      driverObj.drive(fromStep);
    }, 300);
  }

  function dismiss() {
    dismissed.value = true;
  }

  function reset() {
    dismissed.value = false;
    startTour();
  }

  return {
    steps,
    completedCount,
    allCompleted,
    showChecklist,
    dismissed,
    dismiss,
    reset,
    startTour,
  };
}
