<script setup lang="ts">
import type { HistoryEntry } from '~/composables/useRunnerJob';

import { useRepoConfigs } from '~/composables/useRepoConfigs';
import { useRunnerJob } from '~/composables/useRunnerJob';
import { useSkills } from '~/composables/useSkills';

useHead({ title: 'Claude Runner' });

interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  description?: string;
}

// ── Font size ──────────────────────────────────────────────
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

// ── Repo configs ────────────────────────────────────────────
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

const {
  skills: skillList,
  enabledSkillNames,
  fetchSkills,
  toggle: toggleSkill,
  applyPreset: applySkillPreset,
} = useSkills();

const showSkillSettings = ref(false);

function saveConfig() {
  const isNew = !editingConfig.value?.id;
  const entry = _saveConfig();
  if (entry && isNew) selectedRepoId.value = entry.id;
}

function deleteRepoConfig(id: string) {
  _deleteConfig(id);
  if (selectedRepoId.value === id) selectedRepoId.value = '';
}

// ── Mode ───────────────────────────────────────────────────
const mode = ref<'normal' | 'smart'>(
  typeof localStorage === 'undefined'
    ? 'smart'
    : (localStorage.getItem('cr-mode') as 'normal' | 'smart') || 'smart',
);
watch(mode, (v) => {
  localStorage.setItem('cr-mode', v);
  applySkillPreset(v);
});

// ── Jira URL ───────────────────────────────────────────────
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

// ── History ────────────────────────────────────────────────
const history = ref<HistoryEntry[]>([]);

async function loadHistory() {
  try {
    const data = await $fetch<HistoryEntry[]>('/api/claude-runner/jobs');
    history.value = data;
  } catch (error) {
    console.error('Failed to load history:', error);
  }
}

async function clearHistory() {
  await $fetch('/api/claude-runner/jobs', { method: 'DELETE' });
  history.value = [];
}

// ── Data ───────────────────────────────────────────────────
const issues = ref<JiraIssue[]>([]);
const selected = ref<Set<string>>(new Set());
const loading = ref(true);
const loadError = ref('');

// Right panel tab
const rightTab = ref<'history' | 'progress' | 'result'>('result');

const selectedCount = computed(() => selected.value.size);
const allChecked = computed(
  () => issues.value.length > 0 && selected.value.size === issues.value.length,
);
const indeterminate = computed(
  () => selected.value.size > 0 && selected.value.size < issues.value.length,
);

// ── Runner composable ──────────────────────────────────────
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
  storageKey: jobStorageKey,
} = useRunnerJob({
  storageKey: 'cr-active-jobId',
  onComplete: () => {
    loadHistory();
  },
});

// ── Actions ────────────────────────────────────────────────
async function loadIssues() {
  loading.value = true;
  loadError.value = '';
  try {
    const data = await $fetch<JiraIssue[]>('/api/claude-runner/issues');
    issues.value = Array.isArray(data) ? data : [];
  } catch (error) {
    loadError.value = (error as Error).message;
  } finally {
    loading.value = false;
  }
}

function toggleIssue(key: string) {
  if (isRunning.value) return;
  const next = new Set(selected.value);
  next.has(key) ? next.delete(key) : next.add(key);
  selected.value = next;
}

function toggleAll() {
  if (isRunning.value) return;
  selected.value =
    selected.value.size === issues.value.length
      ? new Set()
      : new Set(issues.value.map((i) => i.key));
}

async function runSelected() {
  const picked = issues.value.filter((i) => selected.value.has(i.key));
  if (picked.length === 0 || isRunning.value) return;
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
          enabledSkills: enabledSkillNames.value,
        },
      },
    );
    rowExpanded.value = true;
    startJob(
      jobId,
      picked.map((i) => ({ key: i.key, summary: i.summary })),
    );
  } catch (error) {
    console.error('Failed to start job:', error);
  }
}

// ── Helpers ────────────────────────────────────────────────
const statusColor: Record<string, 'info' | 'neutral' | 'success'> = {
  'To Do': 'neutral',
  'In Progress': 'info',
  Done: 'success',
};

