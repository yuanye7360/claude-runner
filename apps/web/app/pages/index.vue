<script setup lang="ts">
import type { HistoryEntry } from '~/composables/useRunnerJob';
import type { PrsByRepo } from '~~/server/api/pr-runner/prs.get';

import { useRepoConfigs } from '~/composables/useRepoConfigs';
import { useRunnerJob } from '~/composables/useRunnerJob';

useHead({ title: 'Claude Runner — Pipeline' });

// ── Font size ───────────────────────────────────────────
const FONT_SIZES = [
  { label: '小', value: 14 },
  { label: '中', value: 16 },
  { label: '大', value: 18 },
] as const;

const fontSize = ref(
  typeof localStorage === 'undefined'
    ? 16
    : Number(localStorage.getItem('cr-font-size') || 16),
);
watch(fontSize, (v) => localStorage.setItem('cr-font-size', String(v)));
const rootFontSize = computed(() => `${fontSize.value}px`);

// ── Repo configs ────────────────────────────────────────
const {
  repoConfigs,
  editingConfig,
  newConfig,
  startEditConfig,
  saveConfig: _saveConfig,
  cancelEdit,
  deleteConfig: _deleteConfig,
} = useRepoConfigs();

const selectedRepoId = ref<string>(
  typeof localStorage === 'undefined'
    ? ''
    : (localStorage.getItem('cr-selected-repo') ?? ''),
);
watch(selectedRepoId, (v) => localStorage.setItem('cr-selected-repo', v));

const selectedRepo = computed(
  () => repoConfigs.value.find((c) => c.id === selectedRepoId.value) ?? null,
);
const showSettings = ref(false);

function saveConfig() {
  const isNew = !editingConfig.value?.id;
  const entry = _saveConfig();
  if (entry && isNew) selectedRepoId.value = entry.id;
}
function deleteRepoConfig(id: string) {
  _deleteConfig(id);
  if (selectedRepoId.value === id) selectedRepoId.value = '';
}

// ── Mode ────────────────────────────────────────────────
const mode = ref<'normal' | 'smart'>(
  typeof localStorage === 'undefined'
    ? 'smart'
    : (localStorage.getItem('cr-mode') as 'normal' | 'smart') || 'smart',
);
watch(mode, (v) => localStorage.setItem('cr-mode', v));

// ── Jira URL ────────────────────────────────────────────
const jiraBaseUrl = ref(
  typeof localStorage === 'undefined'
    ? ''
    : localStorage.getItem('cr-jira-url') || '',
);
watch(jiraBaseUrl, (v) => localStorage.setItem('cr-jira-url', v.trim()));

function jiraUrl(key: string) {
  const base = jiraBaseUrl.value.replace(/\/$/, '');
  return base ? `${base}/browse/${key}` : null;
}

// ════════════════════════════════════════════════════════
// TOP-LEVEL TAB: which feature is active
// ════════════════════════════════════════════════════════
const activeFeature = ref<'jira' | 'pr'>(
  typeof localStorage === 'undefined'
    ? 'jira'
    : (localStorage.getItem('cr-active-feature') as 'jira' | 'pr') || 'jira',
);
watch(activeFeature, (v) => localStorage.setItem('cr-active-feature', v));

// Per-feature right panel tab
const jiraRightTab = ref<'history' | 'progress'>('progress');
const prRightTab = ref<'history' | 'progress'>('progress');

// ════════════════════════════════════════════════════════
// JIRA RUNNER (Stage 1)
// ════════════════════════════════════════════════════════

interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  description?: string;
}

const crHistory = ref<HistoryEntry[]>([]);
const crRowExpanded = ref(false);

// PRs created by last Claude Runner run (for auto-chain)
const crCreatedPrUrls = ref<string[]>([]);

const cr = useRunnerJob({
  storageKey: 'cr-active-jobId',
  apiBase: '/api/claude-runner',
  onComplete: (_jobId, job) => {
    loadCrHistory();
    // Extract PR URLs from results for auto-chain
    const prUrls = job.results
      .map((r) => r.prUrl)
      .filter((u): u is string => !!u);
    if (prUrls.length > 0) {
      crCreatedPrUrls.value = prUrls;
      // Auto-refresh PR list to show newly created PRs
      loadPRs();
    }
  },
});

async function loadCrHistory() {
  try {
    crHistory.value = await $fetch<HistoryEntry[]>(
      '/api/claude-runner/jobs?type=claude-runner',
    );
  } catch (error) {
    console.error('Failed to load CR history:', error);
  }
}

