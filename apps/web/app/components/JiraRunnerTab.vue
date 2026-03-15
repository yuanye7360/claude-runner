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
  (e: 'openSettings'): void;
}>();

const { jiraHeaders, isConfigured: jiraConfigured } = useJiraConfig();
const { repoConfigs } = useRepoConfigs();

const onboarding = useOnboarding({
  jiraConfigured,
  repoCount: computed(() => repoConfigs.value.length),
  skillCount: computed(() => props.enabledSkillNames.length),
  openSettings: () => emit('openSettings'),
});

const jira = useJiraRunner({
  mode: toRef(props, 'mode'),
  enabledSkillNames: toRef(props, 'enabledSkillNames'),
  jiraHeaders,
  onPrCreated: (urls) => emit('prCreated', urls),
});

defineExpose({
  loadIssues: jira.loadIssues,
  loadHistory: jira.loadHistory,
  cr: jira.cr,
});
</script>

<template>
  <div class="flex flex-1 overflow-hidden">
    <!-- Left: Issue list (full height) -->
    <div
      class="flex w-96 shrink-0 flex-col overflow-hidden border-r border-gray-800"
    >
      <!-- Header -->
      <div
        class="flex h-11 shrink-0 items-center gap-2 border-b border-gray-800 px-4"
      >
        <span class="text-sm font-medium text-gray-300">JIRA Issues</span>
        <span
          v-if="!jira.loading.value && jira.issues.value.length > 0"
          class="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400"
        >
          {{ jira.issues.value.length }}
        </span>
        <div class="ml-auto flex items-center gap-1">
          <button
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
          <UButton size="xs" variant="soft" @click="emit('openSettings')">
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
          <p class="mb-2 text-xs text-gray-500">{{ jira.loadError.value }}</p>
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
          <UButton size="sm" @click="jira.analyzeThenRun()"> 重新分析 </UButton>
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
                jira.issues.value.filter((i) => jira.selected.value.has(i.key)),
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
          @click="jira.analyzeThenRun()"
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
  </div>
</template>
