<script setup lang="ts">
import { useJiraConfig } from '~/composables/useJiraConfig';
import { STATUS_COLOR, useJiraRunner } from '~/composables/useJiraRunner';
import { useOnboarding } from '~/composables/useOnboarding';
import { useRepoConfigs } from '~/composables/useRepoConfigs';

const props = defineProps<{
  enabledSkillNames: string[];
  mode: 'normal' | 'smart';
}>();

const emit = defineEmits<{
  (e: 'prCreated', urls: string[]): void;
}>();

const {
  config: jiraConfig,
  jiraHeaders,
  isConfigured: jiraConfigured,
} = useJiraConfig();
const {
  repoConfigs,
  editingConfig,
  newConfig,
  startEditConfig,
  saveConfig,
  cancelEdit,
  deleteConfig,
  validatePath,
  testConnection,
  validateRepo,
} = useRepoConfigs();

const onboarding = useOnboarding({
  jiraConfigured,
  repoCount: computed(() => repoConfigs.value.length),
  skillCount: computed(() => props.enabledSkillNames.length),
  openSettings: () => {
    showConfig.value = true;
  },
});

const jira = useJiraRunner({
  mode: toRef(props, 'mode'),
  enabledSkillNames: toRef(props, 'enabledSkillNames'),
  jiraHeaders,
  onPrCreated: (urls) => emit('prCreated', urls),
});

// ── Config panel toggle ──
const showConfig = ref(!jiraConfigured.value);

// ── Label input ──
const newLabelInput = ref('');
function addLabel() {
  const val = newLabelInput.value.trim();
  if (val && !jiraConfig.value.labels.includes(val)) {
    jiraConfig.value.labels.push(val);
  }
  newLabelInput.value = '';
}

// ── Repo modal state ──
const showRepoModal = computed(() => editingConfig.value !== null);
const modalPathResult = ref<null | { error?: string; valid: boolean }>(null);
const modalConnResult = ref<null | { error?: string; valid: boolean }>(null);
const validating = ref(false);
const testing = ref(false);
const saveError = ref<null | string>(null);
const confirmDelete = ref<null | string>(null);

function openNewRepo() {
  modalPathResult.value = null;
  modalConnResult.value = null;
  saveError.value = null;
  newConfig();
}

function openEditRepo(repo: (typeof repoConfigs.value)[0]) {
  modalPathResult.value = null;
  modalConnResult.value = null;
  saveError.value = null;
  startEditConfig(repo);
}

async function onValidatePath() {
  if (!editingConfig.value?.cwd) return;
  validating.value = true;
  modalPathResult.value = await validatePath(editingConfig.value.cwd);
  validating.value = false;
}

async function onTestConnection() {
  if (!editingConfig.value?.githubRepo) return;
  testing.value = true;
  modalConnResult.value = await testConnection(editingConfig.value.githubRepo);
  testing.value = false;
}

async function onSaveRepo() {
  try {
    saveError.value = null;
    await saveConfig();
    modalPathResult.value = null;
    modalConnResult.value = null;
  } catch (error: unknown) {
    saveError.value = error instanceof Error ? error.message : 'Failed to save';
  }
}

async function onDeleteRepo(id: string) {
  try {
    await deleteConfig(id);
    confirmDelete.value = null;
  } catch {
    // silently handle
  }
}

defineExpose({
  loadIssues: jira.loadIssues,
  loadHistory: jira.loadHistory,
  cr: jira.cr,
});
</script>

