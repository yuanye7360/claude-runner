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
const showRepoSettings = ref(false);

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
// RIGHT PANEL STATE
// ════════════════════════════════════════════════════════
const rightTab = ref<'history' | 'progress' | 'result'>('result');
const activeRunner = ref<'claude' | 'pr'>('claude');

// ════════════════════════════════════════════════════════
// STAGE 1: CLAUDE RUNNER
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
  activeRunner.value = 'claude';
  rightTab.value = 'progress';
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
// STAGE 2: PR RUNNER
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
  return crCreatedPrUrls.value.some((u) => u === htmlUrl);
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
  activeRunner.value = 'pr';
  rightTab.value = 'progress';
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

// ── Computed: active runner state ──
const activeJobForPanel = computed(() =>
  activeRunner.value === 'claude' ? cr.activeJob.value : pr.activeJob.value,
);
const activeIsRunning = computed(() =>
  activeRunner.value === 'claude'
    ? cr.isRunning.value
    : pr.isRunning.value,
);
const activeElapsed = computed(() =>
  activeRunner.value === 'claude' ? cr.elapsed.value : pr.elapsed.value,
);
const activeSuccessCount = computed(() =>
  activeRunner.value === 'claude'
    ? cr.successCount.value
    : pr.successCount.value,
);
const activeErrorCount = computed(() =>
  activeRunner.value === 'claude'
    ? cr.errorCount.value
    : pr.errorCount.value,
);
const activeRowExpanded = computed({
  get: () =>
    activeRunner.value === 'claude'
      ? crRowExpanded.value
      : prRowExpanded.value,
  set: (v) => {
    if (activeRunner.value === 'claude') crRowExpanded.value = v;
    else prRowExpanded.value = v;
  },
});
const activeHistory = computed(() =>
  activeRunner.value === 'claude' ? crHistory.value : prHistory.value,
);
const activeGetItemUrl = computed(() =>
  activeRunner.value === 'claude' ? jiraUrl : getPrUrl,
);

