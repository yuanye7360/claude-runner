<script setup lang="ts">
import type { JiraIssue } from '~/composables/useJiraRunner';
import type { AnalysisResult } from '~/composables/useTaskAnalyzer';

import { labelColor } from '~/composables/labelColor';
import { STATUS_COLOR } from '~/composables/useJiraRunner';

defineProps<{
  allChecked: boolean;
  analysing: boolean;
  analysisResult: AnalysisResult | null;
  answers: Array<{ answer: string; question: string }>;
  indeterminate: boolean;
  isRunning: boolean;
  issues: JiraIssue[];
  jiraConfigured: boolean;
  jiraLabels: string[];
  jiraUrl: (key: string) => null | string;
  loadError: string;
  loading: boolean;
  needsInput: boolean;
  selected: Set<string>;
  selectedCount: number;
  starting: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggleIssue', key: string): void;
  (e: 'toggleAll'): void;
  (e: 'loadIssues'): void;
  (e: 'runClaude'): void;
  (e: 'openConfig'): void;
  (e: 'submitAnswer', question: string, answer: string): void;
  (e: 'analyzeThenRun'): void;
  (e: 'runWithAnalysis'): void;
  (e: 'resetAnalysis'): void;
}>();
</script>

<template>
  <!-- Select all -->
  <div class="flex items-center gap-3 border-b border-gray-800/60 px-4 py-1.5">
    <label
      class="flex cursor-pointer items-center gap-2 select-none"
      :class="{
        'pointer-events-none opacity-40': isRunning || loading,
      }"
    >
      <UCheckbox
        :model-value="allChecked"
        :indeterminate="indeterminate"
        @change="emit('toggleAll')"
      />
      <span class="text-xs text-gray-500">全選</span>
    </label>
    <span
      v-if="selectedCount"
      class="ml-auto text-xs font-medium text-blue-400"
    >
      已選 {{ selectedCount }}
    </span>
  </div>

  <!-- Issue list -->
  <div class="flex-1 overflow-y-auto">
    <!-- Not configured hint -->
    <div
      v-if="!jiraConfigured"
      class="flex flex-col items-center gap-3 p-6 text-center"
    >
      <UIcon name="i-lucide-link" class="text-2xl text-gray-600" />
      <p class="text-xs text-gray-500">尚未設定 JIRA 連線</p>
      <UButton size="xs" variant="soft" @click="emit('openConfig')">
        前往設定
      </UButton>
    </div>

    <div v-else-if="loading" class="space-y-1.5 p-2">
      <div
        v-for="n in 5"
        :key="n"
        class="h-12 animate-pulse rounded-lg bg-gray-800/50"
      ></div>
    </div>

    <div v-else-if="loadError" class="p-4 text-center">
      <UIcon name="i-lucide-wifi-off" class="mb-2 text-xl text-red-500" />
      <p class="mb-2 text-xs text-gray-500">{{ loadError }}</p>
      <UButton size="xs" @click="emit('loadIssues')">重試</UButton>
    </div>

    <div v-else-if="issues.length === 0" class="p-6 text-center text-gray-600">
      <UIcon name="i-lucide-inbox" class="mb-2 text-2xl" />
      <p class="text-xs">沒有待處理的 Issue</p>
    </div>

    <div v-else class="space-y-1 p-2">
      <div
        v-for="issue in issues"
        :key="issue.key"
        role="button"
        tabindex="0"
        class="group flex w-full items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-all duration-150"
        :class="[
          isRunning
            ? 'cursor-default opacity-70'
            : 'cursor-pointer hover:-translate-y-px hover:border-gray-700/50 hover:bg-gray-800/60 hover:shadow-lg hover:shadow-black/20',
          selected.has(issue.key) ? 'border-blue-500/20 bg-blue-500/5' : '',
        ]"
        @click="emit('toggleIssue', issue.key)"
      >
        <UCheckbox
          :model-value="selected.has(issue.key)"
          class="pointer-events-none mt-0.5 shrink-0"
        />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <a
              v-if="issue.url || jiraUrl(issue.key)"
              :href="issue.url || jiraUrl(issue.key)!"
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
          <div
            v-if="issue.labels?.filter((l) => !jiraLabels.includes(l)).length"
            class="mt-1 flex flex-wrap gap-1"
          >
            <span
              v-for="label in issue.labels.filter(
                (l) => !jiraLabels.includes(l),
              )"
              :key="label"
              class="rounded px-1.5 py-0.5 text-xs"
              :class="labelColor(label)"
            >
              {{ label }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Analysis Result -->
  <div v-if="analysing" class="shrink-0 border-t border-gray-800 px-3 py-2">
    <div class="flex items-center gap-2 text-gray-400">
      <UIcon name="i-lucide-loader-circle" class="h-4 w-4 animate-spin" />
      <span>分析中...</span>
    </div>
  </div>

  <div
    v-if="analysisResult && !analysing"
    class="shrink-0 space-y-3 border-t border-gray-800 px-3 py-2"
  >
    <div class="flex items-center gap-2">
      <span class="text-sm text-gray-400">复杂度：</span>
      <UBadge
        :color="
          analysisResult.complexity === 'simple'
            ? 'success'
            : analysisResult.complexity === 'medium'
              ? 'warning'
              : 'error'
        "
        variant="soft"
        size="xs"
      >
        {{ analysisResult.complexity }}
      </UBadge>
      <span class="ml-2 text-sm text-gray-400">方式：</span>
      <UBadge color="info" variant="soft" size="xs">
        {{ analysisResult.suggestedWorkflow }}
      </UBadge>
    </div>

    <p class="text-sm text-gray-300">{{ analysisResult.summary }}</p>

    <div v-if="analysisResult.repos.length > 0" class="text-sm">
      <span class="text-gray-400">Repos：</span>
      <span
        v-for="r in analysisResult.repos"
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
    <div v-if="needsInput" class="space-y-2 border-t border-gray-700 pt-3">
      <p class="text-sm font-medium text-yellow-400">需要确认：</p>
      <div
        v-for="(q, idx) in analysisResult.missingInfo"
        :key="idx"
        class="space-y-1"
      >
        <p class="text-sm text-gray-300">{{ q }}</p>
        <UInput
          :model-value="answers.find((a) => a.question === q)?.answer ?? ''"
          placeholder="回答..."
          size="sm"
          @update:model-value="(v: string) => emit('submitAnswer', q, v)"
        />
      </div>
      <UButton size="sm" @click="emit('analyzeThenRun')"> 重新分析 </UButton>
    </div>

    <!-- Proceed button -->
    <div v-if="!needsInput" class="flex gap-2 border-t border-gray-700 pt-3">
      <UButton size="sm" @click="emit('runWithAnalysis')"> 继续执行 </UButton>
      <UButton size="sm" variant="ghost" @click="emit('resetAnalysis')">
        取消
      </UButton>
    </div>
  </div>

  <!-- Run button -->
  <div
    data-tour="run-button"
    class="shrink-0 border-t border-gray-800 px-3 py-2"
  >
    <UButton
      class="w-full justify-center"
      size="sm"
      :disabled="!selectedCount || isRunning || starting"
      :loading="isRunning || starting"
      icon="i-lucide-zap"
      @click="emit('runClaude')"
    >
      {{
        starting
          ? '準備中...'
          : isRunning
            ? '修復中...'
            : `開始修復${selectedCount ? ` (${selectedCount})` : ''}`
      }}
    </UButton>
  </div>
</template>
