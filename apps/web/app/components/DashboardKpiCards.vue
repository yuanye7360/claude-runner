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
    <div class="rounded-xl border border-[rgb(255_255_255/6%)] bg-[rgb(255_255_255/2%)] px-4 py-3">
      <div class="text-xs text-[#888]">執行次數</div>
      <div class="mt-1 text-2xl font-bold text-[#fafafa]">
        {{ kpi.totalRuns }}
      </div>
      <div class="mt-1 flex gap-2 text-xs text-[#444]">
        <span class="text-[#22c55e]">{{ kpi.successCount }} 成功</span>
        <span class="text-red-400">{{ kpi.failedCount }} 失敗</span>
        <span v-if="kpi.cancelledCount" class="text-[#888]">
          {{ kpi.cancelledCount }} 取消
        </span>
      </div>
    </div>

    <!-- Issues Processed -->
    <div class="rounded-xl border border-[rgb(255_255_255/6%)] bg-[rgb(255_255_255/2%)] px-4 py-3">
      <div class="text-xs text-[#888]">處理 Issue 數</div>
      <div class="mt-1 text-2xl font-bold text-[#fafafa]">
        {{ kpi.issuesProcessed }}
      </div>
      <div class="mt-1 text-xs text-[#444]">
        <span class="text-[#8b5cf6]">{{ kpi.prCreated }}</span> 個建立了 PR
      </div>
    </div>

    <!-- Success Rate -->
    <div class="rounded-xl border border-[rgb(255_255_255/6%)] bg-[rgb(255_255_255/2%)] px-4 py-3">
      <div class="text-xs text-[#888]">成功率</div>
      <div class="mt-1 text-2xl font-bold text-[#fafafa]">
        {{ fmtRate(kpi.successRate) }}
      </div>
      <div class="mt-1 text-xs text-[#444]">依據 Issue 結果計算</div>
    </div>

    <!-- Avg Duration -->
    <div class="rounded-xl border border-[rgb(255_255_255/6%)] bg-[rgb(255_255_255/2%)] px-4 py-3">
      <div class="text-xs text-[#888]">平均耗時</div>
      <div class="mt-1 text-2xl font-bold text-[#fafafa]">
        {{ fmtDuration(kpi.avgDuration) }}
      </div>
      <div class="mt-1 flex gap-2 text-xs text-[#444]">
        <span>最快 {{ fmtDuration(kpi.minDuration) }}</span>
        <span>最慢 {{ fmtDuration(kpi.maxDuration) }}</span>
      </div>
    </div>
  </div>
</template>
