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

// ── Command Palette ──
const showCommandPalette = ref(false);

function onGlobalKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    showCommandPalette.value = !showCommandPalette.value;
  }
}

onMounted(() => {
  if (import.meta.client) {
    window.addEventListener('keydown', onGlobalKeydown);
  }
});

onBeforeUnmount(() => {
  if (import.meta.client) {
    window.removeEventListener('keydown', onGlobalKeydown);
  }
});

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
    '/': 'Overview',
    '/jira-runner': 'JIRA Runner',
    '/pr-runner': 'PR Runner',
    '/pr-review': 'Code Review',
    '/repos': 'Settings',
    '/skills': 'Settings',
    '/dashboard': 'Dashboard',
  };
  return map[route.path] || 'ClaudeRunner';
});
</script>

<template>
  <UApp>
    <div
      class="flex h-screen text-[#fafafa]"
      :style="{ fontSize: rootFontSize, background: '#0a0a0f' }"
    >
      <!-- Sidebar -->
      <AppSidebar />

      <!-- Main content -->
      <main class="flex flex-1 flex-col overflow-hidden">
        <!-- Header -->
        <header
          class="glass flex h-12 shrink-0 items-center gap-3 border-b px-5"
          style="border-color: rgb(255 255 255 / 6%)"
        >
          <span class="text-sm font-semibold tracking-tight text-[#fafafa]">
            {{ pageTitle }}
          </span>
          <div class="h-4 w-px" style="background: rgb(255 255 255 / 6%)"></div>

          <div class="ml-auto flex items-center gap-3">
            <!-- Command palette trigger -->
            <button
              class="flex h-7.5 w-50 items-center gap-2 rounded-lg border px-3 text-[11px] text-[#444] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[#888]"
              style="border-color: rgb(255 255 255 / 8%)"
              @click="showCommandPalette = true"
            >
              <UIcon name="i-lucide-search" class="shrink-0" />
              <span>搜尋或跳轉...</span>
              <kbd
                class="ml-auto rounded border px-1 py-0.5 text-[9px]"
                style="border-color: rgb(255 255 255 / 8%)"
                >⌘K</kbd
              >
            </button>

            <div
              class="h-4 w-px"
              style="background: rgb(255 255 255 / 6%)"
            ></div>

            <!-- Font size -->
            <div class="flex items-center gap-1.5">
              <UIcon name="i-lucide-type" class="text-xs text-[#444]" />
              <div class="flex gap-0.5">
                <button
                  v-for="s in FONT_SIZES"
                  :key="s.value"
                  class="rounded-md px-2 py-0.5 text-[11px] transition-colors"
                  :class="
                    fontSize === s.value
                      ? 'bg-[rgba(255,255,255,0.06)] font-medium text-[#fafafa]'
                      : 'text-[#444] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#888]'
                  "
                  @click="fontSize = s.value"
                >
                  {{ s.label }}
                </button>
              </div>
            </div>

            <div
              class="h-4 w-px"
              style="background: rgb(255 255 255 / 6%)"
            ></div>

            <!-- Guide -->
            <UTooltip v-if="onboardingIncomplete" text="點擊開始設定指引">
              <button
                class="relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[#f59e0b] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                @click="requestResetTour = true"
              >
                <span class="relative flex h-2 w-2 shrink-0">
                  <span
                    class="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#f59e0b] opacity-75"
                  ></span>
                  <span
                    class="relative inline-flex h-2 w-2 rounded-full bg-[#f59e0b]"
                  ></span>
                </span>
                設定指引
              </button>
            </UTooltip>

            <button
              class="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-[#444] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[#888]"
              @click="requestResetTour = true"
            >
              <UIcon name="i-lucide-circle-help" />
              <span>使用指引</span>
            </button>

            <NuxtLink
              to="/skills"
              data-tour="skills"
              class="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-[#444] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[#888]"
            >
              <UIcon name="i-heroicons-cube" />
              <span>Skills</span>
              <span
                v-if="enabledSkillNames.length > 0"
                class="rounded-full px-1.5 py-0.5 text-[9px] tabular-nums"
                style="color: #888; background: rgb(255 255 255 / 6%)"
              >
                {{ enabledSkillNames.length }}
              </span>
            </NuxtLink>

            <RepoManager />
          </div>
        </header>

        <NuxtPage />
      </main>
    </div>

    <ClientOnly>
      <OnboardingChecklist
        v-if="onboarding.showChecklist.value"
        :steps="onboarding.steps"
        :completed-count="onboarding.completedCount.value"
        @dismiss="onboarding.dismiss()"
        @highlight="onboarding.startTour($event)"
      />
    </ClientOnly>

    <CommandPalette
      :visible="showCommandPalette"
      @close="showCommandPalette = false"
    />
  </UApp>
</template>
