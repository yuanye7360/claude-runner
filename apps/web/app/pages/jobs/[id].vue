<script setup lang="ts">
import type { RunResult } from '~/composables/useRunnerJob';

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

// ── ANSI stripping ──
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001B\[[0-9;]*[A-Z]/gi;
function stripAnsi(str: string): string {
  return str.replaceAll(ANSI_RE, '');
}

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

// Per-result log expand state
const expandedResults = ref<Set<string>>(new Set());
function toggleResult(key: string) {
  if (expandedResults.value.has(key)) {
    expandedResults.value.delete(key);
  } else {
    expandedResults.value.add(key);
  }
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
  cancelled: 'bg-gray-500/10 text-gray-400',
  running: 'bg-blue-500/10 text-blue-400',
};
</script>

<template>
  <div
    class="flex h-screen flex-col bg-gray-950 text-gray-100"
    style="font-family: 'JetBrains Mono', ui-monospace, monospace"
  >
    <!-- Nav bar -->
    <div
      class="flex h-14 shrink-0 items-center gap-3 border-b border-gray-800 px-5"
    >
      <NuxtLink to="/" class="flex shrink-0 items-center gap-2">
        <span class="text-primary-400">⚡</span>
        <span class="font-semibold text-white">Claude Runner</span>
      </NuxtLink>
      <div class="flex items-center gap-1 rounded-lg bg-gray-800/60 p-1">
        <NuxtLink
          to="/"
          class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-gray-500 transition-colors hover:text-gray-300"
        >
          <UIcon name="i-lucide-bug" style="font-size: 0.85em" />
          Pipeline
        </NuxtLink>
        <NuxtLink
          to="/dashboard"
          class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-gray-500 transition-colors hover:text-gray-300"
        >
          <UIcon name="i-lucide-chart-bar" style="font-size: 0.85em" />
          Dashboard
        </NuxtLink>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-6">
      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-20">
        <UIcon
          name="i-lucide-loader-circle"
          class="text-primary-400 h-8 w-8 animate-spin"
        />
      </div>

      <!-- Error -->
      <div
        v-else-if="error"
        class="flex flex-col items-center justify-center py-20 text-gray-500"
      >
        <UIcon
          name="i-lucide-alert-circle"
          class="mb-3 text-2xl text-red-500"
        />
        <p class="mb-3 text-sm">{{ error }}</p>
        <NuxtLink to="/dashboard" class="text-sm text-blue-400 hover:underline">
          返回 Dashboard
        </NuxtLink>
      </div>

      <!-- Job detail -->
      <template v-else-if="job">
        <!-- Back link -->
        <NuxtLink
          to="/dashboard"
          class="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300"
        >
          <UIcon name="i-lucide-arrow-left" style="font-size: 0.85em" />
          返回 Dashboard
        </NuxtLink>

        <!-- Header -->
        <div class="mb-6 rounded-xl border border-gray-800 bg-gray-900/60 p-5">
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="font-mono text-lg font-semibold text-white">
              {{ job.id.slice(0, 8) }}
            </h1>
            <span
              class="rounded-full px-2.5 py-0.5 text-xs font-medium"
              :class="statusColor[job.status] ?? 'bg-gray-500/10 text-gray-400'"
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
              class="rounded-full bg-gray-500/10 px-2.5 py-0.5 text-xs text-gray-400"
            >
              手動觸發
            </span>
          </div>
          <div class="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
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
        <h2 class="mb-3 text-sm font-medium text-gray-400">Issue 結果</h2>
        <div class="mb-6 space-y-2">
          <div
            v-for="result in job.results"
            :key="result.issueKey"
            class="rounded-xl border border-gray-800 bg-gray-900/60"
          >
            <!-- Result header -->
            <button
              class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-800/40"
              @click="toggleResult(result.issueKey)"
            >
              <UIcon
                :name="
                  result.error ? 'i-lucide-x-circle' : 'i-lucide-check-circle'
                "
                :class="result.error ? 'text-red-400' : 'text-green-400'"
              />
              <span class="font-mono text-sm font-semibold text-blue-400">
                {{ result.issueKey }}
              </span>
              <span class="truncate text-sm text-gray-400">
                {{ issueSummary(result.issueKey) }}
              </span>
              <a
                v-if="result.prUrl"
                :href="result.prUrl"
                target="_blank"
                rel="noopener"
                class="ml-auto shrink-0 text-xs text-blue-400 hover:underline"
                @click.stop
              >
                {{ result.prUrl.split('/').slice(-2).join('/') }}
              </a>
              <UIcon
                name="i-lucide-chevron-down"
                class="ml-auto shrink-0 text-gray-600 transition-transform duration-200"
                :class="{ 'rotate-180': expandedResults.has(result.issueKey) }"
              />
            </button>

            <!-- Expanded output -->
            <div
              v-if="expandedResults.has(result.issueKey)"
              class="border-t border-gray-800 px-4 py-3"
            >
              <div
                v-if="result.error"
                class="mb-2 rounded-md bg-red-500/5 px-3 py-2 text-xs text-red-400"
              >
                {{ result.error }}
              </div>
              <pre
                v-if="result.output"
                class="max-h-80 overflow-auto text-xs leading-relaxed whitespace-pre-wrap text-gray-400"
                >{{ stripAnsi(result.output) }}</pre
              >
              <p v-else class="text-xs text-gray-600">（無輸出）</p>
            </div>
          </div>

          <div
            v-if="job.results.length === 0"
            class="py-8 text-center text-sm text-gray-600"
          >
            沒有結果紀錄
          </div>
        </div>

        <!-- Full job log -->
        <div
          v-if="job.output"
          class="rounded-xl border border-gray-800 bg-gray-900/60"
        >
          <button
            class="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-gray-400 transition-colors hover:bg-gray-800/40"
            @click="showFullLog = !showFullLog"
          >
            <UIcon name="i-lucide-terminal" />
            完整 Job Log
            <UIcon
              name="i-lucide-chevron-down"
              class="ml-auto text-gray-600 transition-transform duration-200"
              :class="{ 'rotate-180': showFullLog }"
            />
          </button>
          <div v-if="showFullLog" class="border-t border-gray-800 px-4 py-3">
            <pre
              class="max-h-[600px] overflow-auto text-xs leading-relaxed whitespace-pre-wrap text-gray-400"
              >{{ stripAnsi(job.output) }}</pre
            >
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
