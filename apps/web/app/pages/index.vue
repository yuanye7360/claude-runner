<script setup lang="ts">
import {
  onboardingIncomplete,
  requestResetTour,
} from '~/composables/useOnboarding';
import { useSkills } from '~/composables/useSkills';

useHead({ title: 'Claude Runner — Pipeline' });

// ── Font size ───────────────────────────────────────────
const FONT_SIZES = [
  { label: '小', value: 14 },
  { label: '中', value: 16 },
  { label: '大', value: 18 },
] as const;

const fontSize = ref(
  typeof localStorage === 'undefined'
    ? 16
    : Number(localStorage.getItem('cr-font-size') || 16),
);
watch(fontSize, (v) => localStorage.setItem('cr-font-size', String(v)));
const rootFontSize = computed(() => `${fontSize.value}px`);

const showSettings = ref(false);

const {
  enabledSkillNames,
  fetchSkills,
  applyPreset: applySkillPreset,
} = useSkills();

// ── Mode ────────────────────────────────────────────────
const mode = ref<'normal' | 'smart'>(
  typeof localStorage === 'undefined'
    ? 'smart'
    : (localStorage.getItem('cr-mode') as 'normal' | 'smart') || 'smart',
);
watch(mode, (v) => {
  localStorage.setItem('cr-mode', v);
  applySkillPreset(v);
});

// ── Top-level tab ───────────────────────────────────────
const activeFeature = ref<'jira' | 'pr' | 'review'>(
  typeof localStorage === 'undefined'
    ? 'jira'
    : (localStorage.getItem('cr-active-feature') as 'jira' | 'pr' | 'review') ||
        'jira',
);
watch(activeFeature, (v) => localStorage.setItem('cr-active-feature', v));

// ── Cross-feature state ─────────────────────────────────
const crCreatedPrUrls = ref<string[]>([]);

// ── Child refs ──────────────────────────────────────────
type RunnerJob = ReturnType<
  typeof import('~/composables/useRunnerJob').useRunnerJob
>;
type PrNotifs = ReturnType<
  typeof import('~/composables/usePrNotifications').usePrNotifications
>;

const jiraTab = ref<{
  cr: RunnerJob;
  loadHistory: () => Promise<void>;
  loadIssues: () => Promise<void>;
}>();
const prTab = ref<{
  loadHistory: () => Promise<void>;
  loadPRs: () => Promise<void>;
  pr: RunnerJob;
  prNotifications: PrNotifs;
  prsWithNotifications: { value: number };
}>();
const reviewTab = ref<{
  loadHistory: () => Promise<void>;
  loadPRs: () => Promise<void>;
  loadRepos: () => Promise<void>;
  reviewer: RunnerJob;
}>();

function onPrCreated(urls: string[]) {
  crCreatedPrUrls.value = urls;
  prTab.value?.loadPRs();
}

// ── Lifecycle ───────────────────────────────────────────
onMounted(async () => {
  jiraTab.value?.loadHistory();
  prTab.value?.loadHistory();
  jiraTab.value?.loadIssues();
  prTab.value?.loadPRs();
  fetchSkills();
  prTab.value?.prNotifications.startPolling();
  reviewTab.value?.loadRepos();
  reviewTab.value?.loadHistory();

  // Restore Claude Runner job
  const cr = jiraTab.value?.cr;
  if (cr) {
    const crJobId = localStorage.getItem(cr.storageKey);
    if (crJobId) {
      await cr.restoreJob(crJobId);
      if (cr.activeJob.value) {
        activeFeature.value = 'jira';
      }
    }
  }

  // Restore PR Runner job
  const pr = prTab.value?.pr;
  if (pr) {
    const prJobId = localStorage.getItem(pr.storageKey);
    if (prJobId) {
      await pr.restoreJob(prJobId);
      if (pr.activeJob.value) {
        activeFeature.value = 'pr';
      }
    }
  }

  // Restore PR Review job
  const rev = reviewTab.value?.reviewer;
  if (rev) {
    const revJobId = localStorage.getItem(rev.storageKey);
    if (revJobId) {
      await rev.restoreJob(revJobId);
      if (rev.activeJob.value) {
        activeFeature.value = 'review';
      }
    }
  }
});

