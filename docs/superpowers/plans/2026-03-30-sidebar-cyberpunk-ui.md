# Sidebar + Cyberpunk Neon UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert ClaudeRunner from a top-tab layout to a collapsible sidebar navigation with cyberpunk neon visual theme.

**Architecture:** The current `pages/index.vue` houses all three pipeline features (JIRA/PR/Review) via tabs. We split them into independent pages, build a shared sidebar component, wire it into `app.vue`, then apply the cyberpunk neon color system globally. The sidebar composable manages collapse state with localStorage persistence.

**Tech Stack:** Nuxt 4, Vue 3, Nuxt UI v4, Tailwind CSS, TypeScript

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `app/composables/useSidebar.ts` | Sidebar collapse state + localStorage persistence + responsive defaults |
| `app/components/AppSidebar.vue` | Sidebar shell: logo, mode toggle, nav groups, footer settings, collapse button |
| `app/components/SidebarNavItem.vue` | Single nav item: icon + label + optional badge + active state + tooltip |
| `app/components/SidebarNavGroup.vue` | Group header label (e.g., "Pipeline", "Analytics", "Settings") |
| `app/pages/jira-runner.vue` | JIRA Runner standalone page (extracted from index.vue) |
| `app/pages/pr-review.vue` | PR Review standalone page (extracted from index.vue) |

### Modified Files

| File | Changes |
|------|---------|
| `app/assets/css/main.css` | Add cyberpunk CSS variables + neon utility classes + update driver.js theme |
| `app/app.config.ts` | Override Nuxt UI color tokens for cyberpunk palette |
| `tailwind.config.ts` | Extend theme with CSS variable references for colors, shadows, border-radius |
| `app/app.vue` | Replace NuxtLayout with sidebar + main flex layout |
| `app/pages/index.vue` | Redirect to `/jira-runner` |
| `app/pages/pr-runner.vue` | Convert from redirect to standalone page (move PrRunnerTab logic here) |
| `app/pages/claude-runner.vue` | Update redirect target to `/jira-runner` |
| `app/pages/dashboard.vue` | Remove standalone header/nav, apply cyberpunk classes |
| `app/pages/repos.vue` | Remove standalone header/nav, apply cyberpunk classes |
| `app/pages/skills.vue` | Remove standalone header/nav, apply cyberpunk classes |
| `app/pages/jobs/[id].vue` | Remove standalone header/nav, apply cyberpunk classes |
| `app/components/JiraRunnerTab.vue` | No changes (business logic preserved) |
| `app/components/PrRunnerTab.vue` | No changes (business logic preserved) |
| `app/components/PrReviewerTab.vue` | No changes (business logic preserved) |

---

## Task 1: Cyberpunk CSS Variables & Tailwind Theme

**Files:**
- Modify: `apps/web/app/assets/css/main.css`
- Modify: `apps/web/tailwind.config.ts`
- Modify: `apps/web/app/app.config.ts`

- [ ] **Step 1: Add cyberpunk CSS variables to main.css**

Add the `:root` block and neon utility classes right after the two `@import` lines (before the driver.js overrides):

```css
/* ── Cyberpunk Neon Theme ── */
:root {
  --bg-base: #0c0c1d;
  --bg-base-end: #111128;
  --bg-sidebar: rgba(15, 15, 35, 0.97);
  --bg-surface: rgba(15, 15, 35, 0.5);
  --bg-surface-hover: rgba(30, 30, 60, 0.5);
  --color-primary: #8b5cf6;
  --color-accent: #06b6d4;
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-text: #e0e7ff;
  --color-text-active: #c4b5fd;
  --color-text-muted: #4c4c6d;
  --border-glow: rgba(139, 92, 246, 0.15);
  --border-glow-strong: rgba(139, 92, 246, 0.2);
  --radius-lg: 16px;
  --radius-md: 10px;
  --radius-sm: 8px;
}

/* Neon glow utilities */
.neon-glow-purple {
  box-shadow: 0 0 8px rgba(139, 92, 246, 0.5);
}
.neon-glow-cyan {
  box-shadow: 0 0 8px rgba(6, 182, 212, 0.5);
}
.neon-glow-green {
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
}
.neon-glow-logo {
  box-shadow: 0 0 20px rgba(139, 92, 246, 0.35);
}
.neon-text-purple {
  text-shadow: 0 0 12px rgba(139, 92, 246, 0.3);
}
.neon-text-cyan {
  text-shadow: 0 0 12px rgba(6, 182, 212, 0.3);
}
.neon-text-green {
  text-shadow: 0 0 12px rgba(34, 197, 94, 0.3);
}
.neon-text-warning {
  text-shadow: 0 0 12px rgba(245, 158, 11, 0.3);
}

/* Cyberpunk page background gradient */
.bg-cyberpunk {
  background: linear-gradient(145deg, var(--bg-base) 0%, var(--bg-base-end) 100%);
}
```

