<script setup lang="ts">
import { useSkills } from '~/composables/useSkills';

defineProps<{
  collapsed: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle'): void;
}>();

const { enabledSkillNames, applyPreset: applySkillPreset } = useSkills();

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
    class="flex shrink-0 flex-col border-r transition-[width] duration-200 ease-in-out"
    :class="collapsed ? 'w-[60px]' : 'w-[220px]'"
    style="background: var(--bg-sidebar); border-color: rgb(139 92 246 / 12%)"
  >
    <!-- ── Header: Logo + Mode Toggle ── -->
    <div
      class="flex shrink-0 items-center gap-2 px-3 pt-4 pb-2"
      :class="collapsed ? 'justify-center' : ''"
    >
      <div
        class="neon-glow-logo flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style="background: linear-gradient(135deg, #8b5cf6, #06b6d4)"
      >
        <span class="text-sm text-white">⚡</span>
      </div>
      <template v-if="!collapsed">
        <span class="text-sm font-bold tracking-wide text-[#e0e7ff]"
          >ClaudeRunner</span
        >
        <button
          class="ml-auto rounded-md px-1.5 py-0.5 text-[9px] font-medium transition-colors"
          :class="
            mode === 'smart'
              ? 'border border-[rgba(139,92,246,0.25)] bg-[rgba(139,92,246,0.15)] text-[#a78bfa]'
              : 'border border-[rgba(100,116,139,0.25)] bg-[rgba(100,116,139,0.15)] text-[#64748b]'
          "
          @click="mode = mode === 'smart' ? 'normal' : 'smart'"
        >
          {{ mode === 'smart' ? 'Smart' : 'Normal' }}
        </button>
      </template>
    </div>

    <!-- ── Collapse Toggle ── -->
    <div
      class="flex px-3 pb-2"
      :class="collapsed ? 'justify-center' : 'justify-end'"
    >
      <button
        class="flex h-5 w-5 items-center justify-center rounded-[5px] text-[10px] text-[#8b5cf6] transition-colors hover:bg-[rgba(139,92,246,0.1)]"
        style="border: 1px solid rgb(139 92 246 / 15%)"
        @click="emit('toggle')"
      >
        {{ collapsed ? '»' : '«' }}
      </button>
    </div>

    <!-- ── Navigation ── -->
    <nav class="flex-1 overflow-y-auto px-2">
      <!-- Pipeline group -->
      <SidebarNavGroup label="Pipeline" :collapsed="collapsed" />
      <div class="flex flex-col gap-0.5">
        <SidebarNavItem
          to="/jira-runner"
          icon="i-lucide-bug"
          label="JIRA Runner"
          :collapsed="collapsed"
        />
        <SidebarNavItem
          to="/pr-runner"
          icon="i-lucide-git-pull-request"
          label="PR Runner"
          :collapsed="collapsed"
        />
        <SidebarNavItem
          to="/pr-review"
          icon="i-lucide-search-code"
          label="PR Review"
          :collapsed="collapsed"
        />
      </div>

      <!-- Analytics group -->
      <SidebarNavGroup label="Analytics" :collapsed="collapsed" />
      <div class="flex flex-col gap-0.5">
        <SidebarNavItem
          to="/dashboard"
          icon="i-lucide-chart-bar"
          label="Dashboard"
          :collapsed="collapsed"
        />
      </div>

      <!-- Settings group -->
      <SidebarNavGroup label="Settings" :collapsed="collapsed" />
      <div class="flex flex-col gap-0.5">
        <SidebarNavItem
          to="/repos"
          icon="i-lucide-folder-git-2"
          label="Repos"
          :collapsed="collapsed"
        />
        <SidebarNavItem
          to="/skills"
          icon="i-heroicons-cube"
          label="Skills"
          :badge="enabledSkillNames.length"
          :collapsed="collapsed"
        />
      </div>
    </nav>

  </aside>
</template>
