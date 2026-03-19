<script setup lang="ts">
import type { Kpi } from '~/composables/useDashboard';

defineProps<{ kpi: Kpi }>();

function fmtDuration(secs: number): string {
  if (secs === 0) return '-';
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtRate(rate: number): string {
  return rate === 0 ? '-' : `${rate.toFixed(1)}%`;
}
</script>

<template>
  <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
    <!-- Total Runs -->
    <div class="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
      <div class="text-xs text-gray-500">執行次數</div>
      <div class="mt-1 text-2xl font-bold text-white">
        {{ kpi.totalRuns }}
      </div>
      <div class="mt-1 flex gap-2 text-xs text-gray-600">
        <span class="text-green-500">{{ kpi.successCount }} 成功</span>
        <span class="text-red-400">{{ kpi.failedCount }} 失敗</span>
        <span v-if="kpi.cancelledCount" class="text-gray-500">
          {{ kpi.cancelledCount }} 取消
        </span>
      </div>
    </div>

    <!-- Issues Processed -->
    <div class="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
      <div class="text-xs text-gray-500">處理 Issue 數</div>
      <div class="mt-1 text-2xl font-bold text-white">
        {{ kpi.issuesProcessed }}
      </div>
      <div class="mt-1 text-xs text-gray-600">
        <span class="text-blue-400">{{ kpi.prCreated }}</span> 個建立了 PR
      </div>
    </div>

    <!-- Success Rate -->
    <div class="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
      <div class="text-xs text-gray-500">成功率</div>
      <div class="mt-1 text-2xl font-bold text-white">
        {{ fmtRate(kpi.successRate) }}
      </div>
      <div class="mt-1 text-xs text-gray-600">依據 Issue 結果計算</div>
    </div>

    <!-- Avg Duration -->
    <div class="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
      <div class="text-xs text-gray-500">平均耗時</div>
      <div class="mt-1 text-2xl font-bold text-white">
        {{ fmtDuration(kpi.avgDuration) }}
      </div>
      <div class="mt-1 flex gap-2 text-xs text-gray-600">
        <span>最快 {{ fmtDuration(kpi.minDuration) }}</span>
        <span>最慢 {{ fmtDuration(kpi.maxDuration) }}</span>
      </div>
    </div>
  </div>
</template>