onBeforeUnmount(() => {
  jiraTab.value?.cr.cleanup();
  prTab.value?.pr.cleanup();
  prTab.value?.prNotifications.stopPolling();
  reviewTab.value?.reviewer.cleanup();
});
</script>

<template>
  <div class="runner flex h-screen flex-col bg-gray-950 text-gray-100">
    <!-- ══════ Top nav ══════ -->
    <div
      class="flex h-12 shrink-0 items-center gap-3 border-b border-gray-800 px-4"
    >
      <div class="flex items-center gap-2">
        <span class="text-primary-400 text-lg">⚡</span>
        <span class="font-semibold text-white">Claude Runner</span>
      </div>

      <!-- ── Feature Tabs ── -->
      <div class="ml-4 flex items-center gap-1">
        <button
          class="relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-all duration-150"
          :class="
            activeFeature === 'jira'
              ? 'bg-blue-500/10 font-semibold text-blue-400'
              : 'text-gray-500 hover:bg-gray-800/60 hover:text-gray-300'
          "
          @click="activeFeature = 'jira'"
        >
          <UIcon name="i-lucide-bug" style="font-size: 1.1em" />
          JIRA Issues
          <span
            v-if="jiraTab?.cr.isRunning.value"
            class="ml-0.5 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400"
          ></span>
        </button>

        <button
          class="relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-all duration-150"
          :class="
            activeFeature === 'pr'
              ? 'bg-green-500/10 font-semibold text-green-400'
              : 'text-gray-500 hover:bg-gray-800/60 hover:text-gray-300'
          "
          @click="activeFeature = 'pr'"
        >
          <UIcon name="i-lucide-git-pull-request" style="font-size: 1.1em" />
          PR Reviews
          <span
            v-if="(prTab?.prsWithNotifications.value ?? 0) > 0"
            class="ml-1 inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-xs text-white"
          >
            {{ prTab?.prsWithNotifications.value }}
          </span>
          <span
            v-if="prTab?.pr.isRunning.value"
            class="ml-0.5 inline-block h-2 w-2 animate-pulse rounded-full bg-green-400"
          ></span>
        </button>
        <button
          class="relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-all duration-150"
          :class="
            activeFeature === 'review'
              ? 'bg-purple-500/10 font-semibold text-purple-400'
              : 'text-gray-500 hover:bg-gray-800/60 hover:text-gray-300'
          "
          @click="activeFeature = 'review'"
        >
          <UIcon name="i-lucide-search-code" style="font-size: 1.1em" />
          Code Review
          <span
            v-if="reviewTab?.reviewer.isRunning.value"
            class="ml-0.5 inline-block h-2 w-2 animate-pulse rounded-full bg-purple-400"
          ></span>
        </button>
        <NuxtLink
          to="/dashboard"
          class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-gray-500 transition-colors hover:text-gray-300"
        >
          <UIcon name="i-lucide-chart-bar" style="font-size: 0.85em" />
          Dashboard
        </NuxtLink>
      </div>

      <!-- ── Right side controls ── -->
      <div class="ml-auto flex items-center gap-2">
        <UTooltip v-if="onboardingIncomplete" text="點擊開始設定指引">
          <button
            class="relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-orange-400 transition-colors hover:bg-orange-500/10"
            @click="requestResetTour = true"
          >
            <span class="relative flex h-2.5 w-2.5 shrink-0">
              <span
                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75"
              ></span>
              <span
                class="relative inline-flex h-2.5 w-2.5 rounded-full bg-orange-500"
              ></span>
            </span>
            設定指引
          </button>
        </UTooltip>
        <NuxtLink
          to="/skills"
          data-tour="skills"
          class="flex items-center gap-1 rounded-lg px-2 py-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
        >
          <UIcon name="i-heroicons-cube" style="font-size: 1em" />
          <span class="text-xs">Skills</span>
          <span
            v-if="enabledSkillNames.length > 0"
            class="bg-primary-500/20 text-primary-400 rounded-full px-1.5 py-0.5 text-xs leading-none tabular-nums"
          >
            {{ enabledSkillNames.length }}
          </span>
        </NuxtLink>
        <button
          class="flex items-center rounded-lg px-2 py-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
          :class="{ 'text-primary-400': showSettings }"
          @click="showSettings = !showSettings"
        >
          <UIcon name="i-lucide-settings-2" style="font-size: 1em" />
        </button>
      </div>
    </div>

    <!-- ══════ Settings panel (collapsible) ══════ -->
    <div
      v-if="showSettings"
      class="shrink-0 border-b border-gray-800 bg-gray-900/80 px-5 py-4"
    >
      <div class="mx-auto max-w-3xl">
        <div class="mb-4 flex items-center justify-between">
          <span class="font-medium text-gray-300">設定</span>
          <button
            class="text-gray-500 hover:text-gray-300"
            @click="showSettings = false"
          >
            <UIcon name="i-lucide-x" />
          </button>
        </div>

        <div class="space-y-3">
          <div
            class="text-xs font-medium tracking-wide text-gray-500 uppercase"
          >
            一般設定
          </div>

          <!-- Mode -->
          <div class="flex items-center gap-2">
            <span class="w-20 shrink-0 text-xs text-gray-500">模式</span>
            <div
              class="flex items-center gap-1 rounded-lg bg-gray-800/60 p-0.5"
            >
              <button
                class="rounded-md px-2.5 py-1 text-xs transition-colors"
                :class="
                  mode === 'normal'
                    ? 'bg-gray-700 font-medium text-white'
                    : 'text-gray-500 hover:text-gray-300'
                "
                @click="mode = 'normal'"
              >
                普通
              </button>
              <button
                class="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors"
                :class="
                  mode === 'smart'
                    ? 'bg-primary-600 font-medium text-white'
                    : 'text-gray-500 hover:text-gray-300'
                "
                @click="mode = 'smart'"
              >
                <UIcon name="i-lucide-sparkles" style="font-size: 0.85em" />
                智能
              </button>
            </div>
          </div>

          <!-- Font size -->
          <div class="flex items-center gap-2">
            <span class="w-20 shrink-0 text-xs text-gray-500">字體大小</span>
            <div
              class="flex items-center gap-1 rounded-lg bg-gray-800/60 p-0.5"
            >
              <button
                v-for="s in FONT_SIZES"
                :key="s.value"
                class="rounded-md px-2.5 py-1 text-xs transition-colors"
                :class="
                  fontSize === s.value
                    ? 'bg-gray-700 font-medium text-white'
                    : 'text-gray-500 hover:text-gray-300'
                "
                @click="fontSize = s.value"
              >
                {{ s.label }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════ Body: left list + right detail ══════ -->
    <div class="flex flex-1 overflow-hidden">
      <JiraRunnerTab
        v-show="activeFeature === 'jira'"
        ref="jiraTab"
        :mode="mode"
        :enabled-skill-names="enabledSkillNames"
        @pr-created="onPrCreated"
      />

      <PrRunnerTab
        v-show="activeFeature === 'pr'"
        ref="prTab"
        :cr-created-pr-urls="crCreatedPrUrls"
      />

      <PrReviewerTab v-show="activeFeature === 'review'" ref="reviewTab" />
    </div>
  </div>
</template>

<style scoped>
/* stylelint-disable declaration-property-value-no-unknown, value-keyword-case */
.runner {
  font-size: v-bind(rootFontSize);
}
/* stylelint-enable declaration-property-value-no-unknown, value-keyword-case */
</style>