Also update the driver.js theme colors to match cyberpunk palette. Change the `.cr-tour-popover.driver-popover` background-color from `#1a1a2e` to `#0c0c1d`, and the action button colors from `#3b82f6` to `#8b5cf6` (and hover from `#2563eb` to `#7c3aed`).

- [ ] **Step 2: Extend Tailwind config with theme references**

Replace the full content of `apps/web/tailwind.config.ts`:

```ts
import typography from '@tailwindcss/typography';
import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app/**/*.{js,vue,ts}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        cyber: {
          base: 'var(--bg-base)',
          'base-end': 'var(--bg-base-end)',
          sidebar: 'var(--bg-sidebar)',
          surface: 'var(--bg-surface)',
          'surface-hover': 'var(--bg-surface-hover)',
          primary: 'var(--color-primary)',
          accent: 'var(--color-accent)',
          success: 'var(--color-success)',
          warning: 'var(--color-warning)',
          text: 'var(--color-text)',
          'text-active': 'var(--color-text-active)',
          'text-muted': 'var(--color-text-muted)',
        },
      },
      borderColor: {
        glow: 'var(--border-glow)',
        'glow-strong': 'var(--border-glow-strong)',
      },
      borderRadius: {
        lg: 'var(--radius-lg)',
        md: 'var(--radius-md)',
        sm: 'var(--radius-sm)',
      },
    },
  },
  plugins: [typography],
};
```

- [ ] **Step 3: Configure Nuxt UI color tokens in app.config.ts**

Replace the full content of `apps/web/app/app.config.ts`:

```ts
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'violet',
      neutral: 'slate',
    },
  },
});
```

- [ ] **Step 4: Verify the app still compiles**

Run: `cd /Users/yeyuan/home/ClaudeRunner && pnpm dev --filter web 2>&1 | head -30`
Expected: Dev server starts without CSS/Tailwind errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/assets/css/main.css apps/web/tailwind.config.ts apps/web/app/app.config.ts
git commit -m "feat(ui): add cyberpunk neon CSS variables and Tailwind theme"
```

---

## Task 2: Sidebar Composable (`useSidebar`)

**Files:**
- Create: `apps/web/app/composables/useSidebar.ts`

- [ ] **Step 1: Create the composable**

Create `apps/web/app/composables/useSidebar.ts`:

```ts
const STORAGE_KEY = 'cr-sidebar-collapsed';
const BREAKPOINT = 1024;

const isCollapsed = ref(false);

export function useSidebar() {
  function init() {
    if (!import.meta.client) return;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      isCollapsed.value = stored === 'true';
    } else {
      isCollapsed.value = window.innerWidth < BREAKPOINT;
    }
  }

  function toggle() {
    isCollapsed.value = !isCollapsed.value;
    if (import.meta.client) {
      localStorage.setItem(STORAGE_KEY, String(isCollapsed.value));
    }
  }

  return {
    isCollapsed: readonly(isCollapsed),
    toggle,
    init,
  };
}
```

- [ ] **Step 2: Verify auto-import works**

Run: `cd /Users/yeyuan/home/ClaudeRunner && pnpm dev --filter web 2>&1 | head -20`
Expected: No import errors. Nuxt auto-imports composables from the `composables/` directory.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/composables/useSidebar.ts
git commit -m "feat(ui): add useSidebar composable with collapse persistence"
```

---