async function clearCrHistory() {
  await $fetch('/api/claude-runner/jobs?type=claude-runner', {
    method: 'DELETE',
  });
  crHistory.value = [];
}

// ── Jira Issues ──
const issues = ref<JiraIssue[]>([]);
const crSelected = ref<Set<string>>(new Set());
const crLoading = ref(true);
const crLoadError = ref('');

const crSelectedCount = computed(() => crSelected.value.size);
const crAllChecked = computed(
  () =>
    issues.value.length > 0 && crSelected.value.size === issues.value.length,
);
const crIndeterminate = computed(
  () =>
    crSelected.value.size > 0 && crSelected.value.size < issues.value.length,
);

async function loadIssues() {
  crLoading.value = true;
  crLoadError.value = '';
  try {
    const data = await $fetch<JiraIssue[]>('/api/claude-runner/issues');
    issues.value = Array.isArray(data) ? data : [];
  } catch (error) {
    crLoadError.value = (error as Error).message;
  } finally {
    crLoading.value = false;
  }
}

function toggleIssue(key: string) {
  if (cr.isRunning.value) return;
  const next = new Set(crSelected.value);
  next.has(key) ? next.delete(key) : next.add(key);
  crSelected.value = next;
}

function toggleAllIssues() {
  if (cr.isRunning.value) return;
  crSelected.value =
    crSelected.value.size === issues.value.length
      ? new Set()
      : new Set(issues.value.map((i) => i.key));
}

async function runClaude() {
  const picked = issues.value.filter((i) => crSelected.value.has(i.key));
  if (picked.length === 0 || cr.isRunning.value) return;
  jiraRightTab.value = 'progress';
  try {
    const { jobId } = await $fetch<{ jobId: string }>(
      '/api/claude-runner/run',
      {
        method: 'POST',
        body: {
          issues: picked,
          repoConfig: selectedRepo.value
            ? { cwd: selectedRepo.value.cwd }
            : undefined,
          mode: mode.value,
        },
      },
    );
    crRowExpanded.value = true;
    cr.startJob(
      jobId,
      picked.map((i) => ({ key: i.key, summary: i.summary })),
    );
  } catch (error) {
    console.error('Failed to start Claude Runner:', error);
  }
}

const statusColor: Record<string, 'info' | 'neutral' | 'success'> = {
  'To Do': 'neutral',
  'In Progress': 'info',
  Done: 'success',
};

// ════════════════════════════════════════════════════════
// PR RUNNER (Stage 2)
// ════════════════════════════════════════════════════════

const prHistory = ref<HistoryEntry[]>([]);
const prRowExpanded = ref(false);

const pr = useRunnerJob({
  storageKey: 'pr-active-jobId',
  apiBase: '/api/claude-runner',
  phases: [
    { label: '拉取分支 & 分析 Review' },
    { label: '實作修復' },
    { label: 'Push commits' },
  ],
  onComplete: () => {
    loadPrHistory();
  },
});

async function loadPrHistory() {
  try {
    prHistory.value = await $fetch<HistoryEntry[]>(
      '/api/claude-runner/jobs?type=pr-runner',
    );
  } catch (error) {
    console.error('Failed to load PR history:', error);
  }
}

async function clearPrHistory() {
  await $fetch('/api/claude-runner/jobs?type=pr-runner', { method: 'DELETE' });
  prHistory.value = [];
}

// ── PR Data ──
const repoGroups = ref<PrsByRepo[]>([]);
const prSelected = ref<Set<string>>(new Set());
const prLoading = ref(true);
const prLoadError = ref('');

const filteredGroups = computed(() => {
  if (!selectedRepo.value?.githubRepo) return repoGroups.value;
  return repoGroups.value.filter(
    (g) => g.repo === selectedRepo.value?.githubRepo,
  );
});

function prKey(repo: string, number: number) {
  return `${repo}#${number}`;
}

function togglePR(repo: string, number: number) {
  if (pr.isRunning.value) return;
  const key = prKey(repo, number);
  const next = new Set(prSelected.value);
  next.has(key) ? next.delete(key) : next.add(key);
  prSelected.value = next;
}

const prSelectedCount = computed(() => prSelected.value.size);

async function loadPRs() {
  prLoading.value = true;
  prLoadError.value = '';
  try {
    const data = await $fetch<PrsByRepo[]>('/api/pr-runner/prs');
    repoGroups.value = Array.isArray(data) ? data : [];
  } catch (error) {
    prLoadError.value = (error as Error).message;
  } finally {
    prLoading.value = false;
  }
}

// Check if a PR was created by the last Claude Runner run
function isFromClaudeRunner(htmlUrl: string): boolean {
  return crCreatedPrUrls.value.includes(htmlUrl);
}

