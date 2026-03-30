<script setup lang="ts">
import { requestResetTour } from '~/composables/useOnboarding';
import { useSkills } from '~/composables/useSkills';

defineProps<{
  collapsed: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle'): void;
  (e: 'fontSizeChange', value: number): void;
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
  emit('fontSizeChange', v);
});

// Expose mode and fontSize for parent (app.vue) to use
defineExpose({ mode, fontSize });
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
        <span class="text-sm font-bold tracking-wide text-[#e0e7ff]">ClaudeRunner</span>
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

    <!-- ── Footer ── -->
    <div
      class="flex shrink-0 flex-col gap-1 border-t px-3 py-3"
      style="border-color: rgb(139 92 246 / 10%)"
    >
      <!-- Font size (expanded only) -->
      <div
        v-if="!collapsed"
        class="flex items-center gap-2 text-[11px] text-[#6b6b8a]"
      >
        <UIcon name="i-lucide-type" class="shrink-0 text-[#8b5cf6]" />
        <div class="flex gap-1">
          <button
            v-for="s in FONT_SIZES"
            :key="s.value"
            class="rounded-md px-2 py-0.5 transition-colors"
            :class="
              fontSize === s.value
                ? 'bg-[rgba(139,92,246,0.2)] text-[#c4b5fd] font-medium'
                : 'hover:bg-[rgba(139,92,246,0.08)] hover:text-[#c4b5fd]'
            "
            @click="fontSize = s.value"
          >
            {{ s.label }}
          </button>
        </div>
      </div>

      <!-- Settings button -->
      <button
        v-if="!collapsed"
        class="flex items-center gap-1.5 rounded-[8px] px-0 py-1 text-[10px] text-[#4c4c6d] transition-colors hover:text-[#c4b5fd]"
        @click="requestResetTour = true"
      >
        <UIcon name="i-lucide-circle-help" class="shrink-0" />
        使用指引
      </button>

      <!-- Collapsed: just settings icon -->
      <button
        v-if="collapsed"
        class="mx-auto flex h-[34px] w-[34px] items-center justify-center rounded-[8px] text-[#4c4c6d] transition-colors hover:bg-[rgba(30,30,60,0.5)] hover:text-[#c4b5fd]"
        @click="requestResetTour = true"
      >
        <UIcon name="i-lucide-circle-help" />
      </button>
    </div>
  </aside>
</template>
