<script setup lang="ts">
import type { HistoryEntry, RunResult } from '~/composables/useRunnerJob';
import type { PrsByRepo } from '~~/server/api/pr-runner/prs.get';

import { useRepoConfigs } from '~/composables/useRepoConfigs';
import { useRunnerJob } from '~/composables/useRunnerJob';

useHead({ title: 'Claude Runner' });

// ── Active tab ──────────────────────────────────────────────
const activeTab = ref<'claude' | 'pr'>(
  typeof localStorage === 'undefined'
    ? 'claude'
    : (localStorage.getItem('home-active-tab') as 'claude' | 'pr') || 'claude',
);
watch(activeTab, (v) => localStorage.setItem('home-active-tab', v));

// ── Shared: repo configs ────────────────────────────────────
const {
  repoConfigs,
  editingConfig,
  newConfig,
  startEditConfig,
  saveConfig: _saveConfig,
  cancelEdit,
  deleteConfig: _deleteConfig,
} = useRepoConfigs();

// ════════════════════════════════════════════════════════════
// CLAUDE RUNNER
// ════════════════════════════════════════════════════════════

interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  description?: string;
}

const FONT_SIZES = [
  { label: '小', value: 14 },
  { label: '中', value: 16 },
  { label: '大', value: 18 },
] as const;

const crFontSize = ref(16);
watch(crFontSize, (v) => localStorage.setItem('cr-font-size', String(v)));
const crRootFontSize = computed(() => `${crFontSize.value}px`);

const crSelectedRepoId = ref<string>('');
watch(crSelectedRepoId, (v) => localStorage.setItem('cr-selected-repo', v));
const crSelectedRepo = computed(
  () => repoConfigs.value.find((c) => c.id === crSelectedRepoId.value) ?? null,
);
const crShowRepoSettings = ref(false);

const crMode = ref<'normal' | 'smart'>('smart');
watch(crMode, (v) => localStorage.setItem('cr-mode', v));

const jiraBaseUrl = ref('');
watch(jiraBaseUrl, (v) => localStorage.setItem('cr-jira-url', v.trim()));

function jiraUrl(key: string) {
  const base = jiraBaseUrl.value.replace(/\/$/, '');
  return base ? `${base}/browse/${key}` : null;
}

const crHistory = ref<HistoryEntry[]>([]);

async function loadCrHistory() {
  try {
    const data = await $fetch<HistoryEntry[]>('/api/claude-runner/jobs');
    crHistory.value = data;
  } catch (error) {
    console.error('Failed to load CR history:', error);
  }
}

async function clearCrHistory() {
  await $fetch('/api/claude-runner/jobs', { method: 'DELETE' });
  crHistory.value = [];
}

const issues = ref<JiraIssue[]>([]);
const crSelected = ref<Set<string>>(new Set());
const crLoading = ref(true);
const crLoadError = ref('');
const crRightTab = ref<'history' | 'progress' | 'result'>('result');
const crRowExpanded = ref(false);

const crSelectedCount = computed(() => crSelected.value.size);
const crAllChecked = computed(
  () =>
    issues.value.length > 0 && crSelected.value.size === issues.value.length,
);
const crIndeterminate = computed(
  () =>
    crSelected.value.size > 0 && crSelected.value.size < issues.value.length,
);

const {
  activeJob: crActiveJob,
  elapsed: crElapsed,
  isRunning: crIsRunning,
  successCount: crSuccessCount,
  errorCount: crErrorCount,
  startJob: crStartJob,
  restoreJob: crRestoreJob,
  cancelJob: crCancelJob,
  cleanup: crCleanup,
  storageKey: crJobStorageKey,
} = useRunnerJob({
  storageKey: 'cr-active-jobId',
  onComplete: () => loadCrHistory(),
});

function crSaveConfig() {
  const isNew = !editingConfig.value?.id;
  const entry = _saveConfig();
  if (entry && isNew) crSelectedRepoId.value = entry.id;
}

function crDeleteConfig(id: string) {
  _deleteConfig(id);
  if (crSelectedRepoId.value === id) crSelectedRepoId.value = '';
}

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
  if (crIsRunning.value) return;
  const next = new Set(crSelected.value);
  next.has(key) ? next.delete(key) : next.add(key);
  crSelected.value = next;
}

function toggleAllIssues() {
  if (crIsRunning.value) return;
  crSelected.value =
    crSelected.value.size === issues.value.length
      ? new Set()
      : new Set(issues.value.map((i) => i.key));
}

