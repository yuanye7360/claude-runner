<script setup lang="ts">
import type { HistoryEntry } from '~/composables/useRunnerJob';

import { useDashboard } from '~/composables/useDashboard';
import { useJiraConfig } from '~/composables/useJiraConfig';

useHead({ title: 'Claude Runner — Dashboard' });

const { config: jiraConfig } = useJiraConfig();

// ── Fetch jobs ──
const jobs = ref<HistoryEntry[]>([]);
const loading = ref(true);

async function loadJobs() {
  loading.value = true;
  try {
    jobs.value = await $fetch<HistoryEntry[]>(
      '/api/claude-runner/jobs?limit=500',
    );
  } catch {
    jobs.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(loadJobs);

const dashboard = useDashboard(jobs);

// ── Custom date range ──
const customStart = ref('');
const customEnd = ref('');

function applyCustomRange() {
  if (customStart.value) {
    const start = new Date(customStart.value).getTime();
    const end = customEnd.value
      ? new Date(customEnd.value).getTime() + 86_400_000
      : Date.now() + 1;
    dashboard.setCustomRange(start, end);
  }
}

const presetLabels: {
  label: string;
  value: 'all' | 'month' | 'today' | 'week';
}[] = [
  { label: '今日', value: 'today' },
  { label: '本週', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '全部', value: 'all' },
];
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
        <span
          class="flex items-center gap-1.5 rounded-md bg-gray-700 px-3 py-1.5 text-sm font-medium text-white"
        >
          <UIcon name="i-lucide-chart-bar" style="font-size: 0.85em" />
          Dashboard
        </span>
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

      <template v-else>
        <!-- Time filter bar -->
        <div class="mb-6 flex items-center gap-2">
          <div class="flex items-center gap-1 rounded-lg bg-gray-800/60 p-1">
            <button
              v-for="p in presetLabels"
              :key="p.value"
              class="rounded-md px-3 py-1.5 text-xs transition-colors"
              :class="
                dashboard.preset.value === p.value &&
                !dashboard.customRange.value
                  ? 'bg-gray-700 font-medium text-white'
                  : 'text-gray-500 hover:text-gray-300'
              "
              @click="dashboard.setPreset(p.value)"
            >
              {{ p.label }}
            </button>
          </div>
          <div class="flex items-center gap-2 text-xs text-gray-500">
            <input
              type="date"
              class="rounded-md border border-gray-700 bg-gray-800/60 px-2 py-1.5 text-xs text-gray-300 outline-none"
              :value="customStart"
              @change="
                (e: Event) => {
                  customStart = (e.target as HTMLInputElement).value;
                  applyCustomRange();
                }
              "
            />
            <span class="text-gray-600">~</span>
            <input
              type="date"
              class="rounded-md border border-gray-700 bg-gray-800/60 px-2 py-1.5 text-xs text-gray-300 outline-none"
              :value="customEnd"
              @change="
                (e: Event) => {
                  customEnd = (e.target as HTMLInputElement).value;
                  applyCustomRange();
                }
              "
            />
          </div>
          <span class="ml-auto text-xs text-gray-600">
            共 {{ dashboard.filtered.value.length }} 筆紀錄
          </span>
        </div>

        <!-- KPI Cards -->
        <DashboardKpiCards :kpi="dashboard.kpi.value" class="mb-6" />

        <!-- Charts -->
        <ClientOnly>
          <DashboardCharts :data="dashboard.chartData.value" class="mb-6" />
        </ClientOnly>

        <!-- Detail Table -->
        <DashboardTable
          :rows="dashboard.detailRows.value"
          :jira-base-url="jiraConfig.baseUrl || undefined"
        />
      </template>
    </div>
  </div>
</template>
