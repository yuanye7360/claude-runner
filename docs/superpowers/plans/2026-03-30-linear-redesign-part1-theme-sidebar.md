# Linear Redesign Part 1: Color System + Slim Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cyberpunk neon theme with Linear-style minimal aesthetics and convert the 220px collapsible sidebar to a fixed 52px icon-only sidebar with badge counts.

**Architecture:** Update CSS variables and Tailwind config to Linear's color palette (pure black base, ultra-thin borders, no glow). Rewrite AppSidebar as a fixed 52px icon rail with tooltip labels and badge counts. Remove SidebarNavGroup and useSidebar (no more expand/collapse). Update app.vue header to Linear style.

**Tech Stack:** Nuxt 4, Vue 3, Nuxt UI v4, Tailwind CSS, TypeScript

---

## File Structure

### New Files

None — this plan modifies existing files only.

### Modified Files

| File | Changes |
|------|---------|
| `app/assets/css/main.css` | Replace cyberpunk CSS variables with Linear palette, remove neon glow utilities |
| `apps/web/tailwind.config.ts` | Rename `cyber.*` to `linear.*` color tokens |
| `app/components/AppSidebar.vue` | Rewrite as 52px icon-only sidebar with badges and tooltips |
| `app/components/SidebarNavItem.vue` | Simplify to icon-only with badge, tooltip, active state |
| `app/app.vue` | Remove sidebar toggle, update header to Linear style, remove useSidebar |

### Deleted Files

| File | Reason |
|------|--------|
| `app/components/SidebarNavGroup.vue` | No more group labels needed in icon-only sidebar |
| `app/composables/useSidebar.ts` | No more expand/collapse functionality |

---

## Task 1: Linear Color System

**Files:**
- Modify: `apps/web/app/assets/css/main.css`
- Modify: `apps/web/tailwind.config.ts`

- [ ] **Step 1: Replace CSS variables in main.css**

Replace the `:root` block and utility classes. Remove all neon glow utilities and the `bg-cyberpunk` gradient. Replace with Linear-style flat colors.

In `apps/web/app/assets/css/main.css`, replace everything between `@import '@nuxt/ui';` and the `/* driver.js dark theme overrides */` comment with:

```css
/* ── Linear Minimal Theme ── */
:root {
  --bg-base: #0a0a0f;
  --bg-sidebar: #0a0a12;
  --bg-surface: rgb(255 255 255 / 2%);
  --bg-surface-hover: rgb(255 255 255 / 4%);
  --border: rgb(255 255 255 / 6%);
  --border-hover: rgb(255 255 255 / 8%);
  --color-primary: #8b5cf6;
  --color-accent: #06b6d4;
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-text: #fafafa;
  --color-text-secondary: #888;
  --color-text-muted: #444;
  --radius-lg: 10px;
  --radius-md: 8px;
  --radius-sm: 6px;
}
```

Also update the driver.js theme colors: change `.cr-tour-popover.driver-popover` background to `#0a0a0f` and border to `rgba(255,255,255,0.08)`.

