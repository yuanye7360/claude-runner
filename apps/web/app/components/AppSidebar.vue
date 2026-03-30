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
    class="flex w-45 shrink-0 flex-col border-r px-2 py-3"
    style="background: var(--bg-sidebar); border-color: rgb(255 255 255 / 6%)"
  >
    <!-- Logo -->
    <div class="mb-4 flex items-center gap-2 px-2.5">
      <div
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style="background: linear-gradient(135deg, #8b5cf6, #06b6d4)"
      >
        <span class="text-xs text-white">⚡</span>
      </div>
      <span class="text-xs font-semibold text-[#fafafa]">ClaudeRunner</span>
    </div>

    <!-- Navigation -->
    <nav class="flex flex-1 flex-col gap-0.5">
      <SidebarNavItem
        to="/dashboard"
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

    <!-- Bottom -->
    <div
      class="flex flex-col gap-0.5 border-t pt-2"
      style="border-color: rgb(255 255 255 / 6%)"
    >
      <!-- Mode toggle -->
      <button
        class="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-[rgba(255,255,255,0.04)]"
        @click="mode = mode === 'smart' ? 'normal' : 'smart'"
      >
        <UIcon
          :name="mode === 'smart' ? 'i-lucide-sparkles' : 'i-lucide-zap'"
          class="shrink-0 text-[15px]"
          :class="mode === 'smart' ? 'text-[#8b5cf6]' : 'text-[#555]'"
        />
        <span class="text-[12px] text-[#666]">
          {{ mode === 'smart' ? 'Smart' : 'Normal' }}
        </span>
      </button>

      <SidebarNavItem to="/repos" icon="i-lucide-settings" label="Settings" />
    </div>
  </aside>
</template>
