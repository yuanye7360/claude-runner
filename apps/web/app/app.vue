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
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>

    <!-- Floating onboarding checklist (client-only to avoid SSR hydration mismatch) -->
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