async function crRunSelected() {
  const picked = issues.value.filter((i) => crSelected.value.has(i.key));
  if (picked.length === 0 || crIsRunning.value) return;
  crRightTab.value = 'progress';
  try {
    const { jobId } = await $fetch<{ jobId: string }>(
      '/api/claude-runner/run',
      {
        method: 'POST',
        body: {
          issues: picked,
          repoConfig: crSelectedRepo.value
            ? { cwd: crSelectedRepo.value.cwd }
            : undefined,
          mode: crMode.value,
        },
      },
    );
    crRowExpanded.value = true;
    crStartJob(
      jobId,
      picked.map((i) => ({ key: i.key, summary: i.summary })),
    );
  } catch (error) {
    console.error('Failed to start CR job:', error);
  }
}

const crStatusColor: Record<string, 'info' | 'neutral' | 'success'> = {
  'To Do': 'neutral',
  'In Progress': 'info',
  Done: 'success',
};

interface DescAnalysis {
  time: null | string;
  type: null | string;
  files: null | number;
}

function parseDescription(desc?: string): DescAnalysis {
  if (!desc) return { time: null, type: null, files: null };
  const timeMatch = /預估工時[：:]\s*\*{0,2}(\d+\s*[mh分鐘小時]+)\*{0,2}/i.exec(
    desc,
  );
  const typeMap: [RegExp, string][] = [
    [/hotfix/i, 'hotfix'],
    [/bug\s*fix|修復|修 bug/i, 'bug fix'],
    [/重構|refactor/i, 'refactor'],
    [/小型/, '小型'],
    [/中型/, '中型'],
    [/大型/, '大型'],
    [/feature|功能/i, 'feature'],
  ];
  const typeLabel = typeMap.find(([re]) => re.test(desc))?.[1] ?? null;
  const filesMatch = /(\d+)\s*[^\d。，,\n]{0,20}檔案/.exec(desc);
  return {
    time: timeMatch?.[1]?.trim() ?? null,
    type: typeLabel,
    files: filesMatch?.[1] ? Number(filesMatch[1]) : null,
  };
}

const issuesWithAnalysis = computed(() =>
  issues.value.map((i) => ({
    ...i,
    _analysis: parseDescription(i.description),
  })),
);

// ════════════════════════════════════════════════════════════
// PR RUNNER
// ════════════════════════════════════════════════════════════

const PR_MAX_HISTORY = 50;
const PR_MAX_LOG_CHARS = 40_000;

function prLoadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem('pr-history') || '[]');
  } catch {
    return [];
  }
}

function prSaveHistory(entries: HistoryEntry[]) {
  const slim = entries.slice(0, PR_MAX_HISTORY).map((e) => ({
    id: e.id,
    timestamp: e.timestamp,
    durationSecs: e.durationSecs,
    issues: e.issues,
    results: e.results.map(
      (r): RunResult => ({
        issueKey: r.issueKey,
        ...(r.prUrl ? { prUrl: r.prUrl } : {}),
        ...(r.error === undefined
          ? {}
          : { error: r.error.slice(0, 300) || '執行失敗' }),
      }),
    ),
    log: e.log ? e.log.slice(-PR_MAX_LOG_CHARS) : undefined,
  }));
  try {
    localStorage.setItem('pr-history', JSON.stringify(slim));
  } catch {
    try {
      localStorage.setItem('pr-history', JSON.stringify(slim.slice(0, 5)));
    } catch {}
  }
}

const prHistory = ref<HistoryEntry[]>([]);

function prAddHistory(entry: HistoryEntry) {
  prHistory.value = [entry, ...prHistory.value].slice(0, PR_MAX_HISTORY);
  prSaveHistory(prHistory.value);
}

function prClearHistory() {
  prHistory.value = [];
  localStorage.removeItem('pr-history');
}

const prFontSize = ref(16);
watch(prFontSize, (v) => localStorage.setItem('pr-font-size', String(v)));
const prRootFontSize = computed(() => `${prFontSize.value}px`);

const prSelectedRepoId = ref<string>('');
watch(prSelectedRepoId, (v) => localStorage.setItem('pr-selected-repo', v));
const prSelectedRepo = computed(
  () => repoConfigs.value.find((c) => c.id === prSelectedRepoId.value) ?? null,
);
const prShowRepoSettings = ref(false);

const repoGroups = ref<PrsByRepo[]>([]);
const prSelected = ref<Set<string>>(new Set());
const prLoading = ref(true);
const prLoadError = ref('');
const prRightTab = ref<'history' | 'progress' | 'result'>('result');
const prRowExpanded = ref(false);