## Task 3: Sidebar Components

**Files:**
- Create: `apps/web/app/components/SidebarNavGroup.vue`
- Create: `apps/web/app/components/SidebarNavItem.vue`
- Create: `apps/web/app/components/AppSidebar.vue`

- [ ] **Step 1: Create SidebarNavGroup.vue**

Create `apps/web/app/components/SidebarNavGroup.vue`:

```vue
<script setup lang="ts">
defineProps<{
  label: string;
  collapsed: boolean;
}>();
</script>

<template>
  <div v-if="!collapsed" class="mb-2 mt-4 first:mt-0 px-3">
    <span
      class="text-[9px] font-medium uppercase tracking-[2px]"
      style="color: rgba(139, 92, 246, 0.45)"
    >
      {{ label }}
    </span>
  </div>
  <div v-else class="mx-auto my-2 h-px w-6" style="background: rgba(139, 92, 246, 0.1)" />
</template>
```

- [ ] **Step 2: Create SidebarNavItem.vue**

Create `apps/web/app/components/SidebarNavItem.vue`:

```vue
<script setup lang="ts">
const props = defineProps<{
  to: string;
  icon: string;
  label: string;
  badge?: number;
  collapsed: boolean;
  isRunning?: boolean;
}>();

const route = useRoute();
const isActive = computed(() => route.path === props.to);
</script>

<template>
  <NuxtLink
    :to="to"
    class="group flex items-center gap-2 transition-all duration-150"
    :class="[
      collapsed ? 'mx-auto w-[38px] justify-center rounded-[8px] px-0 py-2' : 'rounded-[10px] px-3 py-2',
      isActive
        ? 'border-l-2 border-[#8b5cf6]'
        : 'border-l-2 border-transparent hover:bg-[rgba(30,30,60,0.5)]',
    ]"
    :style="isActive ? 'background: linear-gradient(90deg, rgba(139,92,246,0.12), transparent)' : ''"
  >
    <!-- Icon -->
    <UIcon
      :name="icon"
      class="shrink-0 text-base"
      :class="isActive ? 'text-[#8b5cf6]' : 'text-[#4c4c6d] group-hover:text-[#c4b5fd]'"
    />

    <!-- Label (hidden when collapsed) -->
    <span
      v-if="!collapsed"
      class="truncate text-[12px] font-medium transition-colors"
      :class="isActive ? 'text-[#c4b5fd]' : 'text-[#4c4c6d] group-hover:text-[#c4b5fd]'"
    >
      {{ label }}
    </span>

    <!-- Running indicator -->
    <span
      v-if="isRunning"
      class="ml-auto h-2 w-2 shrink-0 animate-pulse rounded-full"
      :class="isActive ? 'bg-[#8b5cf6] neon-glow-purple' : 'bg-[#4c4c6d]'"
    />

    <!-- Badge -->
    <span
      v-else-if="badge && badge > 0 && !collapsed"
      class="ml-auto rounded-full bg-[rgba(139,92,246,0.2)] px-1.5 py-0.5 text-[9px] tabular-nums text-[#a78bfa]"
    >
      {{ badge }}
    </span>

    <!-- Badge dot (collapsed mode) -->
    <span
      v-if="badge && badge > 0 && collapsed"
      class="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-[#8b5cf6] text-[7px] text-white neon-glow-purple"
    >
      {{ badge }}
    </span>
  </NuxtLink>
</template>
```

- [ ] **Step 3: Create AppSidebar.vue**

Create `apps/web/app/components/AppSidebar.vue`:

```vue
<script setup lang="ts">
import {
  onboardingIncomplete,
  requestResetTour,
} from '~/composables/useOnboarding';
import { useSkills } from '~/composables/useSkills';

const props = defineProps<{
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

// ── Font size ──
const FONT_SIZES = [
  { label: '小', value: 14 },
  { label: '中', value: 16 },
  { label: '大', value: 18 },
] as const;

const fontSize = ref(
  import.meta.client
    ? Number(localStorage.getItem('cr-font-size') || 16)
    : 16,
);
watch(fontSize, (v) => {
  if (import.meta.client) localStorage.setItem('cr-font-size', String(v));
});

const showSettings = ref(false);

// Expose mode and fontSize for parent (app.vue) to use
defineExpose({ mode, fontSize });
</script>

<template>
  <aside
    class="flex shrink-0 flex-col border-r transition-[width] duration-200 ease-in-out"
    :class="collapsed ? 'w-[60px]' : 'w-[220px]'"
    style="background: var(--bg-sidebar); border-color: rgba(139, 92, 246, 0.12)"
  >
    <!-- ── Header: Logo + Mode Toggle ── -->
    <div class="flex shrink-0 items-center gap-2 px-3 pt-4 pb-2" :class="collapsed ? 'justify-center' : ''">
      <div
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg neon-glow-logo"
        style="background: linear-gradient(135deg, #8b5cf6, #06b6d4)"
      >
        <span class="text-sm text-white">⚡</span>
      </div>
      <template v-if="!collapsed">
        <span class="text-xs font-semibold text-[#e0e7ff]">ClaudeRunner</span>
        <button
          class="ml-auto rounded-md px-1.5 py-0.5 text-[9px] font-medium transition-colors"
          :class="mode === 'smart'
            ? 'bg-[rgba(139,92,246,0.15)] text-[#a78bfa] border border-[rgba(139,92,246,0.25)]'
            : 'bg-[rgba(100,116,139,0.15)] text-[#64748b] border border-[rgba(100,116,139,0.25)]'"
          @click="mode = mode === 'smart' ? 'normal' : 'smart'"
        >
          {{ mode === 'smart' ? 'Smart' : 'Normal' }}
        </button>
      </template>
    </div>

    <!-- ── Collapse Toggle ── -->
    <div class="flex px-3 pb-2" :class="collapsed ? 'justify-center' : 'justify-end'">
      <button
        class="flex h-5 w-5 items-center justify-center rounded-[5px] text-[10px] text-[#8b5cf6] transition-colors hover:bg-[rgba(139,92,246,0.1)]"
        style="border: 1px solid rgba(139, 92, 246, 0.15)"
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
      style="border-color: rgba(139, 92, 246, 0.1)"
    >
      <!-- Font size (expanded only) -->
      <div v-if="!collapsed" class="flex items-center gap-1.5 text-[10px] text-[#4c4c6d]">
        <UIcon name="i-lucide-type" class="shrink-0" />
        <div class="flex gap-0.5">
          <button
            v-for="s in FONT_SIZES"
            :key="s.value"
            class="rounded px-1.5 py-0.5 transition-colors"
            :class="fontSize === s.value
              ? 'bg-[rgba(139,92,246,0.15)] text-[#a78bfa]'
              : 'hover:text-[#c4b5fd]'"
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
```

- [ ] **Step 4: Verify components compile**

Run: `cd /Users/yeyuan/home/ClaudeRunner && pnpm dev --filter web 2>&1 | head -30`
Expected: No compile errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/SidebarNavGroup.vue apps/web/app/components/SidebarNavItem.vue apps/web/app/components/AppSidebar.vue
git commit -m "feat(ui): add sidebar navigation components"
```

---

## Task 4: Rewire app.vue with Sidebar Layout

**Files:**
- Modify: `apps/web/app/app.vue`

- [ ] **Step 1: Replace app.vue with sidebar layout**

Replace the full content of `apps/web/app/app.vue`:

```vue
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
const sidebarRef = ref<{ mode: Ref<string>; fontSize: Ref<number> }>();

onMounted(() => {
  sidebar.init();
});

const rootFontSize = computed(() => `${sidebarRef.value?.fontSize.value ?? 16}px`);
</script>

<template>
  <UApp>
    <div class="app-shell bg-cyberpunk flex h-screen text-[#e0e7ff]" :style="{ fontSize: rootFontSize }">
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
```

- [ ] **Step 2: Verify the layout renders**

Run: `cd /Users/yeyuan/home/ClaudeRunner && pnpm dev --filter web 2>&1 | head -30`
Expected: Dev server starts. The page should show a sidebar (may be broken content area since pages haven't been updated yet — that's expected).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/app.vue
git commit -m "feat(ui): rewire app.vue with sidebar + cyberpunk layout"
```