- [ ] **Step 2: Update Tailwind config**

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
        linear: {
          base: 'var(--bg-base)',
          sidebar: 'var(--bg-sidebar)',
          surface: 'var(--bg-surface)',
          'surface-hover': 'var(--bg-surface-hover)',
          primary: 'var(--color-primary)',
          accent: 'var(--color-accent)',
          success: 'var(--color-success)',
          warning: 'var(--color-warning)',
          text: 'var(--color-text)',
          'text-secondary': 'var(--color-text-secondary)',
          'text-muted': 'var(--color-text-muted)',
        },
      },
      borderColor: {
        DEFAULT: 'var(--border)',
        hover: 'var(--border-hover)',
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

- [ ] **Step 3: Verify the app compiles**

Run: `cd /Users/yeyuan/home/ClaudeRunner && pnpm --filter web build 2>&1 | tail -20`
Expected: Build succeeds (there may be visual breakage since components still reference old classes — that's fine, we'll fix them next).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/assets/css/main.css apps/web/tailwind.config.ts
git commit -m "feat(web): replace cyberpunk theme with Linear minimal color system"
```

---

## Task 2: Slim Sidebar — SidebarNavItem Rewrite

**Files:**
- Modify: `apps/web/app/components/SidebarNavItem.vue`

- [ ] **Step 1: Rewrite SidebarNavItem as icon-only with tooltip and badge**

Replace the full content of `apps/web/app/components/SidebarNavItem.vue`:

```vue
<script setup lang="ts">
const props = defineProps<{
  badge?: number;
  icon: string;
  isRunning?: boolean;
  label: string;
  to: string;
}>();

const route = useRoute();
const isActive = computed(() => route.path === props.to);
</script>

<template>
  <UTooltip :text="label" :popper="{ placement: 'right' }">
    <NuxtLink
      :to="to"
      class="relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150"
      :class="
        isActive
          ? 'bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)]'
          : 'border border-transparent hover:bg-[rgba(255,255,255,0.04)]'
      "
    >
      <UIcon
        :name="icon"
        class="text-[16px]"
        :class="isActive ? 'text-[#fafafa]' : 'text-[#555] group-hover:text-[#888]'"
      />

      <!-- Running pulse -->
      <span
        v-if="isRunning"
        class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#8b5cf6] animate-pulse"
      />

      <!-- Badge -->
      <span
        v-else-if="badge && badge > 0"
        class="absolute -top-1 -right-1 flex h-[14px] min-w-[14px] items-center justify-center rounded-full px-0.5 text-[8px] font-medium text-white tabular-nums"
        :style="{ background: isActive ? '#fafafa' : '#555', color: isActive ? '#0a0a0f' : '#fafafa' }"
      >
        {{ badge > 99 ? '99+' : badge }}
      </span>
    </NuxtLink>
  </UTooltip>
</template>
```

Key changes: removed `collapsed` prop (always icon-only now), removed text label, added UTooltip, simplified active state to flat white-on-black, badge is always visible.

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/components/SidebarNavItem.vue
git commit -m "feat(web): rewrite SidebarNavItem as icon-only with tooltip and badge"
```

---

## Task 3: Slim Sidebar — AppSidebar Rewrite

**Files:**
- Modify: `apps/web/app/components/AppSidebar.vue`
- Delete: `apps/web/app/components/SidebarNavGroup.vue`

- [ ] **Step 1: Rewrite AppSidebar as fixed 52px icon rail**

Replace the full content of `apps/web/app/components/AppSidebar.vue`:

```vue
<script setup lang="ts">
import { useSkills } from '~/composables/useSkills';

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
    class="flex w-[52px] shrink-0 flex-col items-center border-r py-3"
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
      <UTooltip :text="mode === 'smart' ? 'Smart Mode' : 'Normal Mode'" :popper="{ placement: 'right' }">
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

      <SidebarNavItem
        to="/repos"
        icon="i-lucide-settings"
        label="Settings"
      />
    </div>
  </aside>
</template>
```

Key changes: fixed 52px width, no expand/collapse, no props, no emit, no SidebarNavGroup. Mode toggle is a simple icon button. Repos and Skills merged into single "Settings" entry.

- [ ] **Step 2: Delete SidebarNavGroup.vue**

```bash
rm apps/web/app/components/SidebarNavGroup.vue
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/components/AppSidebar.vue
git rm apps/web/app/components/SidebarNavGroup.vue
git commit -m "feat(web): rewrite AppSidebar as 52px icon rail, remove SidebarNavGroup"
```

---

## Task 4: Update app.vue — Linear Header + Remove Sidebar Toggle

**Files:**
- Modify: `apps/web/app/app.vue`
- Delete: `apps/web/app/composables/useSidebar.ts`

- [ ] **Step 1: Rewrite app.vue**

Replace the full content of `apps/web/app/app.vue`:

```vue
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
          class="flex h-12 shrink-0 items-center gap-3 border-b px-5"
          style="border-color: rgb(255 255 255 / 6%)"
        >
          <span class="text-sm font-medium text-[#fafafa]">
            {{ pageTitle }}
          </span>

          <div class="ml-auto flex items-center gap-3">
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

            <div class="h-4 w-px" style="background: rgb(255 255 255 / 6%)"></div>

            <!-- Guide -->
            <UTooltip v-if="onboardingIncomplete" text="點擊開始設定指引">
              <button
                class="relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[#f59e0b] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                @click="requestResetTour = true"
              >
                <span class="relative flex h-2 w-2 shrink-0">
                  <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#f59e0b] opacity-75"></span>
                  <span class="relative inline-flex h-2 w-2 rounded-full bg-[#f59e0b]"></span>
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
  </UApp>
</template>
```

Key changes: removed `useSidebar()`, removed `bg-cyberpunk` class, background is now flat `#0a0a0f`, text is `#fafafa`, header uses Linear border colors, `AppSidebar` has no props (fixed width). Page title for `/` is now `Overview`.

- [ ] **Step 2: Delete useSidebar.ts**

```bash
rm apps/web/app/composables/useSidebar.ts
```

- [ ] **Step 3: Verify the app compiles**

Run: `cd /Users/yeyuan/home/ClaudeRunner && pnpm --filter web build 2>&1 | tail -20`
Expected: Build succeeds. The sidebar should now be a slim 52px icon rail.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/app.vue
git rm apps/web/app/composables/useSidebar.ts
git commit -m "feat(web): update app.vue to Linear style, remove useSidebar"
```

---

## Task 5: Route Adjustment — Dashboard as Homepage

**Files:**
- Modify: `apps/web/app/pages/index.vue`

- [ ] **Step 1: Convert index.vue from redirect to Dashboard homepage**

For now, make `/` show the existing dashboard content instead of redirecting. Replace the full content of `apps/web/app/pages/index.vue`:

```vue
<script setup lang="ts">
import type { HistoryEntry } from '~/composables/useRunnerJob';

useHead({ title: 'Claude Runner — Overview' });

const recentJobs = ref<HistoryEntry[]>([]);
const loading = ref(true);

async function loadRecentJobs() {
  loading.value = true;
  try {
    recentJobs.value = await $fetch<HistoryEntry[]>(
      '/api/claude-runner/jobs?limit=10',
    );
  } catch {
    recentJobs.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(loadRecentJobs);

function fmtTimeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const statusColor: Record<string, string> = {
  done: '#22c55e',
  error: '#f59e0b',
  cancelled: '#444',
  running: '#8b5cf6',
};
</script>

<template>
  <div class="flex flex-1 flex-col overflow-auto p-6">
    <!-- Status cards -->
    <div class="mb-6 grid grid-cols-3 gap-3">
      <NuxtLink
        to="/jira-runner"
        class="group rounded-[10px] border p-4 transition-colors duration-150"
        style="background: rgba(139,92,246,0.04); border-color: rgba(139,92,246,0.1)"
      >
        <div class="mb-2 flex items-center justify-between">
          <span class="text-[10px] font-medium uppercase tracking-wider text-[#888]">JIRA Issues</span>
          <span class="text-[9px] text-[#8b5cf6] opacity-0 transition-opacity group-hover:opacity-100">→</span>
        </div>
        <div class="text-2xl font-bold tracking-tight text-[#fafafa] tabular-nums">—</div>
        <div class="mt-1 text-[10px] text-[#444]">Open the page to view</div>
      </NuxtLink>

      <NuxtLink
        to="/pr-runner"
        class="group rounded-[10px] border p-4 transition-colors duration-150"
        style="background: rgba(6,182,212,0.04); border-color: rgba(6,182,212,0.1)"
      >
        <div class="mb-2 flex items-center justify-between">
          <span class="text-[10px] font-medium uppercase tracking-wider text-[#888]">PR Runner</span>
          <span class="text-[9px] text-[#06b6d4] opacity-0 transition-opacity group-hover:opacity-100">→</span>
        </div>
        <div class="text-2xl font-bold tracking-tight text-[#fafafa] tabular-nums">—</div>
        <div class="mt-1 text-[10px] text-[#444]">Open the page to view</div>
      </NuxtLink>

      <NuxtLink
        to="/pr-review"
        class="group rounded-[10px] border p-4 transition-colors duration-150"
        style="background: rgba(34,197,94,0.04); border-color: rgba(34,197,94,0.1)"
      >
        <div class="mb-2 flex items-center justify-between">
          <span class="text-[10px] font-medium uppercase tracking-wider text-[#888]">Code Review</span>
          <span class="text-[9px] text-[#22c55e] opacity-0 transition-opacity group-hover:opacity-100">→</span>
        </div>
        <div class="text-2xl font-bold tracking-tight text-[#fafafa] tabular-nums">—</div>
        <div class="mt-1 text-[10px] text-[#444]">Open the page to view</div>
      </NuxtLink>
    </div>

    <!-- Recent Activity -->
    <div>
      <h2 class="mb-3 text-[10px] font-medium uppercase tracking-wider text-[#888]">Recent Activity</h2>

      <div v-if="loading" class="py-8 text-center text-[#444] text-xs">Loading...</div>

      <div v-else-if="recentJobs.length === 0" class="py-8 text-center text-[#444] text-xs">No recent activity</div>

      <div v-else class="flex flex-col gap-1">
        <NuxtLink
          v-for="job in recentJobs"
          :key="job.id"
          :to="`/jobs/${job.id}`"
          class="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-[rgba(255,255,255,0.02)]"
        >
          <span
            class="h-1.5 w-1.5 shrink-0 rounded-full"
            :class="{ 'animate-pulse': job.status === 'running' }"
            :style="{ background: statusColor[job.status] || '#444' }"
          />
          <span class="flex-1 truncate text-xs text-[#ccc]">
            {{ job.issues.map(i => i.key).join(', ') || job.id.slice(0, 8) }}
          </span>
          <span
            class="shrink-0 rounded px-1.5 py-0.5 text-[9px]"
            :style="{
              background: `${statusColor[job.status] || '#444'}15`,
              color: statusColor[job.status] || '#444',
            }"
          >
            {{ job.status }}
          </span>
          <span class="shrink-0 text-[10px] text-[#444] tabular-nums">
            {{ fmtTimeAgo(job.timestamp) }}
          </span>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
```

Note: The status cards show `—` for now because we don't have the count APIs wired up yet. That will come in Part 2 (Dashboard enhancement). The Recent Activity section is fully functional using the existing jobs API.

- [ ] **Step 2: Verify the homepage loads**

Open `http://localhost:3000/` in the browser.
Expected: Shows Overview page with 3 status cards and recent activity list. No redirect.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/pages/index.vue
git commit -m "feat(web): convert homepage to Dashboard overview with status cards"
```

---

## Task 6: Update Existing Pages for Linear Theme

**Files:**
- Modify: `apps/web/app/pages/dashboard.vue`
- Modify: `apps/web/app/pages/jobs/[id].vue`

- [ ] **Step 1: Update dashboard.vue nav bar**

In `apps/web/app/pages/dashboard.vue`, the page currently has its own wrapper. It should already be `flex-1 flex-col overflow-auto` from the previous redesign. If the page has any remaining `bg-gray-950`, `text-gray-100`, or `border-gray-800` classes on the outermost wrapper, replace them:
- `bg-gray-950` → remove (background from app.vue)
- `text-gray-100` → remove (color from app.vue)
- `border-gray-800` → `border-[rgba(255,255,255,0.06)]`

- [ ] **Step 2: Update jobs/[id].vue**

In `apps/web/app/pages/jobs/[id].vue`:
- Remove the entire nav bar section (lines 100-124 approx — the `<div class="flex h-14 shrink-0 items-center gap-3 border-b border-gray-800 px-5">` block with NuxtLinks). Navigation is handled by the sidebar now.
- Replace `border-gray-800` → `border-[rgba(255,255,255,0.06)]` throughout
- Replace `bg-gray-900/60` → `bg-[rgba(255,255,255,0.02)]` throughout
- Replace `text-gray-400` → `text-[#888]`, `text-gray-500` → `text-[#888]`, `text-gray-600` → `text-[#444]` throughout
- Replace `text-white` → `text-[#fafafa]`
- Replace `text-blue-400` → `text-[#8b5cf6]` for links
- Replace `hover:bg-gray-800/40` → `hover:bg-[rgba(255,255,255,0.04)]`
- The `font-family: 'JetBrains Mono'` style on the wrapper can stay — that's fine for the job detail page.

- [ ] **Step 3: Verify pages render**

Navigate to `/dashboard` and `/jobs/<any-id>`.
Expected: Pages render with Linear-style colors. No old gray borders or backgrounds.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/pages/dashboard.vue "apps/web/app/pages/jobs/[id].vue"
git commit -m "feat(web): apply Linear theme to dashboard and job detail pages"
```

---

## Task 7: Lint & Build Verification

- [ ] **Step 1: Run build**

```bash
cd /Users/yeyuan/home/ClaudeRunner && pnpm --filter web build 2>&1 | tail -30
```
Expected: Build succeeds with no errors.

- [ ] **Step 2: Fix any lint or type errors**

If there are errors, fix them. Common issues:
- References to deleted `SidebarNavGroup` component
- References to deleted `useSidebar` composable
- References to removed CSS classes like `bg-cyberpunk`, `neon-glow-*`, `neon-text-*`
- The `collapsed` prop no longer exists on `SidebarNavItem` — remove any remaining references

- [ ] **Step 3: Commit fixes if any**

```bash
git add -A
git commit -m "fix(web): resolve lint and build errors from Linear redesign"
```