function activeCancelJob() {
  if (activeRunner.value === 'claude') cr.cancelJob();
  else pr.cancelJob();
}
function activeClearHistory() {
  if (activeRunner.value === 'claude') clearCrHistory();
  else clearPrHistory();
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
      activeRunner.value = 'claude';
      crRowExpanded.value = true;
    }
  }
  // Restore PR Runner job
  const prJobId = localStorage.getItem(pr.storageKey);
  if (prJobId) {
    await pr.restoreJob(prJobId);
    if (pr.activeJob.value) {
      activeRunner.value = 'pr';
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
      class="flex h-14 shrink-0 items-center gap-3 border-b border-gray-800 px-5"
    >
      <div class="flex items-center gap-2">
        <span class="text-primary-400 text-lg">⚡</span>
        <span class="font-semibold text-white">Claude Runner</span>
      </div>
      <span class="text-gray-700">|</span>
      <span class="text-muted">Pipeline</span>

      <!-- Jira base URL -->
      <div
        class="ml-2 flex items-center gap-1.5 rounded-lg bg-gray-800/60 px-3 py-1.5"
      >
        <UIcon name="i-lucide-link" class="shrink-0 text-gray-600" />
        <input
          v-model="jiraBaseUrl"
          class="text-muted w-48 bg-transparent placeholder-gray-700 outline-none"
          placeholder="https://xxx.atlassian.net"
          spellcheck="false"
        />
      </div>

      <!-- Repo selector -->
      <div
        class="flex items-center gap-1.5 rounded-lg bg-gray-800/60 px-3 py-1.5"
      >
        <UIcon name="i-lucide-folder-git-2" class="shrink-0 text-gray-600" />
        <select
          v-model="selectedRepoId"
          class="text-muted cursor-pointer bg-transparent outline-none"
          style="max-width: 13rem"
        >
          <option value="">env 預設</option>
          <option v-for="c in repoConfigs" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </select>
      </div>
      <button
        class="text-muted flex items-center rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-800 hover:text-gray-300"
        :class="{ 'text-primary-400': showRepoSettings }"
        @click="showRepoSettings = !showRepoSettings"
      >
        <UIcon name="i-lucide-settings-2" />
      </button>

      <!-- Mode toggle -->
      <div class="flex items-center gap-1 rounded-lg bg-gray-800/60 p-1">
        <button
          class="rounded-md px-2.5 py-1 transition-colors"
          :class="
            mode === 'normal'
              ? 'bg-gray-700 font-medium text-white'
              : 'text-muted hover:text-gray-300'
          "
          @click="mode = 'normal'"
        >
          普通
        </button>
        <button
          class="flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors"
          :class="
            mode === 'smart'
              ? 'bg-primary-600 font-medium text-white'
              : 'text-muted hover:text-gray-300'
          "
          @click="mode = 'smart'"
        >
          <UIcon name="i-lucide-sparkles" style="font-size: 0.85em" />
          智能
        </button>
      </div>

      <div class="ml-auto flex items-center gap-3">
        <!-- Font size picker -->
        <div class="flex items-center gap-1 rounded-lg bg-gray-800/60 p-1">
          <span class="text-muted px-1">字體</span>
          <button
            v-for="s in FONT_SIZES"
            :key="s.value"
            class="rounded-md px-2.5 py-1 transition-colors"
            :class="
              fontSize === s.value
                ? 'bg-gray-700 font-medium text-white'
                : 'text-muted hover:text-gray-300'
            "
            @click="fontSize = s.value"
          >
            {{ s.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- ══════ Repo settings panel ══════ -->
    <div
      v-if="showRepoSettings"
      class="shrink-0 border-b border-gray-800 bg-gray-900/80 p-4"
    >
      <div class="mx-auto max-w-2xl">
        <div class="mb-3 flex items-center justify-between">
          <span class="font-medium text-gray-300">Repo 設定</span>
          <button
            class="text-muted hover:text-gray-300"
            @click="showRepoSettings = false"
          >
            <UIcon name="i-lucide-x" />
          </button>
        </div>

        <div v-if="repoConfigs.length > 0" class="mb-3 space-y-1">
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
              <span class="font-medium text-gray-200">{{ c.name }}</span>
              <span
                v-if="c.githubRepo"
                class="text-muted ml-2 font-mono text-xs"
                >{{ c.githubRepo }}</span
              >
              <span class="text-muted ml-2 font-mono text-xs text-gray-600">{{
                c.cwd
              }}</span>
            </button>
            <button
              class="text-muted px-1 hover:text-gray-300"
              @click="startEditConfig(c)"
            >
              <UIcon name="i-lucide-pencil" />
            </button>
            <button
              class="text-muted px-1 hover:text-red-400"
              @click="deleteRepoConfig(c.id)"
            >
              <UIcon name="i-lucide-trash-2" />
            </button>
          </div>
        </div>
        <p v-else-if="!editingConfig" class="text-muted mb-3 text-sm">
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
              <span class="text-muted w-28 shrink-0 text-sm">名稱</span>
              <input
                v-model="editingConfig.name"
                placeholder="kkday-mobile"
                class="focus:ring-primary-500 flex-1 rounded bg-gray-900 px-2 py-1 text-sm text-gray-100 outline-none focus:ring-1"
              />
            </div>
            <div class="flex items-center gap-2">
              <span class="text-muted w-28 shrink-0 text-sm">GitHub Repo</span>
              <input
                v-model="editingConfig.githubRepo"
                placeholder="kkday-it/kkday-mobile-member-ci"
                class="focus:ring-primary-500 flex-1 rounded bg-gray-900 px-2 py-1 font-mono text-sm text-gray-100 outline-none focus:ring-1"
              />
            </div>
            <div class="flex items-center gap-2">
              <span class="text-muted w-28 shrink-0 text-sm">本地路徑</span>
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
          class="text-muted mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-800 hover:text-gray-300"
          @click="newConfig"
        >
          <UIcon name="i-lucide-plus" />
          新增
        </button>
      </div>
    </div>

    <!-- ══════ Body: pipeline (left) + detail (right) ══════ -->
    <div class="flex flex-1 overflow-hidden">
      <!-- ══════ Left: Pipeline Sidebar ══════ -->
      <div
        class="flex w-96 shrink-0 flex-col overflow-hidden border-r border-gray-800"
      >
        <div class="flex-1 overflow-y-auto">
          <!-- ─── Stage 1: Fix JIRA Issues ─── -->
          <div class="border-b border-gray-800">
            <!-- Stage header -->
            <div class="flex items-center gap-2 bg-gray-900/60 px-4 py-2.5">
              <div
                class="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
              >
                1
              </div>
              <span class="font-medium text-gray-200">修復 JIRA Issue</span>
              <span
                v-if="!crLoading && issues.length > 0"
                class="text-muted"
              >
                {{ issues.length }} 個
              </span>
              <div class="ml-auto flex items-center gap-1">
                <button
                  class="text-muted flex items-center rounded px-1.5 py-1 transition-colors hover:bg-gray-800 hover:text-gray-300"
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
                <span class="text-muted text-xs">全選</span>
              </label>
              <span
                v-if="crSelectedCount"
                class="text-primary-400 ml-auto text-xs font-medium"
              >
                已選 {{ crSelectedCount }}
              </span>
            </div>

            <!-- Issue list -->
            <div class="max-h-64 overflow-y-auto">
              <div v-if="crLoading" class="space-y-1.5 p-2">
                <div
                  v-for="n in 3"
                  :key="n"
                  class="h-12 animate-pulse rounded-lg bg-gray-800/50"
                ></div>
              </div>

              <div v-else-if="crLoadError" class="p-4 text-center">
                <UIcon
                  name="i-lucide-wifi-off"
                  class="mb-2 text-xl text-red-500"
                />
                <p class="text-muted mb-2 text-xs">{{ crLoadError }}</p>
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
                    <p class="text-muted mt-0.5 truncate text-xs leading-snug">
                      {{ issue.summary }}
                    </p>
                  </div>
                </button>
              </div>
            </div>

            <!-- Run button -->
            <div class="px-3 py-2">
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

          <!-- ─── Pipeline Arrow ─── -->
          <div class="flex items-center justify-center gap-2 py-3">
            <div class="h-px flex-1 bg-gray-800"></div>
            <div class="flex items-center gap-1.5 text-gray-500">
              <UIcon name="i-lucide-arrow-down" />
              <span class="text-xs font-medium">PR 建立後</span>
              <UIcon name="i-lucide-arrow-down" />
            </div>
            <div class="h-px flex-1 bg-gray-800"></div>
          </div>

          <!-- ─── Stage 2: Fix PR Reviews ─── -->
          <div>
            <!-- Stage header -->
            <div class="flex items-center gap-2 bg-gray-900/60 px-4 py-2.5">
              <div
                class="flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white"
              >
                2
              </div>
              <span class="font-medium text-gray-200">修復 PR Review</span>
              <span
                v-if="
                  !prLoading &&
                  filteredGroups.reduce((a, g) => a + g.prs.length, 0) > 0
                "
                class="text-muted"
              >
                {{
                  filteredGroups.reduce((a, g) => a + g.prs.length, 0)
                }}
                個
              </span>
              <div class="ml-auto flex items-center gap-1">
                <button
                  class="text-muted flex items-center rounded px-1.5 py-1 transition-colors hover:bg-gray-800 hover:text-gray-300"
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
              <span class="text-muted text-xs">PR 列表</span>
              <span
                v-if="prSelectedCount"
                class="text-primary-400 ml-auto text-xs font-medium"
              >
                已選 {{ prSelectedCount }}
              </span>
            </div>

            <!-- PR list -->
            <div class="max-h-64 overflow-y-auto">
              <div v-if="prLoading" class="space-y-1.5 p-2">
                <div
                  v-for="n in 3"
                  :key="n"
                  class="h-12 animate-pulse rounded-lg bg-gray-800/50"
                ></div>
              </div>

              <div v-else-if="prLoadError" class="p-4 text-center">
                <UIcon
                  name="i-lucide-wifi-off"
                  class="mb-2 text-xl text-red-500"
                />
                <p class="text-muted mb-2 text-xs">{{ prLoadError }}</p>
                <UButton size="xs" @click="loadPRs">重試</UButton>
              </div>

              <div
                v-else-if="filteredGroups.length === 0"
                class="p-6 text-center text-gray-600"
              >
                <UIcon
                  name="i-lucide-git-pull-request"
                  class="mb-2 text-2xl"
                />
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
                          from Stage 1
                        </UBadge>
                      </div>
                      <p
                        class="text-muted mt-0.5 truncate text-xs leading-snug"
                      >
                        {{ prItem.title }}
                      </p>
                    </div>
                  </button>
                </template>
              </div>
            </div>

            <!-- Run button -->
            <div class="px-3 py-2">
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
        </div>
      </div>

      <!-- ══════ Right: Detail Panel ══════ -->
      <div class="flex flex-1 flex-col overflow-hidden">
        <!-- Runner selector tabs + panel tabs -->
        <div
          class="flex shrink-0 items-center border-b border-gray-800 px-1"
        >
          <!-- Runner toggle -->
          <div
            class="ml-2 mr-2 flex items-center gap-1 rounded-lg bg-gray-800/60 p-0.5"
          >
            <button
              class="rounded-md px-3 py-1.5 text-xs transition-colors"
              :class="
                activeRunner === 'claude'
                  ? 'bg-blue-600 font-medium text-white'
                  : 'text-muted hover:text-gray-300'
              "
              @click="activeRunner = 'claude'"
            >
              JIRA
              <span
                v-if="cr.isRunning.value"
                class="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400"
              ></span>
            </button>
            <button
              class="rounded-md px-3 py-1.5 text-xs transition-colors"
              :class="
                activeRunner === 'pr'
                  ? 'bg-green-600 font-medium text-white'
                  : 'text-muted hover:text-gray-300'
              "
              @click="activeRunner = 'pr'"
            >
              PR
              <span
                v-if="pr.isRunning.value"
                class="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-400"
              ></span>
            </button>
          </div>

          <div class="mx-2 h-5 w-px bg-gray-800"></div>

          <!-- Panel tabs -->
          <button
            class="-mb-px border-b-2 px-4 py-3 transition-colors"
            :class="
              rightTab === 'result'
                ? 'border-primary-500 font-medium text-white'
                : 'text-muted border-transparent hover:text-gray-300'
            "
            @click="rightTab = 'result'"
          >
            本次結果
          </button>
          <button
            class="-mb-px flex items-center gap-1.5 border-b-2 px-4 py-3 transition-colors"
            :class="
              rightTab === 'progress'
                ? 'border-primary-500 font-medium text-white'
                : 'text-muted border-transparent hover:text-gray-300'
            "
            @click="rightTab = 'progress'"
          >
            <UIcon
              v-if="activeIsRunning"
              name="i-lucide-loader-circle"
              class="text-primary-400 animate-spin"
              style="font-size: 0.8em"
            />
            執行過程
          </button>
          <button
            class="-mb-px flex items-center gap-2 border-b-2 px-4 py-3 transition-colors"
            :class="
              rightTab === 'history'
                ? 'border-primary-500 font-medium text-white'
                : 'text-muted border-transparent hover:text-gray-300'
            "
            @click="rightTab = 'history'"
          >
            執行紀錄
            <span
              v-if="activeHistory.length > 0"
              class="text-muted rounded-full bg-gray-700 px-1.5 py-0.5 leading-none"
              style="font-size: 0.75em"
            >
              {{ activeHistory.length }}
            </span>
          </button>
        </div>

        <!-- Status row -->
        <RunnerStatusRow
          v-if="activeJobForPanel"
          :active-job="activeJobForPanel"
          :is-running="activeIsRunning"
          :success-count="activeSuccessCount"
          :error-count="activeErrorCount"
          :elapsed="activeElapsed"
          :expanded="activeRowExpanded"
          :get-item-url="activeGetItemUrl"
          @update:expanded="activeRowExpanded = $event"
          @cancel="activeCancelJob"
        />

        <!-- 本次結果 -->
        <template v-if="rightTab === 'result'">
          <div
            v-if="!activeJobForPanel"
            class="flex flex-1 flex-col items-center justify-center gap-3 text-gray-700 select-none"
          >
            <UIcon name="i-lucide-terminal" class="text-5xl" />
            <div class="text-center">
              <p class="font-medium text-gray-600">
                從左側選擇任務，開始自動修復
              </p>
              <p class="text-muted mt-1">
                Stage 1 修復 JIRA Issue → Stage 2 修復 PR Review
              </p>
            </div>
          </div>
          <div
            v-else
            class="flex flex-1 flex-col items-center justify-center gap-3 text-gray-600 select-none"
          >
            <UIcon name="i-lucide-arrow-up" class="text-2xl" />
            <p>狀態列顯示於上方，點擊可展開</p>
          </div>
        </template>

        <!-- 執行過程 -->
        <template v-else-if="rightTab === 'progress'">
          <RunnerJobProgress
            :active-job="activeJobForPanel"
            class="flex-1 overflow-hidden"
          />
        </template>

        <!-- 執行紀錄 -->
        <template v-else-if="rightTab === 'history'">
          <RunnerJobHistory
            :history="activeHistory"
            :get-item-url="activeGetItemUrl"
            @clear="activeClearHistory"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* stylelint-disable declaration-property-value-no-unknown, value-keyword-case */
.runner {
  font-size: v-bind(rootFontSize);
}
/* stylelint-enable declaration-property-value-no-unknown, value-keyword-case */

.text-muted {
  font-size: 0.875em;
  color: rgb(107 114 128);
}

.text-log {
  font-size: 0.875em;
}
</style>