---

## Task 5: Create JIRA Runner Standalone Page

**Files:**
- Create: `apps/web/app/pages/jira-runner.vue`
- Modify: `apps/web/app/pages/index.vue`
- Modify: `apps/web/app/pages/claude-runner.vue`

- [ ] **Step 1: Create jira-runner.vue**

This page extracts the JIRA-specific logic from the old `index.vue`. Create `apps/web/app/pages/jira-runner.vue`:

```vue
<script setup lang="ts">
import { useSkills } from '~/composables/useSkills';

useHead({ title: 'Claude Runner — JIRA Runner' });

const { enabledSkillNames, fetchSkills } = useSkills();

// ── Mode (read from localStorage, shared with sidebar) ──
const mode = ref<'normal' | 'smart'>(
  import.meta.client
    ? (localStorage.getItem('cr-mode') as 'normal' | 'smart') || 'smart'
    : 'smart',
);

// ── Cross-feature state ──
const crCreatedPrUrls = ref<string[]>([]);

// ── Child ref ──
type RunnerJob = ReturnType<typeof import('~/composables/useRunnerJob').useRunnerJob>;

const jiraTab = ref<{
  cr: RunnerJob;
  loadHistory: () => Promise<void>;
  loadIssues: () => Promise<void>;
}>();

function onPrCreated(urls: string[]) {
  crCreatedPrUrls.value = urls;
}

// ── Lifecycle ──
onMounted(async () => {
  fetchSkills();
  jiraTab.value?.loadHistory();
  jiraTab.value?.loadIssues();

  const cr = jiraTab.value?.cr;
  if (cr) {
    const crJobId = localStorage.getItem(cr.storageKey);
    if (crJobId) {
      await cr.restoreJob(crJobId);
    }
  }
});

onBeforeUnmount(() => {
  jiraTab.value?.cr.cleanup();
});
</script>

<template>
  <div class="flex flex-1 overflow-hidden">
    <JiraRunnerTab
      ref="jiraTab"
      :mode="mode"
      :enabled-skill-names="enabledSkillNames"
      @pr-created="onPrCreated"
    />
  </div>
</template>
```

- [ ] **Step 2: Convert index.vue to redirect**

Replace the full content of `apps/web/app/pages/index.vue`:

```vue
<script setup lang="ts">
navigateTo('/jira-runner', { replace: true });
</script>

<template>
  <div class="flex flex-1 items-center justify-center text-[#4c4c6d]">
    正在跳轉...
  </div>
</template>
```

- [ ] **Step 3: Update claude-runner.vue redirect**

Replace the full content of `apps/web/app/pages/claude-runner.vue`:

```vue
<script setup lang="ts">
navigateTo('/jira-runner', { replace: true });
</script>

<template>
  <div class="flex flex-1 items-center justify-center text-[#4c4c6d]">
    正在跳轉...
  </div>
</template>
```

- [ ] **Step 4: Verify JIRA Runner page loads**

Open `http://localhost:3000/jira-runner` in the browser.
Expected: Sidebar visible on the left, JIRA Runner tab content on the right.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/pages/jira-runner.vue apps/web/app/pages/index.vue apps/web/app/pages/claude-runner.vue
git commit -m "feat(ui): extract JIRA Runner to standalone page with redirect"
```

---

## Task 6: Create PR Runner Standalone Page

**Files:**
- Modify: `apps/web/app/pages/pr-runner.vue`

- [ ] **Step 1: Convert pr-runner.vue from redirect to standalone page**

Replace the full content of `apps/web/app/pages/pr-runner.vue`:

```vue
<script setup lang="ts">
useHead({ title: 'Claude Runner — PR Runner' });

// ── Cross-feature state (PR URLs created by JIRA runner in another tab) ──
const crCreatedPrUrls = ref<string[]>([]);

// ── Child ref ──
type RunnerJob = ReturnType<typeof import('~/composables/useRunnerJob').useRunnerJob>;
type PrNotifs = ReturnType<typeof import('~/composables/usePrNotifications').usePrNotifications>;

