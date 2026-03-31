<script setup lang="ts">
import { useAutoRun } from '~/composables/useAutoRun';
import { useJiraConfig } from '~/composables/useJiraConfig';
import { useJiraRunner } from '~/composables/useJiraRunner';
import { useTransitionDialog } from '~/composables/useTransitionDialog';

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
const jira = useJiraRunner({
  mode: toRef(props, 'mode'),
  enabledSkillNames: toRef(props, 'enabledSkillNames'),
  jiraHeaders,
  onPrCreated: (urls) => emit('prCreated', urls),
});

// ── Auto-run ──
const autoRun = useAutoRun({
  jiraConfig,
  jiraHeaders,
  jiraConfigured,
  isRunning: jira.cr.isRunning,
  startJob: jira.cr.startJob,
});

watch(autoRun.enabled, (val) => {
  if (val) {
    autoRun.startPoll(connectJob);
    connectAutoRunJob();
  } else {
    autoRun.stopPoll();
  }
});

function connectJob(job: {
  id: string;
  issues: { key: string; summary: string }[];
}) {
  jira.cr.startJob(job.id, job.issues, undefined, 'auto');
  jira.rightTab.value = 'progress';
  jira.rowExpanded.value = true;
  useToast().add({
    title: '自動執行中',
    description: job.issues.map((i) => i.key).join(', '),
    color: 'info',
  });
}

async function connectAutoRunJob() {
  const job = await autoRun.checkJobs();
  if (job) {
    connectJob(job);
  }
}

onMounted(async () => {
  await autoRun.loadSettings();
  if (autoRun.enabled.value) {
    autoRun.startPoll(connectJob);
    connectAutoRunJob();
  }
});

onUnmounted(() => {
  autoRun.stopPoll();
});

// ── Transition dialog ──
const transitionDialog = useTransitionDialog({ jiraHeaders });

