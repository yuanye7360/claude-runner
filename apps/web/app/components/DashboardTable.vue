<script setup lang="ts">
import type { DetailRow } from '~/composables/useDashboard';

const props = defineProps<{
  jiraBaseUrl?: string;
  rows: DetailRow[];
}>();

// ── Search ──
const search = ref('');
const filteredRows = computed(() => {
  const q = search.value.toLowerCase();
  if (!q) return props.rows;
  return props.rows.filter(
    (r) =>
      r.issueKey.toLowerCase().includes(q) ||
      r.summary.toLowerCase().includes(q),
  );
});

// ── Sort ──
const sortField = ref<'duration' | 'status' | 'time'>('time');
const sortAsc = ref(false);

function toggleSort(field: typeof sortField.value) {
  if (sortField.value === field) {
    sortAsc.value = !sortAsc.value;
  } else {
    sortField.value = field;
    sortAsc.value = false;
  }
}

const sortedRows = computed(() => {
  const rows = [...filteredRows.value];
  const dir = sortAsc.value ? 1 : -1;
  rows.sort((a, b) => {
    if (sortField.value === 'time') return (a.timestamp - b.timestamp) * dir;
    if (sortField.value === 'status')
      return (Number(a.success) - Number(b.success)) * dir;
    if (sortField.value === 'duration')
      return ((a.durationSecs ?? 0) - (b.durationSecs ?? 0)) * dir;
    return 0;
  });
  return rows;
});

// ── Pagination ──
const PAGE_SIZE = 20;
const currentPage = ref(1);
const totalPages = computed(() =>
  Math.max(1, Math.ceil(sortedRows.value.length / PAGE_SIZE)),
);
const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return sortedRows.value.slice(start, start + PAGE_SIZE);
});

// Reset page when search changes
watch(search, () => {
  currentPage.value = 1;
});

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const isToday =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  const time = d.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return isToday
    ? `今天 ${time}`
    : `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

function fmtDuration(secs?: number): string {
  if (secs === undefined) return '-';
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function sortIcon(field: typeof sortField.value): string {
  if (sortField.value !== field) return 'i-lucide-chevrons-up-down';
  return sortAsc.value ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down';
}
</script>

<template>
  <div class="rounded-xl border border-gray-800 bg-gray-900/60">
    <!-- Search bar -->
    <div class="border-b border-gray-800 px-4 py-3">
      <input
        v-model="search"
        class="w-full rounded-md border border-gray-700 bg-gray-800/60 px-3 py-1.5 text-sm text-gray-300 placeholder-gray-600 outline-none focus:border-gray-600"
        placeholder="搜尋 Issue Key 或 Summary..."
      />
    </div>

    <!-- Table -->
    <div class="overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b border-gray-800 text-xs text-gray-500">
            <th
              class="cursor-pointer px-4 py-2 hover:text-gray-300"
              @click="toggleSort('time')"
            >
              <span class="flex items-center gap-1">
                時間
                <UIcon :name="sortIcon('time')" style="font-size: 0.8em" />
              </span>
            </th>
            <th class="px-4 py-2">Issue</th>
            <th class="px-4 py-2">Summary</th>
            <th
              class="cursor-pointer px-4 py-2 hover:text-gray-300"
              @click="toggleSort('status')"
            >
              <span class="flex items-center gap-1">
                狀態
                <UIcon :name="sortIcon('status')" style="font-size: 0.8em" />
              </span>
            </th>
            <th class="px-4 py-2">PR / 錯誤</th>
            <th
              class="cursor-pointer px-4 py-2 hover:text-gray-300"
              @click="toggleSort('duration')"
            >
              <span class="flex items-center gap-1">
                耗時
                <UIcon :name="sortIcon('duration')" style="font-size: 0.8em" />
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in pagedRows"
            :key="`${row.jobId}-${row.issueKey}`"
            class="border-b border-gray-800/50 transition-colors hover:bg-gray-800/30"
          >
            <td class="px-4 py-2 text-xs whitespace-nowrap text-gray-500">
              {{ fmtTime(row.timestamp) }}
            </td>
            <td class="px-4 py-2">
              <a
                v-if="jiraBaseUrl"
                :href="`${jiraBaseUrl}/browse/${row.issueKey}`"
                target="_blank"
                rel="noopener"
                class="font-mono text-xs font-semibold text-blue-400 hover:underline"
              >
                {{ row.issueKey }}
              </a>
              <span
                v-else
                class="font-mono text-xs font-semibold text-blue-400"
              >
                {{ row.issueKey }}
              </span>
            </td>
            <td
              class="max-w-xs truncate px-4 py-2 text-xs text-gray-400"
              :title="row.summary"
            >
              {{ row.summary }}
            </td>
            <td class="px-4 py-2">
              <span
                v-if="row.success"
                class="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400"
              >
                成功
              </span>
              <span
                v-else
                class="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-400"
              >
                失敗
              </span>
            </td>
            <td class="max-w-xs truncate px-4 py-2 text-xs">
              <a
                v-if="row.prUrl"
                :href="row.prUrl"
                target="_blank"
                rel="noopener"
                class="text-blue-400 hover:underline"
              >
                {{ row.prUrl.split('/').slice(-2).join('/') }}
              </a>
              <span
                v-else-if="row.error"
                class="text-red-400"
                :title="row.error"
              >
                {{ row.error.slice(0, 50) }}
              </span>
              <span v-else class="text-gray-600">-</span>
            </td>
            <td class="px-4 py-2 text-xs whitespace-nowrap text-gray-500">
              {{ fmtDuration(row.durationSecs) }}
            </td>
          </tr>
          <tr v-if="pagedRows.length === 0">
            <td colspan="6" class="px-4 py-8 text-center text-gray-600">
              {{ search ? '沒有符合的結果' : '尚無執行紀錄' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div
      v-if="totalPages > 1"
      class="flex items-center justify-between border-t border-gray-800 px-4 py-2 text-xs text-gray-500"
    >
      <span>共 {{ sortedRows.length }} 筆</span>
      <div class="flex items-center gap-2">
        <button
          :disabled="currentPage <= 1"
          class="rounded px-2 py-1 hover:bg-gray-800 disabled:opacity-30"
          @click="currentPage--"
        >
          上一頁
        </button>
        <span>{{ currentPage }} / {{ totalPages }}</span>
        <button
          :disabled="currentPage >= totalPages"
          class="rounded px-2 py-1 hover:bg-gray-800 disabled:opacity-30"
          @click="currentPage++"
        >
          下一頁
        </button>
      </div>
    </div>
  </div>
</template>