const prTab = ref<{
  loadHistory: () => Promise<void>;
  loadPRs: () => Promise<void>;
  pr: RunnerJob;
  prNotifications: PrNotifs;
  prsWithNotifications: { value: number };
}>();

// ── Lifecycle ──
onMounted(async () => {
  prTab.value?.loadHistory();
  prTab.value?.loadPRs();
  prTab.value?.prNotifications.startPolling();

  const pr = prTab.value?.pr;
  if (pr) {
    const prJobId = localStorage.getItem(pr.storageKey);
    if (prJobId) {
      await pr.restoreJob(prJobId);
    }
  }
});

onBeforeUnmount(() => {
  prTab.value?.pr.cleanup();
  prTab.value?.prNotifications.stopPolling();
});
</script>

<template>
  <div class="flex flex-1 overflow-hidden">
    <PrRunnerTab
      ref="prTab"
      :cr-created-pr-urls="crCreatedPrUrls"
    />
  </div>
</template>
```

- [ ] **Step 2: Verify PR Runner page loads**

Open `http://localhost:3000/pr-runner` in the browser.
Expected: Sidebar with "PR Runner" active, PR Runner content on the right.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/pages/pr-runner.vue
git commit -m "feat(ui): convert PR Runner to standalone page"
```

---

## Task 7: Create PR Review Standalone Page

**Files:**
- Create: `apps/web/app/pages/pr-review.vue`

- [ ] **Step 1: Create pr-review.vue**

Create `apps/web/app/pages/pr-review.vue`:

```vue
<script setup lang="ts">
useHead({ title: 'Claude Runner — PR Review' });

type RunnerJob = ReturnType<typeof import('~/composables/useRunnerJob').useRunnerJob>;

const reviewTab = ref<{
  loadHistory: () => Promise<void>;
  loadPRs: () => Promise<void>;
  loadReviewHistory: () => Promise<void>;
  reviewer: RunnerJob;
}>();

// ── Lifecycle ──
onMounted(async () => {
  reviewTab.value?.loadHistory();
  reviewTab.value?.loadPRs();
  reviewTab.value?.loadReviewHistory();

  const rev = reviewTab.value?.reviewer;
  if (rev) {
    const revJobId = localStorage.getItem(rev.storageKey);
    if (revJobId) {
      await rev.restoreJob(revJobId);
    }
  }
});

onBeforeUnmount(() => {
  reviewTab.value?.reviewer.cleanup();
});
</script>

<template>
  <div class="flex flex-1 overflow-hidden">
    <PrReviewerTab ref="reviewTab" />
  </div>
</template>
```

- [ ] **Step 2: Verify PR Review page loads**

Open `http://localhost:3000/pr-review` in the browser.
Expected: Sidebar with "PR Review" active, PR Review content on the right.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/pages/pr-review.vue
git commit -m "feat(ui): add PR Review standalone page"
```

---

## Task 8: Apply Cyberpunk Theme to Existing Pages

**Files:**
- Modify: `apps/web/app/pages/dashboard.vue`
- Modify: `apps/web/app/pages/repos.vue`
- Modify: `apps/web/app/pages/skills.vue`
- Modify: `apps/web/app/pages/jobs/[id].vue`

These pages currently have their own `bg-gray-950` backgrounds and potentially standalone navigation elements. We need to:
1. Remove any redundant page-level `bg-gray-950` or full-screen wrapper (the background is now provided by `app.vue`)
2. Replace gray color references with cyberpunk equivalents where they appear in the outermost wrapper

- [ ] **Step 1: Update dashboard.vue**

Read `apps/web/app/pages/dashboard.vue` and find the outermost wrapper element. Replace `bg-gray-950` with nothing (remove it — background comes from app.vue). Replace `text-gray-100` with nothing (color comes from app.vue). If there's a `h-screen` class on the wrapper, replace it with `flex-1` since the page is now inside a flex container.

Do the same color treatment: any `border-gray-800` becomes `border-glow`, `bg-gray-900` becomes `bg-cyber-surface`, `text-gray-500` can remain as-is (or optionally switch to `text-cyber-text-muted`). Focus on the wrapper — internal components keep their existing colors for now.

- [ ] **Step 2: Update repos.vue**

Same treatment as dashboard.vue: remove `bg-gray-950 h-screen` from wrapper, ensure it uses `flex-1 overflow-auto` for proper layout within the sidebar shell.

- [ ] **Step 3: Update skills.vue**

Same wrapper treatment: remove `bg-gray-950 h-screen`, add `flex-1 overflow-hidden` for layout.

- [ ] **Step 4: Update jobs/[id].vue**

Same wrapper treatment: remove standalone `bg-gray-950 h-screen`, add `flex-1 overflow-auto`.

- [ ] **Step 5: Verify all pages render correctly**

Navigate to each page in the browser:
- `http://localhost:3000/dashboard`
- `http://localhost:3000/repos`
- `http://localhost:3000/skills`
- `http://localhost:3000/jobs/some-test-id` (if a job exists)