async function handleCancel() {
  const job = jira.cr.activeJob.value;
  if (!job) return;
  await transitionDialog.handleCancel(
    { trigger: job.trigger, issues: job.issues },
    () => jira.cr.cancelJob(),
  );
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
      class="flex w-96 shrink-0 flex-col overflow-hidden border-r border-[rgb(255_255_255/6%)]"
    >
      <!-- Header -->
      <div
        class="flex h-11 shrink-0 items-center gap-2 border-b border-[rgb(255_255_255/6%)] px-4"
      >
        <span class="text-sm font-medium text-[#ccc]">JIRA Issues</span>
        <span
          v-if="!jira.loading.value && jira.issues.value.length > 0"
          class="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-[#8b5cf6]"
        >
          {{ jira.issues.value.length }}
        </span>
        <div class="ml-auto flex items-center gap-1">
          <button
            class="flex items-center rounded px-1.5 py-1 text-[#888] transition-colors hover:bg-[rgb(255_255_255/4%)] hover:text-[#ccc]"
            :class="{ 'pointer-events-none opacity-50': jira.loading.value }"
            @click="jira.loadIssues()"
          >
            <UIcon
              name="i-lucide-refresh-cw"
              :class="{ 'animate-spin': jira.loading.value }"
              style="font-size: 0.85em"
            />
          </button>
          <div class="relative" data-tour="jira-settings">
            <NuxtLink
              to="/repos?tab=integrations"
              class="relative flex items-center rounded px-1.5 py-1 text-[#888] transition-colors hover:bg-[rgb(255_255_255/4%)] hover:text-[#ccc]"
              title="JIRA 設定"
            >
              <UIcon name="i-lucide-settings-2" style="font-size: 0.85em" />
              <span
                v-if="!jiraConfigured"
                class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5"
              >
                <span
                  class="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75"
                ></span>
                <span
                  class="relative inline-flex h-2.5 w-2.5 rounded-full bg-orange-500"
                ></span>
              </span>
            </NuxtLink>
            <div
              v-if="!jiraConfigured"
              class="absolute top-full right-0 z-10 mt-2 w-44 rounded-lg border border-orange-500/30 bg-[rgb(255_255_255/2%)] px-3 py-2 text-xs text-orange-300 shadow-lg"
            >
              <div
                class="absolute -top-1.5 right-2 h-3 w-3 rotate-45 border-t border-l border-orange-500/30 bg-[rgb(255_255_255/2%)]"
              ></div>
              前往 Settings 設定 JIRA 連線
            </div>
          </div>
        </div>
      </div>

      <!-- Issue list -->
      <JiraIssueList
        :issues="jira.issues.value"
        :selected="jira.selected.value"
        :selected-count="jira.selectedCount.value"
        :all-checked="jira.allChecked.value"
        :indeterminate="jira.indeterminate.value"
        :loading="jira.loading.value"
        :load-error="jira.loadError.value"
        :is-running="jira.cr.isRunning.value"
        :starting="jira.starting.value"
        :jira-configured="jiraConfigured"
        :jira-labels="jiraConfig.labels"
        :analysing="jira.analyzer.analysing.value"
        :analysis-result="jira.analyzer.analysisResult.value"
        :needs-input="jira.analyzer.needsInput.value"
        :answers="jira.analyzer.answers.value"
        :jira-url="jira.jiraUrl"
        @toggle-issue="jira.toggleIssue($event)"
        @toggle-all="jira.toggleAllIssues()"
        @load-issues="jira.loadIssues()"
        @run-claude="jira.runClaude()"
        @open-config="navigateTo('/repos?tab=integrations')"
          @submit-answer="
            (q: string, a: string) => jira.analyzer.submitAnswer(q, a)
          "
          @analyze-then-run="jira.analyzeThenRun()"
          @run-with-analysis="
            jira.runClaudeWithAnalysis(
              jira.issues.value.filter((i) => jira.selected.value.has(i.key)),
              jira.analyzer.analysisResult.value!,
            )
          "
          @reset-analysis="jira.analyzer.reset()"
        />
    </div>

    <!-- Right: JIRA detail panel -->
    <div class="flex flex-1 flex-col overflow-hidden">
      <!-- Tab bar -->
      <div
        class="flex shrink-0 items-center border-b border-[rgb(255_255_255/6%)] px-1"
      >
        <button
          class="-mb-px flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm transition-colors"
          :class="
            jira.rightTab.value === 'progress'
              ? 'border-primary-500 font-medium text-[#fafafa]'
              : 'border-transparent text-[#888] hover:text-[#ccc]'
          "
          @click="jira.rightTab.value = 'progress'"
        >
          <UIcon
            v-if="jira.cr.isRunning.value"
            name="i-lucide-loader-circle"
            class="animate-spin text-[#8b5cf6]"
            style="font-size: 0.8em"
          />
          執行過程
        </button>
        <button
          class="-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors"
          :class="
            jira.rightTab.value === 'history'
              ? 'border-primary-500 font-medium text-[#fafafa]'
              : 'border-transparent text-[#888] hover:text-[#ccc]'
          "
          @click="jira.rightTab.value = 'history'"
        >
          執行紀錄
          <span
            v-if="jira.history.value.length > 0"
            class="rounded-full bg-[#444] px-1.5 py-0.5 text-xs leading-none text-[#888]"
          >
            {{ jira.history.value.length }}
          </span>
        </button>
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
        @cancel="handleCancel"
      />

      <!-- Progress -->
      <template v-if="jira.rightTab.value === 'progress'">
        <RunnerJobProgress
          v-if="jira.cr.activeJob.value"
          :active-job="jira.cr.activeJob.value"
          class="flex-1 overflow-hidden"
        />
        <div
          v-else-if="jira.starting.value || jira.analyzer.analysing.value"
          class="flex flex-1 flex-col items-center justify-center gap-4 select-none"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="h-10 w-10 animate-spin text-[#8b5cf6]"
          />
          <div class="text-center">
            <p class="font-medium text-[#ccc]">
              {{
                jira.analyzer.analysing.value
                  ? '分析 Issue 中...'
                  : '準備執行...'
              }}
            </p>
            <p class="mt-1 text-xs text-[#888]">正在規劃修復策略，請稍候</p>
          </div>
        </div>
        <div
          v-else
          class="flex flex-1 flex-col items-center justify-center gap-3 text-[#444] select-none"
        >
          <UIcon name="i-lucide-bug" class="text-5xl" />
          <div class="text-center">
            <p class="font-medium text-[#444]">
              從左側選擇 JIRA Issue，開始自動修復
            </p>
            <p class="mt-1 text-xs text-[#444]">
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

    <!-- Transition Dialog -->
    <JiraTransitionDialog
      :open="transitionDialog.showDialog.value"
      :issue-keys="transitionDialog.cancelledIssueKeys.value"
      :transitioning="transitionDialog.transitioning.value"
      @confirm="transitionDialog.transitionToOpen()"
      @dismiss="transitionDialog.dismiss()"
    />
  </div>
</template>