function getSelectedPRItems() {
  return filteredGroups.value.flatMap((g) =>
    g.prs
      .filter((p_) => prSelected.value.has(prKey(g.repo, p_.number)))
      .map((p_) => ({
        number: p_.number,
        title: p_.title,
        repo: g.repo,
        branch: p_.head.ref,
        html_url: p_.html_url,
      })),
  );
}

async function runPR() {
  const prs = getSelectedPRItems();
  if (prs.length === 0 || pr.isRunning.value) return;
  prRightTab.value = 'progress';
  try {
    const { jobId } = await $fetch<{ jobId: string }>('/api/pr-runner/run', {
      method: 'POST',
      body: {
        prs,
        repoConfig: selectedRepo.value
          ? { cwd: selectedRepo.value.cwd }
          : undefined,
      },
    });
    prRowExpanded.value = true;
    pr.startJob(
      jobId,
      prs.map((p_) => ({
        key: `#${p_.number}`,
        summary: `${p_.repo} — ${p_.title}`,
      })),
    );
  } catch (error) {
    console.error('Failed to start PR Runner:', error);
  }
}

function getPrUrl(key: string): null | string {
  const num = Number(key.replace('#', ''));
  for (const group of filteredGroups.value) {
    const p_ = group.prs.find((p) => p.number === num);
    if (p_) return p_.html_url;
  }
  return null;
}

// ── Lifecycle ──
onMounted(async () => {
  loadCrHistory();
  loadPrHistory();
  loadIssues();
  loadPRs();
  // Restore Claude Runner job
  const crJobId = localStorage.getItem(cr.storageKey);
  if (crJobId) {
    await cr.restoreJob(crJobId);
    if (cr.activeJob.value) {
      activeFeature.value = 'jira';
      crRowExpanded.value = true;
    }
  }
  // Restore PR Runner job
  const prJobId = localStorage.getItem(pr.storageKey);
  if (prJobId) {
    await pr.restoreJob(prJobId);
    if (pr.activeJob.value) {
      activeFeature.value = 'pr';
      prRowExpanded.value = true;
    }
  }
});

onBeforeUnmount(() => {
  cr.cleanup();
  pr.cleanup();
});
</script>

