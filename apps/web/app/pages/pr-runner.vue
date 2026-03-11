<script setup lang="ts">
import type { HistoryEntry } from '~/composables/useRunnerJob';
import type { PrsByRepo } from '~~/server/api/pr-runner/prs.get';

import { useRepoConfigs } from '~/composables/useRepoConfigs';
import { useRunnerJob } from '~/composables/useRunnerJob';

useHead({ title: 'PR Runner' });

// ── Font size ──
const FONT_SIZES = [
  { label: '小', value: 14 },
  { label: '中', value: 16 },
  { label: '大', value: 18 },
] as const;
const fontSize = ref(
  typeof localStorage === 'undefined'
    ? 16
    : Number(localStorage.getItem('pr-font-size') || 16),
);
watch(fontSize, (v) => localStorage.setItem('pr-font-size', String(v)));
const rootFontSize = computed(() => `${fontSize.value}px`);

// ── History (DB-based) ──
const history = ref<HistoryEntry[]>([]);

async function loadHistory() {
  try {
    history.value = await $fetch<HistoryEntry[]>(
      '/api/claude-runner/jobs?type=pr-runner',
    );
  } catch (error) {
    console.error('Failed to load PR history:', error);
  }
}

async function clearHistory() {
  await $fetch('/api/claude-runner/jobs?type=pr-runner', { method: 'DELETE' });
  history.value = [];
}

// ── Runner ──
const rightTab = ref<'history' | 'progress' | 'result'>('result');
const rowExpanded = ref(false);

const {
  activeJob,
  elapsed,
  isRunning,
  successCount,
  errorCount,
  startJob,
  restoreJob,
  cancelJob,
  cleanup,
  storageKey,
} = useRunnerJob({
  storageKey: 'pr-active-jobId',
  apiBase: '/api/claude-runner',
  phases: [
    { label: '拉取分支 & 分析 Review' },
    { label: '實作修復' },
    { label: 'Push commits' },
  ],
  onComplete: () => {
    loadHistory();
  },
});

// ── Repo configs ──
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
    : (localStorage.getItem('pr-selected-repo') ?? ''),
);

watch(selectedRepoId, (v) => localStorage.setItem('pr-selected-repo', v));

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

// ── PR data ──
const repoGroups = ref<PrsByRepo[]>([]);
const selected = ref<Set<string>>(new Set());
const loading = ref(true);
const loadError = ref('');

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
  if (isRunning.value) return;
  const key = prKey(repo, number);
  const next = new Set(selected.value);
  next.has(key) ? next.delete(key) : next.add(key);
  selected.value = next;
}

const selectedCount = computed(() => selected.value.size);

async function loadPRs() {
  loading.value = true;
  loadError.value = '';
  try {
    const data = await $fetch<PrsByRepo[]>('/api/pr-runner/prs');
    repoGroups.value = Array.isArray(data) ? data : [];
  } catch (error) {
    loadError.value = (error as Error).message;
  } finally {
    loading.value = false;
  }
}

function getSelectedPRItems() {
  return filteredGroups.value.flatMap((g) =>
    g.prs
      .filter((pr) => selected.value.has(prKey(g.repo, pr.number)))
      .map((pr) => ({
        number: pr.number,
        title: pr.title,
        repo: g.repo,
        branch: pr.head.ref,
        html_url: pr.html_url,
      })),
  );
}