const prFilteredGroups = computed(() => {
  if (!prSelectedRepo.value?.githubRepo) return repoGroups.value;
  return repoGroups.value.filter(
    (g) => g.repo === prSelectedRepo.value?.githubRepo,
  );
});

const prSelectedCount = computed(() => prSelected.value.size);

const {
  activeJob: prActiveJob,
  elapsed: prElapsed,
  isRunning: prIsRunning,
  successCount: prSuccessCount,
  errorCount: prErrorCount,
  startJob: prStartJob,
  restoreJob: prRestoreJob,
  cancelJob: prCancelJob,
  cleanup: prCleanup,
  storageKey: prJobStorageKey,
} = useRunnerJob({
  storageKey: 'pr-active-jobId',
  phases: [
    { label: '拉取分支 & 分析 Review' },
    { label: '實作修復' },
    { label: 'Push commits' },
  ],
  onComplete: (jobId, job) => {
    prAddHistory({
      id: jobId,
      timestamp: job.startedAt,
      durationSecs: job.durationSecs,
      issues: job.issues,
      results: job.results,
      log: job.output,
    });
  },
});

function prSaveConfig() {
  const isNew = !editingConfig.value?.id;
  const entry = _saveConfig();
  if (entry && isNew) prSelectedRepoId.value = entry.id;
}

function prDeleteConfig(id: string) {
  _deleteConfig(id);
  if (prSelectedRepoId.value === id) prSelectedRepoId.value = '';
}

function prKey(repo: string, number: number) {
  return `${repo}#${number}`;
}

function togglePR(repo: string, number: number) {
  if (prIsRunning.value) return;
  const key = prKey(repo, number);
  const next = new Set(prSelected.value);
  next.has(key) ? next.delete(key) : next.add(key);
  prSelected.value = next;
}

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

function getSelectedPRItems() {
  return prFilteredGroups.value.flatMap((g) =>
    g.prs
      .filter((pr) => prSelected.value.has(prKey(g.repo, pr.number)))
      .map((pr) => ({
        number: pr.number,
        title: pr.title,
        repo: g.repo,
        branch: pr.head.ref,
        html_url: pr.html_url,
      })),
  );
}

async function prRunSelected() {
  const prs = getSelectedPRItems();
  if (prs.length === 0 || prIsRunning.value) return;
  prRightTab.value = 'progress';
  try {
    const { jobId } = await $fetch<{ jobId: string }>('/api/pr-runner/run', {
      method: 'POST',
      body: {
        prs,
        repoConfig: prSelectedRepo.value
          ? { cwd: prSelectedRepo.value.cwd }
          : undefined,
      },
    });
    prRowExpanded.value = true;
    prStartJob(
      jobId,
      prs.map((p) => ({
        key: `#${p.number}`,
        summary: `${p.repo} — ${p.title}`,
      })),
    );
  } catch (error) {
    console.error('Failed to start PR job:', error);
  }
}

function getPrUrl(key: string): null | string {
  const num = Number(key.replace('#', ''));
  for (const group of prFilteredGroups.value) {
    const pr = group.prs.find((p) => p.number === num);
    if (pr) return pr.html_url;
  }
  return null;
}

// ── Lifecycle ───────────────────────────────────────────────
onMounted(async () => {
  // Init from localStorage
  crFontSize.value = Number(localStorage.getItem('cr-font-size') || 16);
  crSelectedRepoId.value = localStorage.getItem('cr-selected-repo') ?? '';
  crMode.value =
    (localStorage.getItem('cr-mode') as 'normal' | 'smart') || 'smart';
  jiraBaseUrl.value = localStorage.getItem('cr-jira-url') || '';

  prFontSize.value = Number(localStorage.getItem('pr-font-size') || 16);
  prSelectedRepoId.value = localStorage.getItem('pr-selected-repo') ?? '';

  prHistory.value = prLoadHistory();

  // Load data
  loadCrHistory();
  loadIssues();
  loadPRs();

  // Restore active jobs
  const crSavedJobId = localStorage.getItem(crJobStorageKey);
  if (crSavedJobId) {
    await crRestoreJob(crSavedJobId);
    if (crActiveJob.value) crRowExpanded.value = true;
  }

  const prSavedJobId = localStorage.getItem(prJobStorageKey);
  if (prSavedJobId) {
    await prRestoreJob(prSavedJobId);
    if (prActiveJob.value) prRowExpanded.value = true;
  }
});

onBeforeUnmount(() => {
  crCleanup();
  prCleanup();
});
</script>