<template>
  <div class="runner flex h-screen flex-col bg-gray-950 text-gray-100">
    <!-- ══════ Top nav ══════ -->
    <div
      class="flex h-12 shrink-0 items-center gap-3 border-b border-gray-800 px-4"
    >
      <div class="flex items-center gap-2">
        <span class="text-primary-400 text-lg">⚡</span>
        <span class="font-semibold text-white">Claude Runner</span>
      </div>

      <!-- ── Feature Tabs ── -->
      <div class="ml-4 flex items-center">
        <button
          class="relative flex items-center gap-2 px-4 py-3 text-sm transition-colors"
          :class="
            activeFeature === 'jira'
              ? 'font-semibold text-white'
              : 'text-gray-500 hover:text-gray-300'
          "
          @click="activeFeature = 'jira'"
        >
          <UIcon name="i-lucide-bug" style="font-size: 1em" />
          修復 JIRA Issue
          <!-- Running indicator -->
          <span
            v-if="cr.isRunning.value"
            class="ml-0.5 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400"
          ></span>
          <!-- Active underline -->
          <span
            v-if="activeFeature === 'jira'"
            class="absolute right-2 bottom-0 left-2 h-0.5 rounded-full bg-blue-500"
          ></span>
        </button>

        <button
          class="relative flex items-center gap-2 px-4 py-3 text-sm transition-colors"
          :class="
            activeFeature === 'pr'
              ? 'font-semibold text-white'
              : 'text-gray-500 hover:text-gray-300'
          "
          @click="activeFeature = 'pr'"
        >
          <UIcon name="i-lucide-git-pull-request" style="font-size: 1em" />
          修復 PR Review
          <!-- Running indicator -->
          <span
            v-if="pr.isRunning.value"
            class="ml-0.5 inline-block h-2 w-2 animate-pulse rounded-full bg-green-400"
          ></span>
          <!-- Active underline -->
          <span
            v-if="activeFeature === 'pr'"
            class="absolute right-2 bottom-0 left-2 h-0.5 rounded-full bg-green-500"
          ></span>
        </button>
      </div>

      <!-- ── Right side controls ── -->
      <div class="ml-auto flex items-center gap-2">
        <!-- Repo selector (compact) -->
        <div
          class="flex items-center gap-1.5 rounded-lg bg-gray-800/60 px-2.5 py-1.5"
        >
          <UIcon
            name="i-lucide-folder-git-2"
            class="shrink-0 text-gray-600"
            style="font-size: 0.85em"
          />
          <select
            v-model="selectedRepoId"
            class="cursor-pointer bg-transparent text-xs text-gray-400 outline-none"
            style="max-width: 10rem"
          >
            <option value="">env 預設</option>
            <option v-for="c in repoConfigs" :key="c.id" :value="c.id">
              {{ c.name }}
            </option>
          </select>
        </div>

        <!-- Settings button -->
        <button
          class="flex items-center rounded-lg px-2 py-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
          :class="{ 'text-primary-400': showSettings }"
          @click="showSettings = !showSettings"
        >
          <UIcon name="i-lucide-settings-2" style="font-size: 1em" />
        </button>
      </div>
    </div>

    <!-- ══════ Settings panel (collapsible) ══════ -->
    <div
      v-if="showSettings"
      class="shrink-0 border-b border-gray-800 bg-gray-900/80 px-5 py-4"
    >
      <div class="mx-auto max-w-3xl">
        <div class="mb-4 flex items-center justify-between">
          <span class="font-medium text-gray-300">設定</span>
          <button
            class="text-gray-500 hover:text-gray-300"
            @click="showSettings = false"
          >
            <UIcon name="i-lucide-x" />
          </button>
        </div>

        <div class="grid grid-cols-2 gap-6">
          <!-- Left column: General settings -->
          <div class="space-y-3">
            <div
              class="text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              一般設定
            </div>

            <!-- Jira URL -->
            <div class="flex items-center gap-2">
              <span class="w-20 shrink-0 text-xs text-gray-500">Jira URL</span>
              <div
                class="flex flex-1 items-center gap-1.5 rounded-lg bg-gray-800/60 px-2.5 py-1.5"
              >
                <UIcon
                  name="i-lucide-link"
                  class="shrink-0 text-gray-600"
                  style="font-size: 0.85em"
                />
                <input
                  v-model="jiraBaseUrl"
                  class="w-full bg-transparent text-xs text-gray-400 placeholder-gray-700 outline-none"
                  placeholder="https://xxx.atlassian.net"
                  spellcheck="false"
                />
              </div>
            </div>

            <!-- Mode -->
            <div class="flex items-center gap-2">
              <span class="w-20 shrink-0 text-xs text-gray-500">模式</span>
              <div
                class="flex items-center gap-1 rounded-lg bg-gray-800/60 p-0.5"
              >
                <button
                  class="rounded-md px-2.5 py-1 text-xs transition-colors"
                  :class="
                    mode === 'normal'
                      ? 'bg-gray-700 font-medium text-white'
                      : 'text-gray-500 hover:text-gray-300'
                  "
                  @click="mode = 'normal'"
                >
                  普通
                </button>
                <button
                  class="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors"
                  :class="
                    mode === 'smart'
                      ? 'bg-primary-600 font-medium text-white'
                      : 'text-gray-500 hover:text-gray-300'
                  "
                  @click="mode = 'smart'"
                >
                  <UIcon name="i-lucide-sparkles" style="font-size: 0.85em" />
                  智能
                </button>
              </div>
            </div>

            <!-- Font size -->
            <div class="flex items-center gap-2">
              <span class="w-20 shrink-0 text-xs text-gray-500">字體大小</span>
              <div
                class="flex items-center gap-1 rounded-lg bg-gray-800/60 p-0.5"
              >
                <button
                  v-for="s in FONT_SIZES"
                  :key="s.value"
                  class="rounded-md px-2.5 py-1 text-xs transition-colors"
                  :class="
                    fontSize === s.value
                      ? 'bg-gray-700 font-medium text-white'
                      : 'text-gray-500 hover:text-gray-300'
                  "
                  @click="fontSize = s.value"
                >
                  {{ s.label }}
                </button>
              </div>
            </div>
          </div>

          <!-- Right column: Repo management -->
          <div class="space-y-3">
            <div
              class="text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              Repo 管理
            </div>

            <div v-if="repoConfigs.length > 0" class="space-y-1">
              <div
                v-for="c in repoConfigs"
                :key="c.id"
                class="flex items-center gap-2 rounded-lg px-3 py-2"
                :class="
                  selectedRepoId === c.id
                    ? 'ring-primary-500/30 bg-gray-800 ring-1'
                    : 'bg-gray-800/40'
                "
              >
                <button class="flex-1 text-left" @click="selectedRepoId = c.id">
                  <span class="text-sm font-medium text-gray-200">{{
                    c.name
                  }}</span>
                  <span
                    v-if="c.githubRepo"
                    class="ml-2 font-mono text-xs text-gray-500"
                    >{{ c.githubRepo }}</span
                  >
                  <span class="ml-2 font-mono text-xs text-gray-600">{{
                    c.cwd
                  }}</span>
                </button>
                <button
                  class="px-1 text-gray-500 hover:text-gray-300"
                  @click="startEditConfig(c)"
                >
                  <UIcon name="i-lucide-pencil" />
                </button>
                <button
                  class="px-1 text-gray-500 hover:text-red-400"
                  @click="deleteRepoConfig(c.id)"
                >
                  <UIcon name="i-lucide-trash-2" />
                </button>
              </div>
            </div>
            <p v-else-if="!editingConfig" class="text-xs text-gray-600">
              尚無設定，點「新增」加入 Repo。
            </p>

            <div
              v-if="editingConfig"
              class="rounded-lg border border-gray-700 bg-gray-800 p-3"
            >
              <div class="mb-2 text-sm font-medium text-gray-300">
                {{ editingConfig.id ? '編輯 Repo' : '新增 Repo' }}
              </div>
              <div class="grid gap-2">
                <div class="flex items-center gap-2">
                  <span class="w-24 shrink-0 text-xs text-gray-500">名稱</span>
                  <input
                    v-model="editingConfig.name"
                    placeholder="kkday-mobile"
                    class="focus:ring-primary-500 flex-1 rounded bg-gray-900 px-2 py-1 text-sm text-gray-100 outline-none focus:ring-1"
                  />
                </div>
                <div class="flex items-center gap-2">
                  <span class="w-24 shrink-0 text-xs text-gray-500"
                    >GitHub Repo</span
                  >
                  <input
                    v-model="editingConfig.githubRepo"
                    placeholder="kkday-it/kkday-mobile-member-ci"
                    class="focus:ring-primary-500 flex-1 rounded bg-gray-900 px-2 py-1 font-mono text-sm text-gray-100 outline-none focus:ring-1"
                  />
                </div>
                <div class="flex items-center gap-2">
                  <span class="w-24 shrink-0 text-xs text-gray-500"
                    >本地路徑</span
                  >
                  <input
                    v-model="editingConfig.cwd"
                    placeholder="/Users/you/project"
                    class="focus:ring-primary-500 flex-1 rounded bg-gray-900 px-2 py-1 font-mono text-sm text-gray-100 outline-none focus:ring-1"
                  />
                </div>
              </div>
              <div class="mt-3 flex gap-2">
                <UButton size="xs" @click="saveConfig">儲存</UButton>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  @click="cancelEdit"
                  >取消</UButton
                >
              </div>
            </div>

            <button
              v-if="!editingConfig"
              class="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
              @click="newConfig"
            >
              <UIcon name="i-lucide-plus" />
              新增
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════ Body: left list + right detail ══════ -->
    <div class="flex flex-1 overflow-hidden">
      <!-- ══════════════════════════════════════════════ -->
      <!-- JIRA Feature Panel                            -->
      <!-- ══════════════════════════════════════════════ -->
      <template v-if="activeFeature === 'jira'">
        <!-- Left: Issue list (full height) -->
        <div
          class="flex w-80 shrink-0 flex-col overflow-hidden border-r border-gray-800"
        >
          <!-- Header -->
          <div
            class="flex h-11 shrink-0 items-center gap-2 border-b border-gray-800 px-4"
          >
            <span class="text-sm font-medium text-gray-300">JIRA Issues</span>
            <span
              v-if="!crLoading && issues.length > 0"
              class="text-xs text-gray-600"
            >
              {{ issues.length }} 個
            </span>
            <div class="ml-auto flex items-center gap-1">
              <button
                class="flex items-center rounded px-1.5 py-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
                :class="{ 'pointer-events-none opacity-50': crLoading }"
                @click="loadIssues"
              >
                <UIcon
                  name="i-lucide-refresh-cw"
                  :class="{ 'animate-spin': crLoading }"
                  style="font-size: 0.85em"
                />
              </button>
            </div>
          </div>

          <!-- Select all -->
          <div
            class="flex items-center gap-3 border-b border-gray-800/60 px-4 py-1.5"
          >
            <label
              class="flex cursor-pointer items-center gap-2 select-none"
              :class="{
                'pointer-events-none opacity-40':
                  cr.isRunning.value || crLoading,
              }"
            >
              <UCheckbox
                :model-value="crAllChecked"
                :indeterminate="crIndeterminate"
                @change="toggleAllIssues"
              />
              <span class="text-xs text-gray-500">全選</span>
            </label>
            <span
              v-if="crSelectedCount"
              class="text-primary-400 ml-auto text-xs font-medium"
            >
              已選 {{ crSelectedCount }}
            </span>
          </div>

          <!-- Issue list (full remaining height) -->
          <div class="flex-1 overflow-y-auto">
            <div v-if="crLoading" class="space-y-1.5 p-2">
              <div
                v-for="n in 5"
                :key="n"
                class="h-12 animate-pulse rounded-lg bg-gray-800/50"
              ></div>
            </div>

            <div v-else-if="crLoadError" class="p-4 text-center">
              <UIcon
                name="i-lucide-wifi-off"
                class="mb-2 text-xl text-red-500"
              />
              <p class="mb-2 text-xs text-gray-500">{{ crLoadError }}</p>
              <UButton size="xs" @click="loadIssues">重試</UButton>
            </div>

            <div
              v-else-if="issues.length === 0"
              class="p-6 text-center text-gray-600"
            >
              <UIcon name="i-lucide-inbox" class="mb-2 text-2xl" />
              <p class="text-xs">沒有待處理的 Issue</p>
            </div>

            <div v-else class="space-y-0.5 p-1.5">
              <button
                v-for="issue in issues"
                :key="issue.key"
                class="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-100"
                :class="[
                  cr.isRunning.value
                    ? 'cursor-default opacity-70'
                    : 'cursor-pointer hover:bg-gray-800/60',
                  crSelected.has(issue.key)
                    ? 'ring-primary-500/30 bg-gray-800/80 ring-1'
                    : '',
                ]"
                @click="toggleIssue(issue.key)"
              >
                <UCheckbox
                  :model-value="crSelected.has(issue.key)"
                  class="pointer-events-none mt-0.5 shrink-0"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <component
                      :is="jiraUrl(issue.key) ? 'a' : 'span'"
                      :href="jiraUrl(issue.key) ?? undefined"
                      target="_blank"
                      rel="noopener"
                      class="text-primary-400 shrink-0 font-mono text-sm font-semibold"
                      :class="{
                        'underline-offset-2 hover:underline': jiraUrl(
                          issue.key,
                        ),
                      }"
                      @click.stop
                      >{{ issue.key }}</component
                    >
                    <UBadge
                      :color="statusColor[issue.status] ?? 'neutral'"
                      variant="soft"
                      size="xs"
                    >
                      {{ issue.status }}
                    </UBadge>
                  </div>
                  <p class="mt-0.5 truncate text-xs leading-snug text-gray-500">
                    {{ issue.summary }}
                  </p>
                </div>
              </button>
            </div>
          </div>

          <!-- Run button (pinned to bottom) -->
          <div class="shrink-0 border-t border-gray-800 px-3 py-2">
            <UButton
              class="w-full justify-center"
              size="sm"
              :disabled="!crSelectedCount || cr.isRunning.value"
              :loading="cr.isRunning.value"
              icon="i-lucide-zap"
              @click="runClaude"
            >
              {{
                cr.isRunning.value
                  ? '修復中...'
                  : `開始修復${crSelectedCount ? ` (${crSelectedCount})` : ''}`
              }}
            </UButton>
          </div>
        </div>

        <!-- Right: JIRA detail panel -->
        <div class="flex flex-1 flex-col overflow-hidden">
          <!-- Tab bar -->
          <div class="flex shrink-0 items-center border-b border-gray-800 px-1">
            <button
              class="-mb-px flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm transition-colors"
              :class="
                jiraRightTab === 'progress'
                  ? 'border-primary-500 font-medium text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              "
              @click="jiraRightTab = 'progress'"
            >
              <UIcon
                v-if="cr.isRunning.value"
                name="i-lucide-loader-circle"
                class="text-primary-400 animate-spin"
                style="font-size: 0.8em"
              />
              執行過程
            </button>
            <button
              class="-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors"
              :class="
                jiraRightTab === 'history'
                  ? 'border-primary-500 font-medium text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              "
              @click="jiraRightTab = 'history'"
            >
              執行紀錄
              <span
                v-if="crHistory.length > 0"
                class="rounded-full bg-gray-700 px-1.5 py-0.5 text-xs leading-none text-gray-400"
              >
                {{ crHistory.length }}
              </span>
            </button>
          </div>

          <!-- Status row -->
          <RunnerStatusRow
            v-if="cr.activeJob.value"
            :active-job="cr.activeJob.value"
            :is-running="cr.isRunning.value"
            :success-count="cr.successCount.value"
            :error-count="cr.errorCount.value"
            :elapsed="cr.elapsed.value"
            :expanded="crRowExpanded"
            :get-item-url="jiraUrl"
            @update:expanded="crRowExpanded = $event"
            @cancel="cr.cancelJob"
          />

          <!-- Progress -->
          <template v-if="jiraRightTab === 'progress'">
            <RunnerJobProgress
              v-if="cr.activeJob.value"
              :active-job="cr.activeJob.value"
              class="flex-1 overflow-hidden"
            />
            <div
              v-else
              class="flex flex-1 flex-col items-center justify-center gap-3 text-gray-700 select-none"
            >
              <UIcon name="i-lucide-bug" class="text-5xl" />
              <div class="text-center">
                <p class="font-medium text-gray-600">
                  從左側選擇 JIRA Issue，開始自動修復
                </p>
                <p class="mt-1 text-xs text-gray-600">
                  Claude 會自動分析 Issue、修復程式碼並建立 PR
                </p>
              </div>
            </div>
          </template>

          <!-- History -->
          <template v-else-if="jiraRightTab === 'history'">
            <RunnerJobHistory
              :history="crHistory"
              :get-item-url="jiraUrl"
              @clear="clearCrHistory"
            />
          </template>
        </div>
      </template>

      <!-- ══════════════════════════════════════════════ -->
      <!-- PR Feature Panel                              -->
      <!-- ══════════════════════════════════════════════ -->
      <template v-else-if="activeFeature === 'pr'">
        <!-- Left: PR list (full height) -->
        <div
          class="flex w-80 shrink-0 flex-col overflow-hidden border-r border-gray-800"
        >
          <!-- Header -->
          <div
            class="flex h-11 shrink-0 items-center gap-2 border-b border-gray-800 px-4"
          >
            <span class="text-sm font-medium text-gray-300">PR Reviews</span>
            <span
              v-if="
                !prLoading &&
                filteredGroups.reduce((a, g) => a + g.prs.length, 0) > 0
              "
              class="text-xs text-gray-600"
            >
              {{ filteredGroups.reduce((a, g) => a + g.prs.length, 0) }} 個
            </span>
            <div class="ml-auto flex items-center gap-1">
              <button
                class="flex items-center rounded px-1.5 py-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
                :class="{ 'pointer-events-none opacity-50': prLoading }"
                @click="loadPRs"
              >
                <UIcon
                  name="i-lucide-refresh-cw"
                  :class="{ 'animate-spin': prLoading }"
                  style="font-size: 0.85em"
                />
              </button>
            </div>
          </div>

          <!-- PR list header -->
          <div
            class="flex items-center gap-3 border-b border-gray-800/60 px-4 py-1.5"
          >
            <span class="text-xs text-gray-500">PR 列表</span>
            <span
              v-if="prSelectedCount"
              class="text-primary-400 ml-auto text-xs font-medium"
            >
              已選 {{ prSelectedCount }}
            </span>
          </div>

          <!-- PR list (full remaining height) -->
          <div class="flex-1 overflow-y-auto">
            <div v-if="prLoading" class="space-y-1.5 p-2">
              <div
                v-for="n in 5"
                :key="n"
                class="h-12 animate-pulse rounded-lg bg-gray-800/50"
              ></div>
            </div>

            <div v-else-if="prLoadError" class="p-4 text-center">
              <UIcon
                name="i-lucide-wifi-off"
                class="mb-2 text-xl text-red-500"
              />
              <p class="mb-2 text-xs text-gray-500">{{ prLoadError }}</p>
              <UButton size="xs" @click="loadPRs">重試</UButton>
            </div>

            <div
              v-else-if="filteredGroups.length === 0"
              class="p-6 text-center text-gray-600"
            >
              <UIcon name="i-lucide-git-pull-request" class="mb-2 text-2xl" />
              <p class="text-xs">沒有待處理的 PR</p>
            </div>

            <div v-else class="space-y-0.5 p-1.5">
              <template v-for="group in filteredGroups" :key="group.repo">
                <div
                  class="flex items-center gap-2 px-2.5 py-1.5 text-gray-500"
                >
                  <UIcon
                    name="i-lucide-git-branch"
                    class="shrink-0"
                    style="font-size: 0.75em"
                  />
                  <span
                    class="truncate font-mono tracking-wide uppercase"
                    style="font-size: 0.65em"
                  >
                    {{ group.repo }}
                  </span>
                </div>
                <button
                  v-for="prItem in group.prs"
                  :key="prItem.number"
                  class="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-100"
                  :class="[
                    pr.isRunning.value
                      ? 'cursor-default opacity-70'
                      : 'cursor-pointer hover:bg-gray-800/60',
                    prSelected.has(prKey(group.repo, prItem.number))
                      ? 'ring-primary-500/30 bg-gray-800/80 ring-1'
                      : '',
                  ]"
                  @click="togglePR(group.repo, prItem.number)"
                >
                  <UCheckbox
                    :model-value="
                      prSelected.has(prKey(group.repo, prItem.number))
                    "
                    class="pointer-events-none mt-0.5 shrink-0"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <a
                        :href="prItem.html_url"
                        target="_blank"
                        rel="noopener"
                        class="text-primary-400 shrink-0 font-mono text-sm font-semibold underline-offset-2 hover:underline"
                        @click.stop
                        >#{{ prItem.number }}</a
                      >
                      <UBadge
                        v-if="prItem.draft"
                        color="neutral"
                        variant="soft"
                        size="xs"
                      >
                        Draft
                      </UBadge>
                      <UBadge
                        v-if="isFromClaudeRunner(prItem.html_url)"
                        color="warning"
                        variant="soft"
                        size="xs"
                      >
                        from JIRA
                      </UBadge>
                    </div>
                    <p
                      class="mt-0.5 truncate text-xs leading-snug text-gray-500"
                    >
                      {{ prItem.title }}
                    </p>
                  </div>
                </button>
              </template>
            </div>
          </div>

          <!-- Run button (pinned to bottom) -->
          <div class="shrink-0 border-t border-gray-800 px-3 py-2">
            <UButton
              class="w-full justify-center"
              size="sm"
              color="success"
              :disabled="!prSelectedCount || pr.isRunning.value"
              :loading="pr.isRunning.value"
              icon="i-lucide-git-pull-request"
              @click="runPR"
            >
              {{
                pr.isRunning.value
                  ? '修復中...'
                  : `修復 Review${prSelectedCount ? ` (${prSelectedCount})` : ''}`
              }}
            </UButton>
          </div>
        </div>

        <!-- Right: PR detail panel -->
        <div class="flex flex-1 flex-col overflow-hidden">
          <!-- Tab bar -->
          <div class="flex shrink-0 items-center border-b border-gray-800 px-1">
            <button
              class="-mb-px flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm transition-colors"
              :class="
                prRightTab === 'progress'
                  ? 'border-primary-500 font-medium text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              "
              @click="prRightTab = 'progress'"
            >
              <UIcon
                v-if="pr.isRunning.value"
                name="i-lucide-loader-circle"
                class="text-primary-400 animate-spin"
                style="font-size: 0.8em"
              />
              執行過程
            </button>
            <button
              class="-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors"
              :class="
                prRightTab === 'history'
                  ? 'border-primary-500 font-medium text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              "
              @click="prRightTab = 'history'"
            >
              執行紀錄
              <span
                v-if="prHistory.length > 0"
                class="rounded-full bg-gray-700 px-1.5 py-0.5 text-xs leading-none text-gray-400"
              >
                {{ prHistory.length }}
              </span>
            </button>
          </div>

          <!-- Status row -->
          <RunnerStatusRow
            v-if="pr.activeJob.value"
            :active-job="pr.activeJob.value"
            :is-running="pr.isRunning.value"
            :success-count="pr.successCount.value"
            :error-count="pr.errorCount.value"
            :elapsed="pr.elapsed.value"
            :expanded="prRowExpanded"
            :get-item-url="getPrUrl"
            @update:expanded="prRowExpanded = $event"
            @cancel="pr.cancelJob"
          />

          <!-- Progress -->
          <template v-if="prRightTab === 'progress'">
            <RunnerJobProgress
              v-if="pr.activeJob.value"
              :active-job="pr.activeJob.value"
              class="flex-1 overflow-hidden"
            />
            <div
              v-else
              class="flex flex-1 flex-col items-center justify-center gap-3 text-gray-700 select-none"
            >
              <UIcon name="i-lucide-git-pull-request" class="text-5xl" />
              <div class="text-center">
                <p class="font-medium text-gray-600">
                  從左側選擇 PR，開始自動修復 Review
                </p>
                <p class="mt-1 text-xs text-gray-600">
                  Claude 會自動分析 Review 意見、修復程式碼並 Push
                </p>
              </div>
            </div>
          </template>

          <!-- History -->
          <template v-else-if="prRightTab === 'history'">
            <RunnerJobHistory
              :history="prHistory"
              :get-item-url="getPrUrl"
              @clear="clearPrHistory"
            />
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* stylelint-disable declaration-property-value-no-unknown, value-keyword-case */
.runner {
  font-size: v-bind(rootFontSize);
}
/* stylelint-enable declaration-property-value-no-unknown, value-keyword-case */
</style>
