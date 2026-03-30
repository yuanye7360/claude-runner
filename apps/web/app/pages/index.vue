<script setup lang="ts">
import type { HistoryEntry } from '~/composables/useRunnerJob';

useHead({ title: 'Claude Runner — Overview' });

const recentJobs = ref<HistoryEntry[]>([]);
const loading = ref(true);

async function loadRecentJobs() {
  loading.value = true;
  try {
    recentJobs.value = await $fetch<HistoryEntry[]>(
      '/api/claude-runner/jobs?limit=10',
    );
  } catch {
    recentJobs.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(loadRecentJobs);

function fmtTimeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}

const statusColor: Record<string, string> = {
  done: '#22c55e',
  error: '#f59e0b',
  cancelled: '#444',
  running: '#8b5cf6',
};
</script>

<template>
  <div class="flex flex-1 flex-col overflow-auto p-6">
    <!-- Status cards -->
    <div class="mb-6 grid grid-cols-3 gap-3">
      <NuxtLink
        to="/jira-runner"
        class="group rounded-[10px] border p-4 transition-colors duration-150"
        style="
          background: rgb(139 92 246 / 6%);
          border-color: rgb(139 92 246 / 15%);
        "
      >
        <div class="mb-2 flex items-center justify-between">
          <span
            class="text-[10px] font-medium tracking-wider text-[#888] uppercase"
            >JIRA Issues</span
          >
          <span
            class="text-[9px] text-[#8b5cf6] opacity-0 transition-opacity group-hover:opacity-100"
            >→</span
          >
        </div>
        <div
          class="text-2xl font-bold tracking-tight text-[#fafafa] tabular-nums"
        >
          —
        </div>
        <div class="mt-1 text-[10px] text-[#444]">Open the page to view</div>
      </NuxtLink>

      <NuxtLink
        to="/pr-runner"
        class="group rounded-[10px] border p-4 transition-colors duration-150"
        style="
          background: rgb(6 182 212 / 6%);
          border-color: rgb(6 182 212 / 15%);
        "
      >
        <div class="mb-2 flex items-center justify-between">
          <span
            class="text-[10px] font-medium tracking-wider text-[#888] uppercase"
            >PR Runner</span
          >
          <span
            class="text-[9px] text-[#06b6d4] opacity-0 transition-opacity group-hover:opacity-100"
            >→</span
          >
        </div>
        <div
          class="text-2xl font-bold tracking-tight text-[#fafafa] tabular-nums"
        >
          —
        </div>
        <div class="mt-1 text-[10px] text-[#444]">Open the page to view</div>
      </NuxtLink>

      <NuxtLink
        to="/pr-review"
        class="group rounded-[10px] border p-4 transition-colors duration-150"
        style="
          background: rgb(34 197 94 / 6%);
          border-color: rgb(34 197 94 / 15%);
        "
      >
        <div class="mb-2 flex items-center justify-between">
          <span
            class="text-[10px] font-medium tracking-wider text-[#888] uppercase"
            >Code Review</span
          >
          <span
            class="text-[9px] text-[#22c55e] opacity-0 transition-opacity group-hover:opacity-100"
            >→</span
          >
        </div>
        <div
          class="text-2xl font-bold tracking-tight text-[#fafafa] tabular-nums"
        >
          —
        </div>
        <div class="mt-1 text-[10px] text-[#444]">Open the page to view</div>
      </NuxtLink>
    </div>

    <!-- Recent Activity -->
    <div>
      <h2
        class="mb-3 text-[10px] font-medium tracking-wider text-[#888] uppercase"
      >
        Recent Activity
      </h2>

      <div v-if="loading" class="py-8 text-center text-xs text-[#444]">
        Loading...
      </div>

      <div
        v-else-if="recentJobs.length === 0"
        class="py-8 text-center text-xs text-[#444]"
      >
        No recent activity
      </div>

      <div v-else class="flex flex-col gap-1">
        <NuxtLink
          v-for="job in recentJobs"
          :key="job.id"
          :to="`/jobs/${job.id}`"
          class="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-[rgba(255,255,255,0.02)]"
        >
          <span
            class="h-1.5 w-1.5 shrink-0 rounded-full"
            :class="{ 'animate-pulse': job.status === 'running' }"
            :style="{ background: statusColor[job.status] || '#444' }"
          ></span>
          <span class="flex-1 truncate text-xs text-[#ccc]">
            {{ job.issues.map((i) => i.key).join(', ') || job.id.slice(0, 8) }}
          </span>
          <span
            class="shrink-0 rounded px-1.5 py-0.5 text-[9px]"
            :style="{
              background: `${statusColor[job.status] || '#444'}15`,
              color: statusColor[job.status] || '#444',
            }"
          >
            {{ job.status }}
          </span>
          <span class="shrink-0 text-[10px] text-[#444] tabular-nums">
            {{ fmtTimeAgo(job.timestamp) }}
          </span>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