<template>
  <div
    class="flex h-screen flex-col bg-gray-950 text-gray-100"
    style="font-family: 'JetBrains Mono', ui-monospace, monospace"
  >
    <!-- ── Unified top nav ─────────────────────────────────── -->
    <div
      class="flex h-14 shrink-0 items-center gap-3 border-b border-gray-800 px-5"
    >
      <!-- Logo + tab switcher -->
      <div class="flex shrink-0 items-center gap-2">
        <span class="text-primary-400">⚡</span>
        <span class="font-semibold text-white">Claude Runner</span>
      </div>

      <div class="flex items-center gap-1 rounded-lg bg-gray-800/60 p-1">
        <button
          class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
          :class="
            activeTab === 'claude'
              ? 'bg-gray-700 font-medium text-white'
              : 'text-gray-500 hover:text-gray-300'
          "
          @click="activeTab = 'claude'"
        >
          <UIcon name="i-lucide-bug" style="font-size: 0.85em" />
          Jira 修復
        </button>
        <button
          class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
          :class="
            activeTab === 'pr'
              ? 'bg-gray-700 font-medium text-white'
              : 'text-gray-500 hover:text-gray-300'
          "
          @click="activeTab = 'pr'"
        >
          <UIcon name="i-lucide-git-pull-request" style="font-size: 0.85em" />
          PR Review
        </button>
      </div>

      <!-- Claude Runner controls -->
      <template v-if="activeTab === 'claude'">
        <div
          class="ml-2 flex items-center gap-1.5 rounded-lg bg-gray-800/60 px-3 py-1.5"
        >
          <UIcon name="i-lucide-link" class="shrink-0 text-gray-600" />
          <input
            v-model="jiraBaseUrl"
            class="w-52 bg-transparent text-sm text-gray-400 placeholder-gray-700 outline-none"
            placeholder="https://xxx.atlassian.net"
            spellcheck="false"
          />
        </div>
        <div
          class="flex items-center gap-1.5 rounded-lg bg-gray-800/60 px-3 py-1.5"
        >
          <UIcon name="i-lucide-folder-git-2" class="shrink-0 text-gray-600" />
          <select
            v-model="crSelectedRepoId"
            class="cursor-pointer bg-transparent text-sm text-gray-400 outline-none"
            style="max-width: 13rem"
          >
            <option value="">env 預設</option>
            <option v-for="c in repoConfigs" :key="c.id" :value="c.id">
              {{ c.name }}
            </option>
          </select>
        </div>
        <button
          class="flex items-center rounded-lg px-2 py-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
          :class="{ 'text-primary-400': crShowRepoSettings }"
          @click="
            crShowRepoSettings = !crShowRepoSettings;
            prShowRepoSettings = false;
          "
        >
          <UIcon name="i-lucide-settings-2" />
        </button>
        <div class="ml-2 flex items-center gap-1 rounded-lg bg-gray-800/60 p-1">
          <button
            class="rounded-md px-2.5 py-1 text-sm transition-colors"
            :class="
              crMode === 'normal'
                ? 'bg-gray-700 font-medium text-white'
                : 'text-gray-500 hover:text-gray-300'
            "
            @click="crMode = 'normal'"
          >
            普通
          </button>
          <button
            class="flex items-center gap-1 rounded-md px-2.5 py-1 text-sm transition-colors"
            :class="
              crMode === 'smart'
                ? 'bg-primary-600 font-medium text-white'
                : 'text-gray-500 hover:text-gray-300'
            "
            @click="crMode = 'smart'"
          >
            <UIcon name="i-lucide-sparkles" style="font-size: 0.85em" />
            智能
          </button>
        </div>
        <div class="ml-auto flex items-center gap-3">
          <div class="flex items-center gap-1 rounded-lg bg-gray-800/60 p-1">
            <span class="px-1 text-sm text-gray-500">字體</span>
            <button
              v-for="s in FONT_SIZES"
              :key="s.value"
              class="rounded-md px-2.5 py-1 text-sm transition-colors"
              :class="
                crFontSize === s.value
                  ? 'bg-gray-700 font-medium text-white'
                  : 'text-gray-500 hover:text-gray-300'
              "
              @click="crFontSize = s.value"
            >
              {{ s.label }}
            </button>
          </div>
          <span
            v-if="!crLoading && issues.length > 0"
            class="text-sm text-gray-500"
            >{{ issues.length }} 個任務</span
          >
          <button
            class="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
            :class="{ 'pointer-events-none opacity-50': crLoading }"
            @click="loadIssues"
          >
            <UIcon
              name="i-lucide-refresh-cw"
              :class="{ 'animate-spin': crLoading }"
            />
            重新整理
          </button>
        </div>
      </template>

      <!-- PR Runner controls -->
      <template v-if="activeTab === 'pr'">
        <div
          class="ml-2 flex items-center gap-1.5 rounded-lg bg-gray-800/60 px-3 py-1.5"
        >
          <UIcon name="i-lucide-folder-git-2" class="shrink-0 text-gray-600" />
          <select
            v-model="prSelectedRepoId"
            class="cursor-pointer bg-transparent text-sm text-gray-400 outline-none"
            style="max-width: 13rem"
          >
            <option value="">全部 (env 預設)</option>
            <option v-for="c in repoConfigs" :key="c.id" :value="c.id">
              {{ c.name }}
            </option>
          </select>
        </div>
        <button
          class="flex items-center rounded-lg px-2 py-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
          :class="{ 'text-primary-400': prShowRepoSettings }"
          @click="
            prShowRepoSettings = !prShowRepoSettings;
            crShowRepoSettings = false;
          "
        >
          <UIcon name="i-lucide-settings-2" />
        </button>
        <div class="ml-auto flex items-center gap-3">
          <div class="flex items-center gap-1 rounded-lg bg-gray-800/60 p-1">
            <span class="px-1 text-sm text-gray-500">字體</span>
            <button
              v-for="s in FONT_SIZES"
              :key="s.value"
              class="rounded-md px-2.5 py-1 text-sm transition-colors"
              :class="
                prFontSize === s.value
                  ? 'bg-gray-700 font-medium text-white'
                  : 'text-gray-500 hover:text-gray-300'
              "
              @click="prFontSize = s.value"
            >
              {{ s.label }}
            </button>
          </div>
          <span
            v-if="!prLoading && prFilteredGroups.length > 0"
            class="text-sm text-gray-500"
          >
            {{ prFilteredGroups.reduce((acc, g) => acc + g.prs.length, 0) }} 個
            PR
          </span>
          <button
            class="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
            :class="{ 'pointer-events-none opacity-50': prLoading }"
            @click="loadPRs"
          >
            <UIcon
              name="i-lucide-refresh-cw"
              :class="{ 'animate-spin': prLoading }"
            />
            重新整理
          </button>
        </div>
      </template>
    </div>

    <!-- ── Repo settings panel ─────────────────────────────── -->
    <div
      v-if="
        (activeTab === 'claude' && crShowRepoSettings) ||
        (activeTab === 'pr' && prShowRepoSettings)
      "
      class="shrink-0 border-b border-gray-800 bg-gray-900/80 p-4"
    >
      <div class="mx-auto max-w-2xl">
        <div class="mb-3 flex items-center justify-between">
          <span class="font-medium text-gray-300">Repo 設定</span>
          <button
            class="text-gray-500 hover:text-gray-300"
            @click="
              crShowRepoSettings = false;
              prShowRepoSettings = false;
            "
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
              (activeTab === 'claude' ? crSelectedRepoId : prSelectedRepoId) ===
              c.id
                ? 'ring-primary-500/30 bg-gray-800 ring-1'
                : 'bg-gray-800/40'
            "
          >
            <button
              class="flex-1 text-left"
              @click="
                activeTab === 'claude'
                  ? (crSelectedRepoId = c.id)
                  : (prSelectedRepoId = c.id)
              "
            >
              <span class="font-medium text-gray-200">{{ c.name }}</span>
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
              @click="
                activeTab === 'claude'
                  ? crDeleteConfig(c.id)
                  : prDeleteConfig(c.id)
              "
            >
              <UIcon name="i-lucide-trash-2" />
            </button>
          </div>
        </div>
        <p v-else-if="!editingConfig" class="mb-3 text-sm text-gray-500">
          尚無設定，點「新增」加入 Repo 設定。留空則使用環境變數。
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
              <span class="w-28 shrink-0 text-sm text-gray-500">名稱</span>
              <input
                v-model="editingConfig.name"
                placeholder="my-project"
                class="focus:ring-primary-500 flex-1 rounded bg-gray-900 px-2 py-1 text-sm text-gray-100 outline-none focus:ring-1"
              />
            </div>
            <div class="flex items-center gap-2">
              <span class="w-28 shrink-0 text-sm text-gray-500"
                >GitHub Repo</span
              >
              <input
                v-model="editingConfig.githubRepo"
                placeholder="owner/repo"
                class="focus:ring-primary-500 flex-1 rounded bg-gray-900 px-2 py-1 font-mono text-sm text-gray-100 outline-none focus:ring-1"
              />
            </div>
            <div class="flex items-center gap-2">
              <span class="w-28 shrink-0 text-sm text-gray-500">本地路徑</span>
              <input
                v-model="editingConfig.cwd"
                placeholder="/Users/you/project"
                class="focus:ring-primary-500 flex-1 rounded bg-gray-900 px-2 py-1 font-mono text-sm text-gray-100 outline-none focus:ring-1"
              />
            </div>
          </div>
          <div class="mt-3 flex gap-2">
            <UButton
              size="xs"
              @click="activeTab === 'claude' ? crSaveConfig() : prSaveConfig()"
              >儲存</UButton
            >
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
          class="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
          @click="newConfig"
        >
          <UIcon name="i-lucide-plus" />
          新增
        </button>
      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════
         CLAUDE RUNNER BODY
    ════════════════════════════════════════════════════════ -->
    <div
      v-show="activeTab === 'claude'"
      class="flex flex-1 overflow-hidden"
      :style="{ fontSize: crRootFontSize }"
    >
      <!-- Left: issue list -->
      <div
        class="flex w-84 shrink-0 flex-col overflow-hidden border-r border-gray-800"
      >
        <div
          class="flex h-11 shrink-0 items-center gap-3 border-b border-gray-800 px-4"
        >
          <label
            class="flex cursor-pointer items-center gap-2 select-none"
            :class="{
              'pointer-events-none opacity-40': crIsRunning || crLoading,
            }"
          >
            <UCheckbox
              :model-value="crAllChecked"
              :indeterminate="crIndeterminate"
              @change="toggleAllIssues"
            />
            <span class="text-sm text-gray-500">全選</span>
          </label>
          <span
            v-if="crSelectedCount"
            class="text-primary-400 ml-auto text-sm font-medium"
            >已選 {{ crSelectedCount }}</span
          >
        </div>
        <div class="flex-1 overflow-y-auto">
          <div v-if="crLoading" class="space-y-2 p-3">
            <div
              v-for="n in 6"
              :key="n"
              class="h-16 animate-pulse rounded-lg bg-gray-800/50"
            ></div>
          </div>
          <div v-else-if="crLoadError" class="p-6 text-center">
            <UIcon
              name="i-lucide-wifi-off"
              class="mb-3 text-2xl text-red-500"
            />
            <p class="mb-4 text-sm text-gray-500">{{ crLoadError }}</p>
            <UButton size="sm" @click="loadIssues">重試</UButton>
          </div>
          <div
            v-else-if="issues.length === 0"
            class="p-8 text-center text-gray-600"
          >
            <UIcon name="i-lucide-inbox" class="mb-3 text-3xl" />
            <p>沒有待處理的 Issue</p>
          </div>
          <div v-else class="space-y-1 p-2">
            <button
              v-for="issue in issuesWithAnalysis"
              :key="issue.key"
              class="flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors duration-100"
              :class="[
                crIsRunning
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
                <div class="mb-1 flex items-center gap-2">
                  <component
                    :is="jiraUrl(issue.key) ? 'a' : 'span'"
                    :href="jiraUrl(issue.key) ?? undefined"
                    target="_blank"
                    rel="noopener"
                    class="text-primary-400 shrink-0 font-mono font-semibold"
                    :class="{
                      'underline-offset-2 hover:underline': jiraUrl(issue.key),
                    }"
                    @click.stop
                    >{{ issue.key }}</component
                  >
                </div>
                <p class="truncate text-sm leading-snug text-gray-500">
                  {{ issue.summary }}
                </p>
                <div class="mt-1.5 flex flex-wrap items-center gap-1">
                  <UBadge
                    :color="crStatusColor[issue.status] ?? 'neutral'"
                    variant="soft"
                    size="sm"
                    >{{ issue.status }}</UBadge
                  >
                  <UBadge
                    v-if="issue._analysis.type"
                    color="violet"
                    variant="soft"
                    size="sm"
                    >{{ issue._analysis.type }}</UBadge
                  >
                  <UBadge
                    v-if="issue._analysis.files"
                    color="sky"
                    variant="soft"
                    size="sm"
                  >
                    <UIcon name="i-lucide-file-code" />
                    {{ issue._analysis.files }}
                  </UBadge>
                  <UBadge
                    v-if="issue._analysis.time"
                    color="amber"
                    variant="soft"
                    size="sm"
                  >
                    <UIcon name="i-lucide-timer" />
                    {{ issue._analysis.time }}
                  </UBadge>
                </div>
              </div>
            </button>
          </div>
        </div>
        <div class="shrink-0 border-t border-gray-800 p-3">
          <UButton
            class="w-full justify-center"
            :disabled="!crSelectedCount || crIsRunning"
            :loading="crIsRunning"
            icon="i-lucide-zap"
            @click="crRunSelected"
          >
            {{
              crIsRunning
                ? '執行中...'
                : `開始修復${crSelectedCount ? ` (${crSelectedCount})` : ''}`
            }}
          </UButton>
        </div>
      </div>

      <!-- Right panel -->
      <div class="flex flex-1 flex-col overflow-hidden">
        <div class="flex shrink-0 items-center border-b border-gray-800 px-1">
          <button
            class="-mb-px border-b-2 px-4 py-3 text-sm transition-colors"
            :class="
              crRightTab === 'result'
                ? 'border-primary-500 font-medium text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            "
            @click="crRightTab = 'result'"
          >
            本次結果
          </button>
          <button
            class="-mb-px flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm transition-colors"
            :class="
              crRightTab === 'progress'
                ? 'border-primary-500 font-medium text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            "
            @click="crRightTab = 'progress'"
          >
            <UIcon
              v-if="crIsRunning"
              name="i-lucide-loader-circle"
              class="text-primary-400 animate-spin"
              style="font-size: 0.8em"
            />
            執行過程
          </button>
          <button
            class="-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors"
            :class="
              crRightTab === 'history'
                ? 'border-primary-500 font-medium text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            "
            @click="crRightTab = 'history'"
          >
            執行紀錄
            <span
              v-if="crHistory.length > 0"
              class="rounded-full bg-gray-700 px-1.5 py-0.5 text-xs leading-none text-gray-500"
              >{{ crHistory.length }}</span
            >
          </button>
        </div>
        <RunnerStatusRow
          v-if="crActiveJob"
          :active-job="crActiveJob"
          :is-running="crIsRunning"
          :success-count="crSuccessCount"
          :error-count="crErrorCount"
          :elapsed="crElapsed"
          :expanded="crRowExpanded"
          :get-item-url="jiraUrl"
          @update:expanded="crRowExpanded = $event"
          @cancel="crCancelJob"
        />
        <template v-if="crRightTab === 'result'">
          <div
            v-if="!crActiveJob"
            class="flex flex-1 flex-col items-center justify-center gap-3 text-gray-700 select-none"
          >
            <UIcon name="i-lucide-terminal" class="text-5xl" />
            <div class="text-center">
              <p class="font-medium text-gray-600">
                選擇 Issue，點「開始修復」
              </p>
              <p class="mt-1 text-sm text-gray-500">
                Claude Code 會自動修 bug 並建立 PR
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
        <template v-else-if="crRightTab === 'progress'">
          <RunnerJobProgress
            :active-job="crActiveJob"
            class="flex-1 overflow-hidden"
          />
        </template>
        <template v-else-if="crRightTab === 'history'">
          <RunnerJobHistory
            :history="crHistory"
            :get-item-url="jiraUrl"
            @clear="clearCrHistory"
          />
        </template>
      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════
         PR RUNNER BODY
    ════════════════════════════════════════════════════════ -->
    <div
      v-show="activeTab === 'pr'"
      class="flex flex-1 overflow-hidden"
      :style="{ fontSize: prRootFontSize }"
    >
      <!-- Left: PR list -->
      <div
        class="flex w-84 shrink-0 flex-col overflow-hidden border-r border-gray-800"
      >
        <div
          class="flex h-11 shrink-0 items-center gap-3 border-b border-gray-800 px-4"
        >
          <span class="text-sm text-gray-500">PR 列表</span>
          <span
            v-if="prSelectedCount"
            class="text-primary-400 ml-auto text-sm font-medium"
            >已選 {{ prSelectedCount }}</span
          >
        </div>
        <div class="flex-1 overflow-y-auto">
          <div v-if="prLoading" class="space-y-2 p-3">
            <div
              v-for="n in 6"
              :key="n"
              class="h-16 animate-pulse rounded-lg bg-gray-800/50"
            ></div>
          </div>
          <div v-else-if="prLoadError" class="p-6 text-center">
            <UIcon
              name="i-lucide-wifi-off"
              class="mb-3 text-2xl text-red-500"
            />
            <p class="mb-4 text-sm text-gray-500">{{ prLoadError }}</p>
            <UButton size="sm" @click="loadPRs">重試</UButton>
          </div>
          <div
            v-else-if="prFilteredGroups.length === 0"
            class="p-8 text-center text-gray-600"
          >
            <UIcon name="i-lucide-git-pull-request" class="mb-3 text-3xl" />
            <p>沒有待處理的 PR</p>
          </div>
          <div v-else class="space-y-1 p-2">
            <template v-for="group in prFilteredGroups" :key="group.repo">
              <div class="flex items-center gap-2 px-3 py-2 text-gray-500">
                <UIcon name="i-lucide-git-branch" class="shrink-0 text-sm" />
                <span
                  class="truncate font-mono text-xs font-semibold tracking-wide uppercase"
                  >{{ group.repo }}</span
                >
              </div>
              <button
                v-for="pr in group.prs"
                :key="pr.number"
                class="flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors duration-100"
                :class="[
                  prIsRunning
                    ? 'cursor-default opacity-70'
                    : 'cursor-pointer hover:bg-gray-800/60',
                  prSelected.has(prKey(group.repo, pr.number))
                    ? 'ring-primary-500/30 bg-gray-800/80 ring-1'
                    : '',
                ]"
                @click="togglePR(group.repo, pr.number)"
              >
                <UCheckbox
                  :model-value="prSelected.has(prKey(group.repo, pr.number))"
                  class="pointer-events-none mt-0.5 shrink-0"
                />
                <div class="min-w-0 flex-1">
                  <div class="mb-1 flex items-center gap-2">
                    <a
                      :href="pr.html_url"
                      target="_blank"
                      rel="noopener"
                      class="text-primary-400 shrink-0 font-mono font-semibold underline-offset-2 hover:underline"
                      @click.stop
                      >#{{ pr.number }}</a
                    >
                    <UBadge
                      v-if="pr.draft"
                      color="neutral"
                      variant="soft"
                      size="sm"
                      >Draft</UBadge
                    >
                  </div>
                  <p class="truncate text-sm leading-snug text-gray-500">
                    {{ pr.title }}
                  </p>
                  <p class="mt-1 truncate font-mono text-xs text-gray-600">
                    {{ pr.head.ref }}
                  </p>
                </div>
              </button>
            </template>
          </div>
        </div>
        <div class="shrink-0 border-t border-gray-800 p-3">
          <UButton
            class="w-full justify-center"
            :disabled="!prSelectedCount || prIsRunning"
            :loading="prIsRunning"
            icon="i-lucide-zap"
            @click="prRunSelected"
          >
            {{
              prIsRunning
                ? '執行中...'
                : `開始修復${prSelectedCount ? ` (${prSelectedCount})` : ''}`
            }}
          </UButton>
        </div>
      </div>

      <!-- Right panel -->
      <div class="flex flex-1 flex-col overflow-hidden">
        <div class="flex shrink-0 items-center border-b border-gray-800 px-1">
          <button
            class="-mb-px border-b-2 px-4 py-3 text-sm transition-colors"
            :class="
              prRightTab === 'result'
                ? 'border-primary-500 font-medium text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            "
            @click="prRightTab = 'result'"
          >
            本次結果
          </button>
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
              v-if="prIsRunning"
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
              class="rounded-full bg-gray-700 px-1.5 py-0.5 text-xs leading-none text-gray-500"
              >{{ prHistory.length }}</span
            >
          </button>
        </div>
        <RunnerStatusRow
          v-if="prActiveJob"
          :active-job="prActiveJob"
          :is-running="prIsRunning"
          :success-count="prSuccessCount"
          :error-count="prErrorCount"
          :elapsed="prElapsed"
          :expanded="prRowExpanded"
          :get-item-url="getPrUrl"
          @update:expanded="prRowExpanded = $event"
          @cancel="prCancelJob"
        />
        <template v-if="prRightTab === 'result'">
          <div
            v-if="!prActiveJob"
            class="flex flex-1 flex-col items-center justify-center gap-3 text-gray-700 select-none"
          >
            <UIcon name="i-lucide-git-pull-request" class="text-5xl" />
            <div class="text-center">
              <p class="font-medium text-gray-600">選擇 PR，點「開始修復」</p>
              <p class="mt-1 text-sm text-gray-500">
                Claude Code 會自動處理 Review 並 Push 修復
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
        <template v-else-if="prRightTab === 'progress'">
          <RunnerJobProgress
            :active-job="prActiveJob"
            class="flex-1 overflow-hidden"
          />
        </template>
        <template v-else-if="prRightTab === 'history'">
          <RunnerJobHistory
            :history="prHistory"
            :get-item-url="getPrUrl"
            @clear="prClearHistory"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.w-84 {
  width: 21rem;
}
</style>
