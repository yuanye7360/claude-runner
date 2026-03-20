<script setup lang="ts">
import type { DetailRow } from '~/composables/useDashboard';

const props = defineProps<{
  jiraBaseUrl?: string;
  rows: DetailRow[];
}>();

const emit = defineEmits<{
  (e: 'delete', jobId: string): void;
  (e: 'bulkDelete', jobIds: string[]): void;
}>();

const deleteTarget = ref<null | { issueKey: string; jobId: string }>(null);

function confirmAndDelete() {
  if (!deleteTarget.value) return;
  emit('delete', deleteTarget.value.jobId);
  deleteTarget.value = null;
}

// ── Selection ──
const selected = ref<Set<string>>(new Set());
const bulkDeleteOpen = ref(false);

const allPageSelected = computed(
  () =>
    pagedRows.value.length > 0 &&
    pagedRows.value.every((r) => selected.value.has(r.jobId)),
);

function toggleSelectAll() {
  if (allPageSelected.value) {
    pagedRows.value.forEach((r) => selected.value.delete(r.jobId));
  } else {
    pagedRows.value.forEach((r) => selected.value.add(r.jobId));
  }
  selected.value = new Set(selected.value);
}

function toggleSelect(jobId: string) {
  if (selected.value.has(jobId)) {
    selected.value.delete(jobId);
  } else {
    selected.value.add(jobId);
  }
  selected.value = new Set(selected.value);
}

function confirmBulkDelete() {
  emit('bulkDelete', [...selected.value]);
  selected.value = new Set();
  bulkDeleteOpen.value = false;
}

// Clear selection when rows change
watch(
  () => props.rows,
  () => {
    selected.value = new Set();
  },
);

const typeLabel: Record<string, string> = {
  'claude-runner': 'JIRA',
  'pr-runner': 'PR Runner',
  'pr-review': 'Code Review',
};
const typeColor: Record<string, string> = {
  'claude-runner': 'text-blue-400 bg-blue-500/10',
  'pr-runner': 'text-green-400 bg-green-500/10',
  'pr-review': 'text-purple-400 bg-purple-500/10',
};

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

