<script setup lang="ts">
import type { RunResult } from '~/composables/useRunnerJob';

import { stripAnsi } from '~/composables/useOutputParser';

interface JobDetail {
  id: string;
  trigger?: 'auto' | 'manual';
  status: string;
  startedAt: number;
  durationSecs?: number;
  issues: Array<{ key: string; summary: string }>;
  output?: string;
  results: RunResult[];
}

const route = useRoute();
const jobId = route.params.id as string;

useHead({ title: `Claude Runner — Job ${jobId}` });

const job = ref<JobDetail | null>(null);
const loading = ref(true);
const error = ref('');

async function loadJob() {
  loading.value = true;
  error.value = '';
  try {
    job.value = await $fetch<JobDetail>(`/api/claude-runner/jobs/${jobId}`);
  } catch (error_) {
    error.value = (error_ as Error).message || 'Failed to load job';
  } finally {
    loading.value = false;
  }
}

onMounted(loadJob);

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function fmtDuration(secs?: number): string {
  if (secs === undefined) return '-';
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function issueSummary(key: string): string {
  return job.value?.issues.find((i) => i.key === key)?.summary ?? '';
}

// Full job log expand state
const showFullLog = ref(false);

const statusLabel: Record<string, string> = {
  done: '完成',
  error: '錯誤',
  cancelled: '已取消',
  running: '執行中',
};

const statusColor: Record<string, string> = {
  done: 'bg-green-500/10 text-green-400',
  error: 'bg-red-500/10 text-red-400',
  cancelled: 'bg-gray-500/10 text-[#888]',
  running: 'bg-blue-500/10 text-[#8b5cf6]',
};
</script>

<template>
  <div
    class="flex flex-1 flex-col overflow-auto"
    style="font-family: 'JetBrains Mono', ui-monospace, monospace"
  >
    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-6">
      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-20">
        <UIcon
          name="i-lucide-loader-circle"
          class="h-8 w-8 animate-spin text-[#8b5cf6]"
        />
      </div>

      <!-- Error -->
      <div
        v-else-if="error"
        class="flex flex-col items-center justify-center py-20 text-[#888]"
      >
        <UIcon
          name="i-lucide-alert-circle"
          class="mb-3 text-2xl text-red-500"
        />
        <p class="mb-3 text-sm">{{ error }}</p>
        <NuxtLink
          to="/dashboard"
          class="text-sm text-[#8b5cf6] hover:underline"
        >
          返回 Dashboard
        </NuxtLink>
      </div>

      <!-- Job detail -->
      <template v-else-if="job">
        <!-- Back link -->
        <NuxtLink
          to="/dashboard"
          class="mb-4 inline-flex items-center gap-1.5 text-sm text-[#888] hover:text-gray-300"
        >
          <UIcon name="i-lucide-arrow-left" style="font-size: 0.85em" />
          返回 Dashboard
        </NuxtLink>

        <!-- Header -->
        <div
          class="mb-6 rounded-xl border border-[rgb(255_255_255/6%)] bg-[rgb(255_255_255/2%)] p-5"
        >
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="font-mono text-lg font-semibold text-[#fafafa]">
              {{ job.id.slice(0, 8) }}
            </h1>
            <span
              class="rounded-full px-2.5 py-0.5 text-xs font-medium"
              :class="statusColor[job.status] ?? 'bg-gray-500/10 text-[#888]'"
            >
              {{ statusLabel[job.status] ?? job.status }}
            </span>
            <span
              v-if="job.trigger === 'auto'"
              class="rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs text-orange-400"
            >
              自動觸發
            </span>
            <span
              v-else
              class="rounded-full bg-gray-500/10 px-2.5 py-0.5 text-xs text-[#888]"
            >
              手動觸發
            </span>
          </div>
          <div class="mt-3 flex flex-wrap gap-4 text-xs text-[#888]">
            <span class="flex items-center gap-1.5">
              <UIcon name="i-lucide-clock" />
              {{ fmtTime(job.startedAt) }}
            </span>
            <span class="flex items-center gap-1.5">
              <UIcon name="i-lucide-timer" />
              {{ fmtDuration(job.durationSecs) }}
            </span>
            <span class="flex items-center gap-1.5">
              <UIcon name="i-lucide-list" />
              {{ job.issues.length }} issues
            </span>
            <span class="flex items-center gap-1.5">
              <UIcon name="i-lucide-check-circle" />
              {{ job.results.filter((r) => !r.error).length }}/{{
                job.results.length
              }}
              成功
            </span>
          </div>
        </div>

        <!-- Issue results -->
        <h2 class="mb-3 text-sm font-medium text-[#888]">Issue 結果</h2>
        <div class="mb-6 space-y-4">
          <div
            v-for="result in job.results"
            :key="result.issueKey"
            class="rounded-xl border border-[rgb(255_255_255/6%)] bg-[rgb(255_255_255/2%)] p-4"
          >
            <!-- Issue header -->
            <div class="mb-3 flex items-center gap-3">
              <UIcon
                :name="
                  result.error ? 'i-lucide-x-circle' : 'i-lucide-check-circle'
                "
                :class="result.error ? 'text-red-400' : 'text-green-400'"
              />
              <span class="font-mono text-sm font-semibold text-[#8b5cf6]">
                {{ result.issueKey }}
              </span>
              <span class="truncate text-sm text-[#888]">
                {{ issueSummary(result.issueKey) }}
              </span>
            </div>

            <!-- Error message -->
            <div
              v-if="result.error"
              class="mb-3 rounded-md bg-[rgb(239_68_68/5%)] px-3 py-2 text-xs text-red-400"
            >
              {{ result.error }}
            </div>

            <!-- Phase timeline -->
            <JobPhaseTimeline
              :output="result.output"
              :error="result.error"
              :pr-url="result.prUrl"
            />
          </div>

          <div
            v-if="job.results.length === 0"
            class="py-8 text-center text-sm text-[#444]"
          >
            沒有結果紀錄
          </div>
        </div>

        <!-- Full job log -->
        <div
          v-if="job.output"
          class="rounded-xl border border-[rgb(255_255_255/6%)] bg-[rgb(255_255_255/2%)]"
        >
          <button
            class="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-[#888] transition-colors hover:bg-[rgb(255_255_255/4%)]"
            @click="showFullLog = !showFullLog"
          >
            <UIcon name="i-lucide-terminal" />
            完整 Job Log
            <UIcon
              name="i-lucide-chevron-down"
              class="ml-auto text-[#444] transition-transform duration-200"
              :class="{ 'rotate-180': showFullLog }"
            />
          </button>
          <div
            v-if="showFullLog"
            class="border-t border-[rgb(255_255_255/6%)] px-4 py-3"
          >
            <pre
              class="max-h-[600px] overflow-auto text-xs leading-relaxed whitespace-pre-wrap text-[#888]"
              >{{ stripAnsi(job.output) }}</pre
            >
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
