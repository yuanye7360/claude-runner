<script setup lang="ts">
import {
  onboardingIncomplete,
  requestResetTour,
} from '~/composables/useOnboarding';

const { config: jiraConfig, isConfigured: jiraConfigured } = useJiraConfig();
const { repoConfigs } = useRepoConfigs();
const { enabledSkillNames } = useSkills();

const onboarding = useOnboarding({
  jiraConfigured,
  labelCount: computed(() => jiraConfig.value.labels.length),
  repoCount: computed(() => repoConfigs.value.length),
  skillCount: computed(() => enabledSkillNames.value.length),
});

// ── Sidebar ──
const sidebar = useSidebar();

// ── Font size ──
const FONT_SIZES = [
  { label: '小', value: 14 },
  { label: '中', value: 16 },
  { label: '大', value: 18 },
] as const;
const fontSize = ref(
  import.meta.client ? Number(localStorage.getItem('cr-font-size') || 16) : 16,
);
watch(fontSize, (v) => {
  if (import.meta.client) localStorage.setItem('cr-font-size', String(v));
});
const rootFontSize = computed(() => `${fontSize.value}px`);

// ── Route info for header ──
const route = useRoute();
const pageTitle = computed(() => {
  const map: Record<string, string> = {
    '/jira-runner': 'JIRA Runner',
    '/pr-runner': 'PR Runner',
    '/pr-review': 'PR Review',
    '/dashboard': 'Dashboard',
    '/repos': 'Repos',
    '/skills': 'Skills',
  };
  return map[route.path] || 'ClaudeRunner';
});
const pageIcon = computed(() => {
  const map: Record<string, string> = {
    '/jira-runner': 'i-lucide-bug',
    '/pr-runner': 'i-lucide-git-pull-request',
    '/pr-review': 'i-lucide-search-code',
    '/dashboard': 'i-lucide-chart-bar',
    '/repos': 'i-lucide-folder-git-2',
    '/skills': 'i-heroicons-cube',
  };
  return map[route.path] || 'i-lucide-zap';
});

onMounted(() => {
  sidebar.init();
});
</script>

<template>
  <UApp>
    <div
      class="app-shell bg-cyberpunk flex h-screen text-[#e0e7ff]"
      :style="{ fontSize: rootFontSize }"
    >
      <!-- Sidebar -->
      <AppSidebar
        :collapsed="sidebar.isCollapsed.value"
        @toggle="sidebar.toggle()"
      />

      <!-- Main content -->
      <main class="flex flex-1 flex-col overflow-hidden">
        <!-- ══════ Top Header Bar ══════ -->
        <header
          class="flex h-12 shrink-0 items-center gap-3 border-b px-5"
          style="
            background: rgb(12 12 29 / 80%);
            border-color: rgb(139 92 246 / 12%);
            backdrop-filter: blur(12px);
          "
        >
          <!-- Page title -->
          <UIcon
            :name="pageIcon"
            class="text-[#8b5cf6]"
            style="font-size: 1.1em"
          />
          <span class="text-sm font-semibold text-[#e0e7ff]">
            {{ pageTitle }}
          </span>

          <!-- Right side -->
          <div class="ml-auto flex items-center gap-3">
            <!-- Font size -->
            <div class="flex items-center gap-1.5">
              <UIcon
                name="i-lucide-type"
                class="text-xs text-[#6b6b8a]"
              />
              <div class="flex gap-0.5">
                <button
                  v-for="s in FONT_SIZES"
                  :key="s.value"
                  class="rounded-md px-2 py-0.5 text-[11px] transition-colors"
                  :class="
                    fontSize === s.value
                      ? 'bg-[rgba(139,92,246,0.2)] font-medium text-[#c4b5fd]'
                      : 'text-[#6b6b8a] hover:bg-[rgba(139,92,246,0.08)] hover:text-[#c4b5fd]'
                  "
                  @click="fontSize = s.value"
                >
                  {{ s.label }}
                </button>
              </div>
            </div>

            <!-- Divider -->
            <div
              class="h-4 w-px"
              style="background: rgb(139 92 246 / 15%)"
            ></div>

            <!-- Onboarding guide -->
            <UTooltip v-if="onboardingIncomplete" text="點擊開始設定指引">
              <button
                class="relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[#f59e0b] transition-colors hover:bg-[rgba(245,158,11,0.1)]"
                @click="requestResetTour = true"
              >
                <span class="relative flex h-2.5 w-2.5 shrink-0">
                  <span
                    class="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#f59e0b] opacity-75"
                  ></span>
                  <span
                    class="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#f59e0b]"
                  ></span>
                </span>
                設定指引
              </button>
            </UTooltip>

            <!-- Guide button (always visible) -->
            <button
              class="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-[#6b6b8a] transition-colors hover:bg-[rgba(139,92,246,0.08)] hover:text-[#c4b5fd]"
              @click="requestResetTour = true"
            >
              <UIcon name="i-lucide-circle-help" />
              <span>使用指引</span>
            </button>

            <RepoManager />
          </div>
        </header>

        <!-- Page content -->
        <NuxtPage />
      </main>
    </div>

    <!-- Floating onboarding checklist -->
    <ClientOnly>
      <OnboardingChecklist
        v-if="onboarding.showChecklist.value"
        :steps="onboarding.steps"
        :completed-count="onboarding.completedCount.value"
        @dismiss="onboarding.dismiss()"
        @highlight="onboarding.startTour($event)"
      />
    </ClientOnly>
  </UApp>
</template>