async function runSelected() {
  const prs = getSelectedPRItems();
  if (prs.length === 0 || isRunning.value) return;
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
    rowExpanded.value = true;
    startJob(
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
  for (const group of filteredGroups.value) {
    const pr = group.prs.find((p) => p.number === num);
    if (pr) return pr.html_url;
  }
  return null;
}

onMounted(async () => {
  loadHistory();
  loadPRs();
  const savedJobId = localStorage.getItem(storageKey);
  if (savedJobId) {
    await restoreJob(savedJobId);
    if (activeJob.value) rowExpanded.value = true;
  }
});

onBeforeUnmount(() => cleanup());
</script>

<template>
  <div class="runner flex h-screen flex-col bg-gray-950 text-gray-100">
    <!-- Top nav -->
    <div
      class="flex h-14 shrink-0 items-center gap-3 border-b border-gray-800 px-5"
    >
      <div class="flex items-center gap-2">
        <span class="text-primary-400">⚡</span>
        <span class="font-semibold text-white">Claude Runner</span>
      </div>
      <span class="text-gray-700">/</span>
      <span class="text-muted">PR Review 修復</span>

      <!-- Repo selector -->
      <div
        class="ml-2 flex items-center gap-1.5 rounded-lg bg-gray-800/60 px-3 py-1.5"
      >
        <UIcon name="i-lucide-folder-git-2" class="shrink-0 text-gray-600" />
        <select
          v-model="selectedRepoId"
          class="text-muted cursor-pointer bg-transparent outline-none"
          style="max-width: 13rem"
        >
          <option value="">全部 (env 預設)</option>
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

        <span v-if="!loading && filteredGroups.length > 0" class="text-muted">
          {{ filteredGroups.reduce((acc, g) => acc + g.prs.length, 0) }} 個 PR
        </span>

        <button
          class="text-muted flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-800 hover:text-gray-300"
          :class="{ 'pointer-events-none opacity-50': loading }"
          @click="loadPRs"
        >
          <UIcon
            name="i-lucide-refresh-cw"
            :class="{ 'animate-spin': loading }"
          />
          重新整理
        </button>
      </div>
    </div>

    <!-- Repo settings panel -->
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

        <!-- Config list -->
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
              <span class="text-muted ml-2 font-mono text-xs">{{
                c.githubRepo
              }}</span>
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
          尚無設定，點「新增」加入 Repo 設定。留空則使用環境變數。
        </p>

        <!-- Add / Edit form -->
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

    <!-- Body: split layout -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Left: PR list -->
      <div
        class="flex w-84 shrink-0 flex-col overflow-hidden border-r border-gray-800"
      >
        <!-- List header -->
        <div
          class="flex h-11 shrink-0 items-center gap-3 border-b border-gray-800 px-4"
        >
          <span class="text-muted">PR 列表</span>
          <span
            v-if="selectedCount"
            class="text-primary-400 ml-auto font-medium"
          >
            已選 {{ selectedCount }}
          </span>
        </div>

        <!-- PR list -->
        <div class="flex-1 overflow-y-auto">
          <div v-if="loading" class="space-y-2 p-3">
            <div
              v-for="n in 6"
              :key="n"
              class="h-16 animate-pulse rounded-lg bg-gray-800/50"
            ></div>
          </div>

          <div v-else-if="loadError" class="p-6 text-center">
            <UIcon
              name="i-lucide-wifi-off"
              class="mb-3 text-2xl text-red-500"
            />
            <p class="text-muted mb-4">{{ loadError }}</p>
            <UButton size="sm" @click="loadPRs">重試</UButton>
          </div>

          <div
            v-else-if="filteredGroups.length === 0"
            class="p-8 text-center text-gray-600"
          >
            <UIcon name="i-lucide-git-pull-request" class="mb-3 text-3xl" />
            <p>沒有待處理的 PR</p>
          </div>

          <div v-else class="space-y-1 p-2">
            <template v-for="group in filteredGroups" :key="group.repo">
              <!-- Repo header -->
              <div class="flex items-center gap-2 px-3 py-2 text-gray-500">
                <UIcon name="i-lucide-git-branch" class="shrink-0 text-sm" />
                <span
                  class="truncate font-mono text-xs font-semibold tracking-wide uppercase"
                >
                  {{ group.repo }}
                </span>
              </div>

              <!-- PR items -->
              <button
                v-for="pr in group.prs"
                :key="pr.number"
                class="flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors duration-100"
                :class="[
                  isRunning
                    ? 'cursor-default opacity-70'
                    : 'cursor-pointer hover:bg-gray-800/60',
                  selected.has(prKey(group.repo, pr.number))
                    ? 'ring-primary-500/30 bg-gray-800/80 ring-1'
                    : '',
                ]"
                @click="togglePR(group.repo, pr.number)"
              >
                <UCheckbox
                  :model-value="selected.has(prKey(group.repo, pr.number))"
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
                    >
                      Draft
                    </UBadge>
                  </div>
                  <p class="text-muted truncate leading-snug">
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

        <!-- Run button -->
        <div class="shrink-0 border-t border-gray-800 p-3">
          <UButton
            class="w-full justify-center"
            :disabled="!selectedCount || isRunning"
            :loading="isRunning"
            icon="i-lucide-zap"
            @click="runSelected"
          >
            {{
              isRunning
                ? '執行中...'
                : `開始修復${selectedCount ? ` (${selectedCount})` : ''}`
            }}
          </UButton>
        </div>
      </div>

      <!-- Right panel -->
      <div class="flex flex-1 flex-col overflow-hidden">
        <!-- Tab bar -->
        <div class="flex shrink-0 items-center border-b border-gray-800 px-1">
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
              v-if="isRunning"
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
              v-if="history.length > 0"
              class="text-muted rounded-full bg-gray-700 px-1.5 py-0.5 leading-none"
              style="font-size: 0.75em"
            >
              {{ history.length }}
            </span>
          </button>
        </div>

        <!-- Compact status row (always visible when activeJob exists) -->
        <RunnerStatusRow
          v-if="activeJob"
          :active-job="activeJob"
          :is-running="isRunning"
          :success-count="successCount"
          :error-count="errorCount"
          :elapsed="elapsed"
          :expanded="rowExpanded"
          :get-item-url="getPrUrl"
          @update:expanded="rowExpanded = $event"
          @cancel="cancelJob"
        />

        <!-- 本次結果 -->
        <template v-if="rightTab === 'result'">
          <div
            v-if="!activeJob"
            class="flex flex-1 flex-col items-center justify-center gap-3 text-gray-700 select-none"
          >
            <UIcon name="i-lucide-git-pull-request" class="text-5xl" />
            <div class="text-center">
              <p class="font-medium text-gray-600">選擇 PR，點「開始修復」</p>
              <p class="text-muted mt-1">
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

        <!-- 執行過程 -->
        <template v-else-if="rightTab === 'progress'">
          <RunnerJobProgress
            :active-job="activeJob"
            class="flex-1 overflow-hidden"
          />
        </template>

        <!-- 執行紀錄 -->
        <template v-else-if="rightTab === 'history'">
          <RunnerJobHistory
            :history="history"
            :get-item-url="getPrUrl"
            @clear="clearHistory"
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

.w-84 {
  width: 21rem;
}
</style>