<template>
  <div class="flex flex-1 overflow-hidden">
    <!-- Left: Issue list / Config panel -->
    <div
      class="flex w-96 shrink-0 flex-col overflow-hidden border-r border-gray-800"
    >
      <!-- Header -->
      <div
        class="flex h-11 shrink-0 items-center gap-2 border-b border-gray-800 px-4"
      >
        <span class="text-sm font-medium text-gray-300">
          {{ showConfig ? 'JIRA 設定' : 'JIRA Issues' }}
        </span>
        <span
          v-if="
            !showConfig && !jira.loading.value && jira.issues.value.length > 0
          "
          class="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400"
        >
          {{ jira.issues.value.length }}
        </span>
        <div class="ml-auto flex items-center gap-1">
          <button
            v-if="!showConfig"
            class="flex items-center rounded px-1.5 py-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
            :class="{ 'pointer-events-none opacity-50': jira.loading.value }"
            @click="jira.loadIssues()"
          >
            <UIcon
              name="i-lucide-refresh-cw"
              :class="{ 'animate-spin': jira.loading.value }"
              style="font-size: 0.85em"
            />
          </button>
          <div class="relative">
            <button
              class="relative flex items-center rounded px-1.5 py-1 transition-colors"
              :class="
                showConfig
                  ? 'text-primary-400 bg-primary-500/10'
                  : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
              "
              title="JIRA 設定"
              @click="showConfig = !showConfig"
            >
              <UIcon name="i-lucide-settings-2" style="font-size: 0.85em" />
              <!-- Pulse dot when not configured -->
              <span
                v-if="!jiraConfigured && !showConfig"
                class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5"
              >
                <span
                  class="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75"
                ></span>
                <span
                  class="relative inline-flex h-2.5 w-2.5 rounded-full bg-orange-500"
                ></span>
              </span>
            </button>
            <!-- Tooltip arrow pointing to gear -->
            <div
              v-if="!jiraConfigured && !showConfig"
              class="absolute top-full right-0 z-10 mt-2 w-44 rounded-lg border border-orange-500/30 bg-gray-900 px-3 py-2 text-xs text-orange-300 shadow-lg"
            >
              <div
                class="absolute -top-1.5 right-2 h-3 w-3 rotate-45 border-t border-l border-orange-500/30 bg-gray-900"
              ></div>
              點此設定 JIRA 連線和 Repos
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ Config panel ═══ -->
      <div v-if="showConfig" class="flex-1 overflow-y-auto">
        <div class="space-y-4 p-4">
          <!-- ── Section 1: JIRA 連線 ── -->
          <div>
            <div
              class="mb-2 flex items-center gap-2 text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              JIRA 連線
              <span
                v-if="jiraConfigured"
                class="inline-block h-1.5 w-1.5 rounded-full bg-green-500"
              ></span>
              <span
                v-else
                class="inline-block h-1.5 w-1.5 rounded-full bg-gray-600"
              ></span>
            </div>
            <div class="space-y-2">
              <input
                v-model="jiraConfig.baseUrl"
                class="w-full rounded-md border border-gray-700 bg-gray-800/60 px-2.5 py-1.5 text-xs text-gray-300 placeholder-gray-600 outline-none focus:border-gray-600"
                placeholder="https://yourorg.atlassian.net"
              />
              <input
                v-model="jiraConfig.email"
                class="w-full rounded-md border border-gray-700 bg-gray-800/60 px-2.5 py-1.5 text-xs text-gray-300 placeholder-gray-600 outline-none focus:border-gray-600"
                placeholder="you@company.com"
              />
              <input
                v-model="jiraConfig.apiToken"
                type="password"
                class="w-full rounded-md border border-gray-700 bg-gray-800/60 px-2.5 py-1.5 text-xs text-gray-300 placeholder-gray-600 outline-none focus:border-gray-600"
                placeholder="ATATT3x..."
              />
            </div>
          </div>

          <!-- ── Section 2: Repos ── -->
          <div>
            <div
              class="mb-2 flex items-center justify-between text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              <span class="flex items-center gap-1.5">
                Repos
                <span
                  v-if="repoConfigs.length > 0"
                  class="font-normal text-gray-600 normal-case"
                >
                  ({{ repoConfigs.length }})
                </span>
              </span>
              <button
                class="rounded px-1.5 py-0.5 text-xs text-blue-400 normal-case transition-colors hover:bg-blue-500/10"
                @click="openNewRepo()"
              >
                + 新增
              </button>
            </div>

            <div v-if="repoConfigs.length === 0" class="py-4 text-center">
              <p class="text-xs text-gray-600">尚無 Repo</p>
            </div>

            <div v-else class="space-y-1.5">
              <div
                v-for="repo in repoConfigs"
                :key="repo.id"
                class="group rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2 transition-colors hover:border-gray-700"
              >
                <div class="flex items-center justify-between">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                      <span class="text-xs font-medium text-white">{{
                        repo.name
                      }}</span>
                      <span
                        v-if="repo.validationStatus === 'valid'"
                        class="text-xs text-green-500"
                        >✓</span
                      >
                      <span
                        v-else-if="repo.validationStatus === 'invalid'"
                        class="text-xs text-red-500"
                        >✗</span
                      >
                    </div>
                    <div class="mt-0.5 truncate text-xs text-gray-600">
                      {{ repo.githubRepo }} · {{ repo.cwd }}
                    </div>
                  </div>
                  <div
                    class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <button
                      class="rounded p-1 text-gray-600 hover:text-gray-400"
                      title="驗證"
                      @click="validateRepo(repo.id)"
                    >
                      <UIcon
                        name="i-lucide-shield-check"
                        style="font-size: 0.8em"
                      />
                    </button>
                    <button
                      class="rounded p-1 text-gray-600 hover:text-gray-400"
                      title="編輯"
                      @click="openEditRepo(repo)"
                    >
                      <UIcon name="i-lucide-pencil" style="font-size: 0.8em" />
                    </button>
                    <button
                      v-if="confirmDelete !== repo.id"
                      class="rounded p-1 text-gray-600 hover:text-red-400"
                      title="刪除"
                      @click="confirmDelete = repo.id"
                    >
                      <UIcon name="i-lucide-trash-2" style="font-size: 0.8em" />
                    </button>
                    <button
                      v-else
                      class="rounded bg-red-600/10 p-1 text-red-400"
                      @click="onDeleteRepo(repo.id)"
                    >
                      <UIcon name="i-lucide-check" style="font-size: 0.8em" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ── Section 3: JIRA Labels ── -->
          <div>
            <div
              class="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              JIRA Labels
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              <span
                v-for="(lbl, idx) in jiraConfig.labels"
                :key="idx"
                class="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-400"
              >
                {{ lbl }}
                <button
                  class="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-blue-500/20 hover:text-blue-300"
                  @click="jiraConfig.labels.splice(idx, 1)"
                >
                  <UIcon name="i-lucide-x" style="font-size: 0.7em" />
                </button>
              </span>
              <input
                v-model="newLabelInput"
                class="w-24 min-w-0 flex-1 rounded-md border border-gray-700 bg-gray-800/60 px-2 py-1 text-xs text-gray-300 placeholder-gray-600 outline-none focus:border-gray-600"
                placeholder="新增 label..."
                @keydown.enter.prevent="addLabel()"
              />
            </div>
          </div>
        </div>

        <!-- Done button -->
        <div class="shrink-0 border-t border-gray-800 px-4 py-3">
          <button
            class="w-full rounded-md py-1.5 text-xs font-medium transition-colors"
            :class="
              jiraConfigured
                ? 'bg-primary-600 hover:bg-primary-500 text-white'
                : 'cursor-not-allowed bg-gray-800 text-gray-600'
            "
            :disabled="!jiraConfigured"
            @click="
              showConfig = false;
              jira.loadIssues();
            "
          >
            {{ jiraConfigured ? '完成設定' : '請填寫 JIRA 連線資訊' }}
          </button>
        </div>
      </div>

      <!-- ═══ Issue list (when not showing config) ═══ -->
      <template v-else>
        <!-- Select all -->
        <div
          class="flex items-center gap-3 border-b border-gray-800/60 px-4 py-1.5"
        >
          <label
            class="flex cursor-pointer items-center gap-2 select-none"
            :class="{
              'pointer-events-none opacity-40':
                jira.cr.isRunning.value || jira.loading.value,
            }"
          >
            <UCheckbox
              :model-value="jira.allChecked.value"
              :indeterminate="jira.indeterminate.value"
              @change="jira.toggleAllIssues()"
            />
            <span class="text-xs text-gray-500">全選</span>
          </label>
          <span
            v-if="jira.selectedCount.value"
            class="ml-auto text-xs font-medium text-blue-400"
          >
            已選 {{ jira.selectedCount.value }}
          </span>
        </div>

        <!-- Issue list (full remaining height) -->
        <div class="flex-1 overflow-y-auto">
          <!-- Not configured hint -->
          <div
            v-if="!jiraConfigured"
            class="flex flex-col items-center gap-3 p-6 text-center"
          >
            <UIcon name="i-lucide-link" class="text-2xl text-gray-600" />
            <p class="text-xs text-gray-500">尚未設定 JIRA 連線</p>
            <UButton size="xs" variant="soft" @click="showConfig = true">
              前往設定
            </UButton>
          </div>

          <div v-else-if="jira.loading.value" class="space-y-1.5 p-2">
            <div
              v-for="n in 5"
              :key="n"
              class="h-12 animate-pulse rounded-lg bg-gray-800/50"
            ></div>
          </div>

          <div v-else-if="jira.loadError.value" class="p-4 text-center">
            <UIcon name="i-lucide-wifi-off" class="mb-2 text-xl text-red-500" />
            <p class="mb-2 text-xs text-gray-500">
              {{ jira.loadError.value }}
            </p>
            <UButton size="xs" @click="jira.loadIssues()">重試</UButton>
          </div>

          <div
            v-else-if="jira.issues.value.length === 0"
            class="p-6 text-center text-gray-600"
          >
            <UIcon name="i-lucide-inbox" class="mb-2 text-2xl" />
            <p class="text-xs">沒有待處理的 Issue</p>
          </div>

          <div v-else class="space-y-1 p-2">
            <div
              v-for="issue in jira.issues.value"
              :key="issue.key"
              role="button"
              tabindex="0"
              class="group flex w-full items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-all duration-150"
              :class="[
                jira.cr.isRunning.value
                  ? 'cursor-default opacity-70'
                  : 'cursor-pointer hover:-translate-y-px hover:border-gray-700/50 hover:bg-gray-800/60 hover:shadow-lg hover:shadow-black/20',
                jira.selected.value.has(issue.key)
                  ? 'border-blue-500/20 bg-blue-500/5'
                  : '',
              ]"
              @click="jira.toggleIssue(issue.key)"
            >
              <UCheckbox
                :model-value="jira.selected.value.has(issue.key)"
                class="pointer-events-none mt-0.5 shrink-0"
              />
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <a
                    v-if="issue.url || jira.jiraUrl(issue.key)"
                    :href="issue.url || jira.jiraUrl(issue.key)!"
                    target="_blank"
                    rel="noopener"
                    class="shrink-0 font-mono text-sm font-semibold text-blue-400 underline-offset-2 hover:underline"
                    @click.stop
                    >{{ issue.key }}</a
                  >
                  <span
                    v-else
                    class="shrink-0 font-mono text-sm font-semibold text-blue-400"
                    >{{ issue.key }}</span
                  >
                  <UBadge
                    :color="STATUS_COLOR[issue.status] ?? 'neutral'"
                    variant="soft"
                    size="xs"
                  >
                    {{ issue.status }}
                  </UBadge>
                </div>
                <p class="mt-1 truncate text-sm leading-snug text-gray-400">
                  {{ issue.summary }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Analysis Result -->
        <div
          v-if="jira.analyzer.analysing.value"
          class="shrink-0 border-t border-gray-800 px-3 py-2"
        >
          <div class="flex items-center gap-2 text-gray-400">
            <UIcon name="i-lucide-loader-circle" class="h-4 w-4 animate-spin" />
            <span>分析中...</span>
          </div>
        </div>

        <div
          v-if="
            jira.analyzer.analysisResult.value && !jira.analyzer.analysing.value
          "
          class="shrink-0 space-y-3 border-t border-gray-800 px-3 py-2"
        >
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-400">复杂度：</span>
            <UBadge
              :color="
                jira.analyzer.analysisResult.value.complexity === 'simple'
                  ? 'success'
                  : jira.analyzer.analysisResult.value.complexity === 'medium'
                    ? 'warning'
                    : 'error'
              "
              variant="soft"
              size="xs"
            >
              {{ jira.analyzer.analysisResult.value.complexity }}
            </UBadge>
            <span class="ml-2 text-sm text-gray-400">方式：</span>
            <UBadge color="info" variant="soft" size="xs">
              {{ jira.analyzer.analysisResult.value.suggestedWorkflow }}
            </UBadge>
          </div>

          <p class="text-sm text-gray-300">
            {{ jira.analyzer.analysisResult.value.summary }}
          </p>

          <div
            v-if="jira.analyzer.analysisResult.value.repos.length > 0"
            class="text-sm"
          >
            <span class="text-gray-400">Repos：</span>
            <span
              v-for="r in jira.analyzer.analysisResult.value.repos"
              :key="r.path"
              class="ml-1 text-gray-300"
            >
              {{ r.path.split('/').pop() }}
              <span v-if="r.confidence === 'low'" class="text-yellow-500"
                >(low confidence)</span
              >
            </span>
          </div>

          <!-- Missing Info Q&A -->
          <div
            v-if="jira.analyzer.needsInput.value"
            class="space-y-2 border-t border-gray-700 pt-3"
          >
            <p class="text-sm font-medium text-yellow-400">需要确认：</p>
            <div
              v-for="(q, idx) in jira.analyzer.analysisResult.value.missingInfo"
              :key="idx"
              class="space-y-1"
            >
              <p class="text-sm text-gray-300">{{ q }}</p>
              <UInput
                :model-value="
                  jira.analyzer.answers.value.find((a) => a.question === q)
                    ?.answer ?? ''
                "
                placeholder="回答..."
                size="sm"
                @update:model-value="
                  (v: string) => jira.analyzer.submitAnswer(q, v)
                "
              />
            </div>
            <UButton size="sm" @click="jira.analyzeThenRun()">
              重新分析
            </UButton>
          </div>

          <!-- Proceed button when no missing info -->
          <div
            v-if="!jira.analyzer.needsInput.value"
            class="flex gap-2 border-t border-gray-700 pt-3"
          >
            <UButton
              size="sm"
              @click="
                jira.runClaudeWithAnalysis(
                  jira.issues.value.filter((i) =>
                    jira.selected.value.has(i.key),
                  ),
                  jira.analyzer.analysisResult.value!,
                )
              "
            >
              继续执行
            </UButton>
            <UButton size="sm" variant="ghost" @click="jira.analyzer.reset()">
              取消
            </UButton>
          </div>
        </div>

        <!-- Run button (pinned to bottom) -->
        <div class="shrink-0 border-t border-gray-800 px-3 py-2">
          <UButton
            class="w-full justify-center"
            size="sm"
            :disabled="
              !jira.selectedCount.value ||
              jira.cr.isRunning.value ||
              jira.starting.value
            "
            :loading="jira.cr.isRunning.value || jira.starting.value"
            icon="i-lucide-zap"
            @click="jira.runClaude()"
          >
            {{
              jira.starting.value
                ? '準備中...'
                : jira.cr.isRunning.value
                  ? '修復中...'
                  : `開始修復${jira.selectedCount.value ? ` (${jira.selectedCount.value})` : ''}`
            }}
          </UButton>
        </div>
      </template>
    </div>

    <!-- Right: JIRA detail panel -->
    <div class="flex flex-1 flex-col overflow-hidden">
      <!-- Tab bar -->
      <div class="flex shrink-0 items-center border-b border-gray-800 px-1">
        <button
          class="-mb-px flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm transition-colors"
          :class="
            jira.rightTab.value === 'progress'
              ? 'border-primary-500 font-medium text-white'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          "
          @click="jira.rightTab.value = 'progress'"
        >
          <UIcon
            v-if="jira.cr.isRunning.value"
            name="i-lucide-loader-circle"
            class="text-primary-400 animate-spin"
            style="font-size: 0.8em"
          />
          執行過程
        </button>
        <button
          class="-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors"
          :class="
            jira.rightTab.value === 'history'
              ? 'border-primary-500 font-medium text-white'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          "
          @click="jira.rightTab.value = 'history'"
        >
          執行紀錄
          <span
            v-if="jira.history.value.length > 0"
            class="rounded-full bg-gray-700 px-1.5 py-0.5 text-xs leading-none text-gray-400"
          >
            {{ jira.history.value.length }}
          </span>
        </button>
        <div class="ml-auto pr-2">
          <UTooltip text="使用指引">
            <button
              class="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
              @click="
                onboarding.reset();
                jira.rightTab.value = 'progress';
              "
            >
              <UIcon name="i-lucide-circle-help" />
            </button>
          </UTooltip>
        </div>
      </div>

      <!-- Status row -->
      <RunnerStatusRow
        v-if="jira.cr.activeJob.value"
        :active-job="jira.cr.activeJob.value"
        :is-running="jira.cr.isRunning.value"
        :success-count="jira.cr.successCount.value"
        :error-count="jira.cr.errorCount.value"
        :elapsed="jira.cr.elapsed.value"
        :expanded="jira.rowExpanded.value"
        :get-item-url="jira.jiraUrl"
        @update:expanded="jira.rowExpanded.value = $event"
        @cancel="jira.cr.cancelJob"
      />

      <!-- Progress -->
      <template v-if="jira.rightTab.value === 'progress'">
        <RunnerJobProgress
          v-if="jira.cr.activeJob.value"
          :active-job="jira.cr.activeJob.value"
          class="flex-1 overflow-hidden"
        />
        <!-- Preparing / Analyzing state -->
        <div
          v-else-if="jira.starting.value || jira.analyzer.analysing.value"
          class="flex flex-1 flex-col items-center justify-center gap-4 select-none"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="text-primary-400 h-10 w-10 animate-spin"
          />
          <div class="text-center">
            <p class="font-medium text-gray-300">
              {{
                jira.analyzer.analysing.value
                  ? '分析 Issue 中...'
                  : '準備執行...'
              }}
            </p>
            <p class="mt-1 text-xs text-gray-500">正在規劃修復策略，請稍候</p>
          </div>
        </div>
        <OnboardingChecklist
          v-else-if="onboarding.showChecklist.value"
          :steps="onboarding.steps"
          :completed-count="onboarding.completedCount.value"
          @dismiss="onboarding.dismiss()"
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
      <template v-else-if="jira.rightTab.value === 'history'">
        <RunnerJobHistory
          :history="jira.history.value"
          :get-item-url="jira.jiraUrl"
          @clear="jira.clearHistory()"
        />
      </template>
    </div>

    <!-- ═══ Repo Modal (teleported) ═══ -->
    <Teleport to="body">
      <div
        v-if="showRepoModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        @click.self="cancelEdit()"
      >
        <div
          class="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl"
        >
          <h2 class="mb-4 text-base font-semibold text-white">
            {{ editingConfig?.id ? '編輯 Repo' : '新增 Repo' }}
          </h2>

          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-xs text-gray-500">名稱</label>
              <input
                v-model="editingConfig!.name"
                class="w-full rounded-md border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-gray-300 placeholder-gray-600 outline-none focus:border-gray-600"
                placeholder="b2c-web"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs text-gray-500"
                >GitHub Repo</label
              >
              <input
                v-model="editingConfig!.githubRepo"
                class="w-full rounded-md border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-gray-300 placeholder-gray-600 outline-none focus:border-gray-600"
                placeholder="kkday-it/kkday-b2c-web"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs text-gray-500">Label</label>
              <input
                v-model="editingConfig!.label"
                class="w-full rounded-md border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-gray-300 placeholder-gray-600 outline-none focus:border-gray-600"
                placeholder="b2c-web"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs text-gray-500">本機路徑</label>
              <input
                v-model="editingConfig!.cwd"
                class="w-full rounded-md border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-gray-300 placeholder-gray-600 outline-none focus:border-gray-600"
                placeholder="/Users/you/KKday/kkday-b2c-web"
              />
            </div>
          </div>

          <div class="mt-4 flex flex-wrap gap-2">
            <button
              class="rounded-md border border-blue-600 px-3 py-1.5 text-xs text-blue-400 transition-colors hover:bg-blue-600/10"
              :disabled="!editingConfig?.cwd || validating"
              @click="onValidatePath()"
            >
              {{ validating ? '驗證中...' : '驗證路徑' }}
            </button>
            <button
              class="rounded-md border border-blue-600 px-3 py-1.5 text-xs text-blue-400 transition-colors hover:bg-blue-600/10 disabled:cursor-not-allowed disabled:text-gray-600"
              :disabled="!editingConfig?.githubRepo || testing"
              @click="onTestConnection()"
            >
              {{ testing ? '測試中...' : '測試 GitHub 連線' }}
            </button>
          </div>

          <div v-if="modalPathResult" class="mt-2 text-xs">
            <span v-if="modalPathResult.valid" class="text-green-400"
              >✓ 路徑有效</span
            >
            <span v-else class="text-red-400"
              >✗ {{ modalPathResult.error }}</span
            >
          </div>
          <div v-if="modalConnResult" class="mt-1 text-xs">
            <span v-if="modalConnResult.valid" class="text-green-400"
              >✓ GitHub 連線成功</span
            >
            <span v-else class="text-red-400"
              >✗ {{ modalConnResult.error }}</span
            >
          </div>

          <div class="mt-6 flex justify-end gap-3">
            <button
              class="rounded-md px-4 py-2 text-sm text-gray-400 transition-colors hover:text-gray-300"
              @click="cancelEdit()"
            >
              取消
            </button>
            <button
              class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              :disabled="
                !editingConfig?.name ||
                !editingConfig?.githubRepo ||
                !editingConfig?.label ||
                !editingConfig?.cwd
              "
              @click="onSaveRepo()"
            >
              儲存
            </button>
          </div>
          <p v-if="saveError" class="mt-2 text-sm text-red-400">
            {{ saveError }}
          </p>
        </div>
      </div>
    </Teleport>
  </div>
</template>
