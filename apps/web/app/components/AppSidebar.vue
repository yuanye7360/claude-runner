<script setup lang="ts">
import { useSkills } from '~/composables/useSkills';

const { applyPreset: applySkillPreset } = useSkills();

// ── Mode ──
const mode = ref<'normal' | 'smart'>(
  import.meta.client
    ? (localStorage.getItem('cr-mode') as 'normal' | 'smart') || 'smart'
    : 'smart',
);
watch(mode, (v) => {
  if (import.meta.client) localStorage.setItem('cr-mode', v);
  applySkillPreset(v);
});

defineExpose({ mode });
</script>

<template>
  <aside
    class="flex w-13 shrink-0 flex-col items-center border-r py-3"
    style="background: var(--bg-sidebar); border-color: rgb(255 255 255 / 6%)"
  >
    <!-- Logo -->
    <div
      class="mb-4 flex h-8 w-8 items-center justify-center rounded-lg"
      style="background: linear-gradient(135deg, #8b5cf6, #06b6d4)"
    >
      <span class="text-sm text-white">⚡</span>
    </div>

    <!-- Navigation -->
    <nav class="flex flex-1 flex-col items-center gap-1">
      <SidebarNavItem
        to="/"
        icon="i-lucide-layout-dashboard"
        label="Dashboard"
      />
      <SidebarNavItem
        to="/jira-runner"
        icon="i-lucide-bug"
        label="JIRA Runner"
      />
      <SidebarNavItem
        to="/pr-runner"
        icon="i-lucide-git-pull-request"
        label="PR Runner"
      />
      <SidebarNavItem
        to="/pr-review"
        icon="i-lucide-search-code"
        label="Code Review"
      />
    </nav>

    <!-- Bottom: Settings -->
    <div class="flex flex-col items-center gap-1">
      <!-- Mode toggle -->
      <UTooltip
        :text="mode === 'smart' ? 'Smart Mode' : 'Normal Mode'"
        :popper="{ placement: 'right' }"
      >
        <button
          class="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent transition-colors hover:bg-[rgba(255,255,255,0.04)]"
          @click="mode = mode === 'smart' ? 'normal' : 'smart'"
        >
          <UIcon
            :name="mode === 'smart' ? 'i-lucide-sparkles' : 'i-lucide-zap'"
            class="text-[16px]"
            :class="mode === 'smart' ? 'text-[#8b5cf6]' : 'text-[#555]'"
          />
        </button>
      </UTooltip>

      <SidebarNavItem to="/repos" icon="i-lucide-settings" label="Settings" />
    </div>
  </aside>
</template>