Expected: All pages render inside the sidebar layout, no double backgrounds, no layout overflow issues.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/pages/dashboard.vue apps/web/app/pages/repos.vue apps/web/app/pages/skills.vue apps/web/app/pages/jobs/\[id\].vue
git commit -m "feat(ui): apply cyberpunk theme to dashboard, repos, skills, and job detail pages"
```

---

## Task 9: Remove Landing Layout & Clean Up

**Files:**
- Modify: `apps/web/app/layouts/landing.vue`

- [ ] **Step 1: Verify landing.vue is still needed**

Check if any page uses `definePageMeta({ layout: 'landing' })`. If no page references it, the file can be left as-is (it's the default fallback layout and harmless). If pages reference it, they should be updated to remove the layout meta since the sidebar layout is now in app.vue.

Run this search:
```bash
grep -r "layout.*landing" apps/web/app/pages/
```

Expected: No matches (or if there are, note them for removal).

- [ ] **Step 2: Clean up any remaining references**

If any pages define `layout: 'landing'`, remove those `definePageMeta` calls since the layout is now handled by `app.vue` directly.

- [ ] **Step 3: Commit (if changes were made)**

```bash
git add -A
git commit -m "chore: remove unused landing layout references"
```

---

## Task 10: Visual Polish & Smoke Test

**Files:**
- Possibly minor tweaks to any file from previous tasks

- [ ] **Step 1: Full navigation smoke test**

Open the app at `http://localhost:3000`. Verify:
1. Redirects to `/jira-runner`
2. Sidebar shows with correct groups: Pipeline (JIRA Runner, PR Runner, PR Review), Analytics (Dashboard), Settings (Repos, Skills)
3. Active item has purple left border + gradient background
4. Click each nav item — page changes, active state updates
5. Mode toggle (Smart/Normal) works in sidebar header
6. Font size selector works in sidebar footer

- [ ] **Step 2: Test sidebar collapse/expand**

1. Click the `«` button — sidebar collapses to 60px icon-only mode
2. Icons remain visible, labels hidden
3. Click `»` — sidebar expands back
4. Refresh the page — collapse state persists

- [ ] **Step 3: Test responsive behavior**

1. Resize browser window below 1024px width
2. Clear localStorage key `cr-sidebar-collapsed`
3. Refresh — sidebar should default to collapsed on narrow viewport

- [ ] **Step 4: Fix any visual issues found**

Address any spacing, color, or overflow problems discovered during testing. Common issues:
- Tab components may have hardcoded `h-screen` that conflicts with flex layout
- Border colors may clash with cyberpunk palette
- Scroll containers may need adjustment

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(ui): visual polish and layout fixes for sidebar cyberpunk theme"
```

---

## Task 11: Lint & Type Check

- [ ] **Step 1: Run linter**

Run: `cd /Users/yeyuan/home/ClaudeRunner && pnpm lint --filter web 2>&1`
Expected: No new lint errors. Fix any that appear.

- [ ] **Step 2: Run type check**

Run: `cd /Users/yeyuan/home/ClaudeRunner && pnpm typecheck --filter web 2>&1`
Expected: No new type errors. Fix any that appear.

- [ ] **Step 3: Commit fixes if any**

```bash
git add -A
git commit -m "fix: resolve lint and type errors from UI redesign"
```