onMounted(async () => {
  loadHistory();
  loadIssues();
  fetchSkills();
  const savedJobId = localStorage.getItem(jobStorageKey);
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
      <span class="text-muted">Jira 自動修復</span>

      <!-- Jira base URL -->
      <div
        class="ml-2 flex items-center gap-1.5 rounded-lg bg-gray-800/60 px-3 py-1.5"
      >
        <UIcon name="i-lucide-link" class="shrink-0 text-gray-600" />
        <input
          v-model="jiraBaseUrl"
          class="text-muted w-52 bg-transparent placeholder-gray-700 outline-none"
          placeholder="https://xxx.atlassian.net"
          spellcheck="false"
        />
      </div>

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
      <button
        class="text-muted flex items-center rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-800 hover:text-gray-300"
        :class="{ 'text-primary-400': showSkillSettings }"
        @click="showSkillSettings = !showSkillSettings"
      >
        <UIcon name="i-heroicons-cube" />
      </button>

      <!-- Mode toggle -->
      <div class="ml-4 flex items-center gap-1 rounded-lg bg-gray-800/60 p-1">
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

        <span v-if="!loading && issues.length > 0" class="text-muted">
          {{ issues.length }} 個任務
        </span>

        <button
          class="text-muted flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-800 hover:text-gray-300"
          :class="{ 'pointer-events-none opacity-50': loading }"
          @click="loadIssues"
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
              <span class="text-muted ml-2 font-mono">{{ c.cwd }}</span>
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
                placeholder="kkday-mobile-member-ci"
                class="focus:ring-primary-500 flex-1 rounded bg-gray-900 px-2 py-1 text-sm text-gray-100 outline-none focus:ring-1"
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

    <!-- Skill settings panel -->
    <div
      v-if="showSkillSettings"
      class="shrink-0 border-b border-gray-800 bg-gray-900/80 p-4"
    >
      <div class="mx-auto max-w-2xl">
        <div class="mb-3 flex items-center justify-between">
          <span class="font-medium text-gray-300">Skills 管理</span>
          <button
            class="text-muted hover:text-gray-300"
            @click="showSkillSettings = false"
          >
            <UIcon name="i-lucide-x" />
          </button>
        </div>

        <div v-if="skillList.length === 0" class="text-muted text-sm">
          載入中...
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="skill in skillList"
            :key="skill.name"
            class="flex items-center gap-3 rounded-lg px-3 py-2"
            :class="skill.enabled ? 'bg-gray-800' : 'bg-gray-800/40'"
          >
            <UCheckbox
              :model-value="skill.enabled"
              @change="toggleSkill(skill.name)"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="font-medium text-gray-200">{{ skill.name }}</span>
                <UBadge
                  :color="skill.source === 'internal' ? 'primary' : 'neutral'"
                  variant="soft"
                  size="sm"
                >
                  {{ skill.source === 'internal' ? '內建' : '外部' }}
                </UBadge>
              </div>
              <p class="text-muted mt-0.5 truncate">{{ skill.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Body: split layout -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Left: issue list -->
      <div
        class="flex w-84 shrink-0 flex-col overflow-hidden border-r border-gray-800"
      >
        <!-- List header -->
        <div
          class="flex h-11 shrink-0 items-center gap-3 border-b border-gray-800 px-4"
        >
          <label
            class="flex cursor-pointer items-center gap-2 select-none"
            :class="{ 'pointer-events-none opacity-40': isRunning || loading }"
          >
            <UCheckbox
              :model-value="allChecked"
              :indeterminate="indeterminate"
              @change="toggleAll"
            />
            <span class="text-muted">全選</span>
          </label>
          <span
            v-if="selectedCount"
            class="text-primary-400 ml-auto font-medium"
          >
            已選 {{ selectedCount }}
          </span>
        </div>

        <!-- Issue list -->
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
              v-for="issue in issues"
              :key="issue.key"
              class="flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors duration-100"
              :class="[
                isRunning
                  ? 'cursor-default opacity-70'
                  : 'cursor-pointer hover:bg-gray-800/60',
                selected.has(issue.key)
                  ? 'ring-primary-500/30 bg-gray-800/80 ring-1'
                  : '',
              ]"
              @click="toggleIssue(issue.key)"
            >
              <UCheckbox
                :model-value="selected.has(issue.key)"
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
                <p class="text-muted truncate leading-snug">
                  {{ issue.summary }}
                </p>
                <div class="mt-1.5">
                  <UBadge
                    :color="statusColor[issue.status] ?? 'neutral'"
                    variant="soft"
                    size="sm"
                  >
                    {{ issue.status }}
                  </UBadge>
                </div>
              </div>
            </button>
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

        <!-- ── Compact status row (always visible when activeJob exists) ── -->
        <RunnerStatusRow
          v-if="activeJob"
          :active-job="activeJob"
          :is-running="isRunning"
          :success-count="successCount"
          :error-count="errorCount"
          :elapsed="elapsed"
          :expanded="rowExpanded"
          :get-item-url="jiraUrl"
          @update:expanded="rowExpanded = $event"
          @cancel="cancelJob"
        />

        <!-- ── 本次結果 ── -->
        <template v-if="rightTab === 'result'">
          <div
            v-if="!activeJob"
            class="flex flex-1 flex-col items-center justify-center gap-3 text-gray-700 select-none"
          >
            <UIcon name="i-lucide-terminal" class="text-5xl" />
            <div class="text-center">
              <p class="font-medium text-gray-600">
                選擇 Issue，點「開始修復」
              </p>
              <p class="text-muted mt-1">Claude Code 會自動修 bug 並建立 PR</p>
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

        <!-- ── 執行過程 ── -->
        <template v-else-if="rightTab === 'progress'">
          <RunnerJobProgress
            :active-job="activeJob"
            class="flex-1 overflow-hidden"
          />
        </template>

        <!-- ── 執行紀錄 ── -->
        <template v-else-if="rightTab === 'history'">
          <RunnerJobHistory
            :history="history"
            :get-item-url="jiraUrl"
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

.text-log {
  font-size: 0.875em;
}

.w-84 {
  width: 21rem;
}
</style>
