<script setup lang="ts">
import type { HistoryEntry } from '~/composables/useRunnerJob';

defineProps<{
  getItemUrl?: (key: string) => null | string;
  history: HistoryEntry[];
}>();

const emit = defineEmits<{
  clear: [];
}>();

const expandedId = ref<null | string>(null);
const expandedResults = ref<Set<string>>(new Set());

function toggleEntry(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
  // Reset per-result expand state when switching entries
  if (expandedId.value !== id) expandedResults.value.clear();
}

function toggleResult(key: string) {
  if (expandedResults.value.has(key)) {
    expandedResults.value.delete(key);
  } else {
    expandedResults.value.add(key);
  }
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replaceAll(/\u001B\[[\d;?<>!]*[A-Z]/gi, '');
}

function formatDuration(secs?: number) {
  if (!secs) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const time = d.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (isToday) return `今天 ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}
</script>

<template>
  <div class="flex flex-1 flex-col overflow-hidden">
    <!-- Empty state -->
    <div
      v-if="history.length === 0"
      class="flex flex-1 flex-col items-center justify-center gap-3 text-[#444] select-none"
    >
      <UIcon name="i-lucide-clock" class="text-5xl" />
      <p class="text-[#444]">尚無執行紀錄</p>
    </div>

    <template v-else>
      <!-- Header bar -->
      <div
        class="flex h-11 shrink-0 items-center border-b border-[rgb(255_255_255/6%)] px-5"
      >
        <span class="text-muted">共 {{ history.length }} 筆紀錄</span>
        <button
          class="text-muted ml-auto flex items-center gap-1.5 transition-colors hover:text-red-400"
          @click="emit('clear')"
        >
          <UIcon name="i-lucide-trash-2" />
          清除全部
        </button>
      </div>

      <!-- Entry list -->
      <div class="flex-1 space-y-2 overflow-y-auto p-4">
        <div
          v-for="entry in history"
          :key="entry.id"
          class="overflow-hidden rounded-xl border border-[rgb(255_255_255/6%)]"
        >
          <!-- Entry header (toggle) -->
          <button
            class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[rgb(255_255_255/4%)]"
            @click="toggleEntry(entry.id)"
          >
            <UIcon name="i-lucide-clock" class="shrink-0 text-[#444]" />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium text-[#ccc]">{{
                  formatTime(entry.timestamp)
                }}</span>
                <span
                  v-if="entry.trigger === 'auto'"
                  class="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-400"
                >
                  <UIcon name="i-lucide-bot" style="font-size: 0.9em" />
                  自動
                </span>
                <span class="text-muted">·</span>
                <span class="text-muted">{{ entry.issues.length }} 個任務</span>
                <template v-if="entry.durationSecs">
                  <span class="text-muted">·</span>
                  <span class="text-muted flex items-center gap-1">
                    <UIcon name="i-lucide-timer" style="font-size: 0.9em" />
                    {{ formatDuration(entry.durationSecs) }}
                  </span>
                </template>
                <span
                  v-if="entry.status === 'cancelled'"
                  class="flex items-center gap-1 text-yellow-400"
                >
                  <UIcon name="i-lucide-circle-slash" />
                  已中斷
                </span>
                <template v-else>
                  <span class="flex items-center gap-1 text-[#22c55e]">
                    <UIcon name="i-lucide-check" />
                    {{ entry.results.filter((r) => !r.error).length }}
                  </span>
                  <span
                    v-if="entry.results.some((r) => r.error)"
                    class="flex items-center gap-1 text-red-400"
                  >
                    <UIcon name="i-lucide-x" />
                    {{ entry.results.filter((r) => r.error).length }}
                  </span>
                </template>
              </div>
              <p class="text-muted mt-0.5 truncate">
                {{ entry.issues.map((i) => i.key).join('、') }}
              </p>
            </div>
            <UIcon
              name="i-lucide-chevron-down"
              class="shrink-0 text-[#444] transition-transform duration-200"
              :class="{ 'rotate-180': expandedId === entry.id }"
            />
          </button>

          <!-- Expanded content -->
          <div v-if="expandedId === entry.id" class="border-t border-[rgb(255_255_255/6%)]">
            <!-- Per-result collapsible rows -->
            <div
              v-for="r in entry.results"
              :key="r.issueKey"
              class="border-b border-[rgb(255_255_255/4%)] last:border-b-0"
            >
              <!-- Result header -->
              <div
                class="flex cursor-pointer items-center gap-3 px-4 py-2 transition-colors hover:bg-[rgb(255_255_255/4%)]"
                :class="r.error ? 'bg-red-950/20' : 'bg-green-950/10'"
                role="button"
                tabindex="0"
                @click="toggleResult(r.issueKey)"
                @keydown.enter.space="toggleResult(r.issueKey)"
              >
                <UIcon
                  :name="
                    r.error ? 'i-lucide-circle-x' : 'i-lucide-circle-check'
                  "
                  class="shrink-0"
                  :class="r.error ? 'text-red-400' : 'text-[#22c55e]'"
                />
                <component
                  :is="getItemUrl?.(r.issueKey) ? 'a' : 'span'"
                  :href="getItemUrl?.(r.issueKey) ?? undefined"
                  target="_blank"
                  rel="noopener"
                  class="shrink-0 font-mono font-semibold text-[#ccc]"
                  :class="{
                    'underline-offset-2 hover:underline': getItemUrl?.(
                      r.issueKey,
                    ),
                  }"
                  @click.stop
                  >{{ r.issueKey }}</component
                >
                <span class="text-muted flex-1 truncate">
                  {{ entry.issues.find((i) => i.key === r.issueKey)?.summary }}
                </span>
                <a
                  v-if="r.prUrl"
                  :href="r.prUrl"
                  target="_blank"
                  rel="noopener"
                  class="shrink-0 font-medium text-[#8b5cf6] underline-offset-2 hover:underline"
                  @click.stop
                >
                  PR ↗
                </a>
                <span
                  v-else
                  class="shrink-0 text-xs"
                  :class="r.error ? 'text-red-400' : 'text-[#22c55e]'"
                >
                  {{ r.error ? '失敗' : '完成' }}
                </span>
                <UIcon
                  name="i-lucide-chevron-down"
                  class="shrink-0 text-[#444] transition-transform duration-200"
                  :class="{ 'rotate-180': expandedResults.has(r.issueKey) }"
                />
              </div>

              <!-- Collapsible log per result -->
              <div
                v-if="expandedResults.has(r.issueKey)"
                class="bg-[#0a0a0f] px-4 py-3"
              >
                <pre
                  class="text-log max-h-64 overflow-y-auto font-mono leading-relaxed break-all whitespace-pre-wrap text-[#888]"
                  >{{ stripAnsi(r.error || r.output || '（無輸出）') }}</pre
                >
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.text-muted {
  font-size: 0.875em;
  color: #888;
}

.text-log {
  font-size: 0.875em;
}
</style>
