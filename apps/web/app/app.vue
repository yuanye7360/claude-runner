<script setup lang="ts">
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
const sidebarRef = ref<{ fontSize: Ref<number>; mode: Ref<string> }>();

onMounted(() => {
  sidebar.init();
});

const rootFontSize = computed(
  () => `${sidebarRef.value?.fontSize.value ?? 16}px`,
);
</script>

<template>
  <UApp>
    <div
      class="app-shell bg-cyberpunk flex h-screen text-[#e0e7ff]"
      :style="{ fontSize: rootFontSize }"
    >
      <!-- Sidebar -->
      <AppSidebar
        ref="sidebarRef"
        :collapsed="sidebar.isCollapsed.value"
        @toggle="sidebar.toggle()"
      />

      <!-- Main content -->
      <main class="flex flex-1 flex-col overflow-hidden">
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