// Reset page when search or rows change
watch([search, () => props.rows], () => {
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

function goToJob(jobId: string) {
  navigateTo(`/jobs/${jobId}`);
}
</script>

<template>
  <div class="rounded-xl border border-gray-800 bg-gray-900/60">
    <!-- Search bar + bulk actions -->
    <div class="flex items-center gap-3 border-b border-gray-800 px-4 py-3">
      <input
        v-model="search"
        class="flex-1 rounded-md border border-gray-700 bg-gray-800/60 px-3 py-1.5 text-sm text-gray-300 placeholder-gray-600 outline-none focus:border-gray-600"
        placeholder="搜尋 Issue Key 或 Summary..."
      />
      <Transition
        enter-active-class="transition duration-150"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-100"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <button
          v-if="selected.size > 0"
          class="flex shrink-0 items-center gap-1.5 rounded-md bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20"
          @click="bulkDeleteOpen = true"
        >
          <UIcon name="i-lucide-trash-2" style="font-size: 0.85em" />
          刪除已選 ({{ selected.size }})
        </button>
      </Transition>
    </div>

    <!-- Table -->
    <div class="overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b border-gray-800 text-xs text-gray-500">
            <th class="w-10 px-2 py-2" @click.stop>
              <input
                type="checkbox"
                class="accent-primary-500 h-3.5 w-3.5 cursor-pointer rounded"
                :checked="allPageSelected"
                @change="toggleSelectAll"
              />
            </th>
            <th
              class="cursor-pointer px-4 py-2 hover:text-gray-300"
              @click="toggleSort('time')"
            >
              <span class="flex items-center gap-1">
                時間
                <UIcon :name="sortIcon('time')" style="font-size: 0.8em" />
              </span>
            </th>
            <th class="px-4 py-2">類型</th>
            <th class="px-4 py-2">觸發</th>
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
            <th class="w-10 px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in pagedRows"
            :key="`${row.jobId}-${row.issueKey}`"
            class="group cursor-pointer border-b border-gray-800/50 transition-colors hover:bg-gray-800/30"
            :class="selected.has(row.jobId) ? 'bg-gray-800/20' : ''"
            @click="goToJob(row.jobId)"
          >
            <td class="px-2 py-2" @click.stop>
              <input
                type="checkbox"
                class="accent-primary-500 h-3.5 w-3.5 cursor-pointer rounded"
                :checked="selected.has(row.jobId)"
                @change="toggleSelect(row.jobId)"
              />
            </td>
            <td class="px-4 py-2 text-xs whitespace-nowrap text-gray-500">
              {{ fmtTime(row.timestamp) }}
            </td>
            <td class="px-4 py-2">
              <span
                class="rounded-full px-2 py-0.5 text-xs"
                :class="
                  typeColor[row.jobType ?? ''] ?? 'bg-gray-500/10 text-gray-400'
                "
              >
                {{ typeLabel[row.jobType ?? ''] ?? row.jobType ?? '-' }}
              </span>
            </td>
            <td class="px-4 py-2">
              <span
                v-if="row.trigger === 'auto'"
                class="rounded-full bg-orange-500/10 px-2 py-0.5 text-xs text-orange-400"
              >
                自動
              </span>
              <span
                v-else
                class="rounded-full bg-gray-500/10 px-2 py-0.5 text-xs text-gray-400"
              >
                手動
              </span>
            </td>
            <td class="px-4 py-2">
              <a
                v-if="jiraBaseUrl"
                :href="`${jiraBaseUrl}/browse/${row.issueKey}`"
                target="_blank"
                rel="noopener"
                class="font-mono text-xs font-semibold text-blue-400 hover:underline"
                @click.stop
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
                v-if="row.jobStatus === 'cancelled'"
                class="rounded-full bg-gray-500/10 px-2 py-0.5 text-xs text-gray-400"
              >
                已中斷
              </span>
              <span
                v-else-if="row.success"
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
                @click.stop
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
            <td class="px-2 py-2" @click.stop>
              <button
                class="rounded p-1 text-gray-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
                title="刪除"
                @click="
                  deleteTarget = {
                    jobId: row.jobId,
                    issueKey: row.issueKey,
                  }
                "
              >
                <UIcon name="i-lucide-trash-2" style="font-size: 0.85em" />
              </button>
            </td>
          </tr>
          <tr v-if="pagedRows.length === 0" key="empty">
            <td colspan="10" class="px-4 py-8 text-center text-gray-600">
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

    <!-- Single delete confirmation modal -->
    <UModal
      :open="!!deleteTarget"
      @update:open="(v: boolean) => !v && (deleteTarget = null)"
    >
      <template #content>
        <div class="rounded-xl border border-gray-700 bg-gray-900 p-6">
          <div class="mb-3 flex items-center gap-2">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10"
            >
              <UIcon
                name="i-lucide-trash-2"
                class="text-red-400"
                style="font-size: 1em"
              />
            </div>
            <h3 class="text-sm font-semibold text-white">確認刪除</h3>
          </div>
          <p class="mb-3 text-xs text-gray-400">
            確定要刪除此筆紀錄？此操作無法復原。
          </p>
          <p
            v-if="deleteTarget"
            class="mb-4 rounded-md border border-gray-700/50 bg-gray-800/60 px-3 py-2 font-mono text-xs text-gray-300"
          >
            {{ deleteTarget.issueKey }}
          </p>
          <div class="flex justify-end gap-2">
            <UButton size="sm" variant="ghost" @click="deleteTarget = null">
              取消
            </UButton>
            <UButton size="sm" color="error" @click="confirmAndDelete">
              刪除
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Bulk delete confirmation modal -->
    <UModal
      :open="bulkDeleteOpen"
      @update:open="(v: boolean) => !v && (bulkDeleteOpen = false)"
    >
      <template #content>
        <div class="rounded-xl border border-gray-700 bg-gray-900 p-6">
          <div class="mb-3 flex items-center gap-2">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10"
            >
              <UIcon
                name="i-lucide-trash-2"
                class="text-red-400"
                style="font-size: 1em"
              />
            </div>
            <h3 class="text-sm font-semibold text-white">批量刪除</h3>
          </div>
          <p class="mb-4 text-xs text-gray-400">
            確定要刪除已選的
            <span class="font-semibold text-white">{{ selected.size }}</span>
            筆紀錄？此操作無法復原。
          </p>
          <div class="flex justify-end gap-2">
            <UButton size="sm" variant="ghost" @click="bulkDeleteOpen = false">
              取消
            </UButton>
            <UButton size="sm" color="error" @click="confirmBulkDelete">
              刪除 {{ selected.size }} 筆
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
