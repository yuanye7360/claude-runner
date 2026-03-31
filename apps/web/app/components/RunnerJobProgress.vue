<script setup lang="ts">
import type { ActiveJob } from '~/composables/useRunnerJob';

const props = defineProps<{
  activeJob: ActiveJob | null;
}>();

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replaceAll(/\u001B\[[\d;?<>!]*[A-Z]/gi, '');
}

const expandedKeys = ref<Set<string>>(new Set());

// Auto-expand issues when they first appear with progress
watch(
  () => {
    if (!props.activeJob) return null;
    return Object.entries(props.activeJob.phasesByIssue).map(
      ([key, phases]) => ({
        key,
        phase: phases.find((p) => p.status === 'running')?.phase ?? -1,
        allDone: phases.length > 0 && phases.every((p) => p.status === 'done'),
      }),
    );
  },
  (current, prev) => {
    if (!current) return;
    for (const { key, phase, allDone } of current) {
      const prevEntry = prev?.find((p) => p.key === key);
      if (!prevEntry) {
        if (phase >= 1 || allDone) expandedKeys.value.add(key);
      } else if (phase >= 1 && (prevEntry.phase ?? -1) <= 0) {
        expandedKeys.value.add(key);
      }
    }
  },
  { deep: true, immediate: true },
);

function toggleExpanded(key: string) {
  if (expandedKeys.value.has(key)) expandedKeys.value.delete(key);
  else expandedKeys.value.add(key);
}

const issueEntries = computed(() => {
  if (!props.activeJob) return [];
  return props.activeJob.issues.map((issue) => {
    const phases = props.activeJob!.phasesByIssue[issue.key] ?? [];
    const currentPhase = phases.find((p) => p.status === 'running');
    const allDone =
      phases.length > 0 && phases.every((p) => p.status === 'done');
    const isQueued = currentPhase !== undefined && currentPhase.phase === 0;
    const output =
      props.activeJob!.outputByIssue[issue.key] ||
      (props.activeJob!.issues.length === 1 ? props.activeJob!.output : '');
    return {
      key: issue.key,
      summary: issue.summary,
      phases,
      currentPhase,
      allDone,
      isQueued,
      output,
    };
  });
});

// Sorted: running > queued > done
const sortedIssueEntries = computed(() => {
  return [...issueEntries.value].toSorted((a, b) => {
    const order = (e: (typeof issueEntries.value)[0]) => {
      if (e.currentPhase && e.currentPhase.phase > 0) return 0;
      if (e.isQueued) return 1;
      if (e.allDone) return 2;
      return 1;
    };
    return order(a) - order(b);
  });
});

// Auto-scroll the active log
const logEls = ref<Record<string, HTMLElement>>({});

function setLogRef(key: string, el: HTMLElement | null) {
  if (el) logEls.value[key] = el;
  else delete logEls.value[key];
}

watch(
  () => issueEntries.value.map((e) => e.output),
  () => {
    nextTick(() => {
      for (const el of Object.values(logEls.value)) {
        el.scrollTop = el.scrollHeight;
      }
    });
  },
);

/** Filter out phase 0 (queued) */
function visiblePhases(phases: (typeof issueEntries.value)[0]['phases']) {
  return phases.filter((p) => p.phase > 0);
}

// Show/hide raw log per issue
const showRawLog = ref<Set<string>>(new Set());
function toggleRawLog(key: string) {
  if (showRawLog.value.has(key)) showRawLog.value.delete(key);
  else showRawLog.value.add(key);
}
</script>

<template>
  <!-- Empty state -->
  <div
    v-if="!activeJob"
    class="flex flex-1 flex-col items-center justify-center gap-3 text-[#444] select-none"
  >
    <UIcon name="i-lucide-terminal" class="text-5xl" />
    <p class="text-[#444]">尚無執行中的工作</p>
  </div>

  <!-- Active job -->
  <div v-else class="flex flex-1 flex-col overflow-y-auto">
    <div
      v-for="entry in sortedIssueEntries"
      :key="entry.key"
      class="border-b border-[rgb(255_255_255/6%)] last:border-b-0"
    >
      <!-- Header -->
      <div
        class="interactive flex cursor-pointer items-center gap-3 px-4 py-3"
        role="button"
        tabindex="0"
        :aria-expanded="expandedKeys.has(entry.key)"
        @click="toggleExpanded(entry.key)"
        @keydown.enter.space="toggleExpanded(entry.key)"
      >
        <!-- Status icon -->
        <UIcon
          v-if="entry.currentPhase && entry.currentPhase.phase > 0"
          name="i-lucide-loader-circle"
          class="shrink-0 animate-spin text-[#8b5cf6]"
        />
        <UIcon
          v-else-if="entry.isQueued"
          name="i-lucide-clock"
          class="shrink-0 text-[#555]"
        />
        <UIcon
          v-else-if="entry.allDone"
          name="i-lucide-circle-check"
          class="shrink-0 text-[#22c55e]"
        />
        <UIcon v-else name="i-lucide-circle-dot" class="shrink-0 text-[#444]" />

        <!-- Issue key + summary -->
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span
              class="shrink-0 font-mono text-sm font-semibold text-[#fafafa]"
            >
              {{ entry.key }}
            </span>
            <span
              v-if="entry.currentPhase && entry.currentPhase.phase > 0"
              class="text-xs text-[#8b5cf6]"
            >
              {{ entry.currentPhase.label }}
            </span>
            <span v-else-if="entry.isQueued" class="text-xs text-[#555]"
              >排隊中</span
            >
            <span v-else-if="entry.allDone" class="text-xs text-[#22c55e]"
              >完成</span
            >
          </div>
          <p
            v-if="entry.summary"
            class="mt-0.5 truncate text-[11px] text-[#555]"
          >
            {{ entry.summary }}
          </p>
        </div>

        <!-- Phase dots -->
        <div class="flex items-center gap-1.5">
          <div
            v-for="p in visiblePhases(entry.phases)"
            :key="p.phase"
            class="h-2 w-2 rounded-full"
            :class="{
              'bg-[#22c55e]': p.status === 'done',
              'animate-pulse bg-[#8b5cf6]': p.status === 'running',
              'bg-[#333]': p.status === 'pending',
            }"
            :title="p.label"
          ></div>
        </div>

        <UIcon
          name="i-lucide-chevron-down"
          class="shrink-0 text-[#444] transition-transform duration-200"
          :class="{ 'rotate-180': expandedKeys.has(entry.key) }"
        />
      </div>

      <!-- Expanded: Phase Timeline -->
      <div
        v-if="expandedKeys.has(entry.key)"
        class="border-t border-[rgb(255_255_255/4%)] px-4 py-3"
        style="background: rgb(255 255 255 / 1%)"
      >
        <!-- Phase timeline (vertical) -->
        <div class="relative pl-7">
          <!-- Vertical line -->
          <div
            class="absolute top-2 bottom-2 left-[9px] w-px"
            style="background: rgb(255 255 255 / 6%)"
          ></div>

          <div
            v-for="p in visiblePhases(entry.phases)"
            :key="p.phase"
            class="relative mb-3 last:mb-0"
          >
            <!-- Status dot -->
            <div
              class="absolute top-[3px] -left-7 flex h-[18px] w-[18px] items-center justify-center rounded-full"
              :class="{
                'bg-[rgb(34_197_94/10%)]': p.status === 'done',
                'bg-[rgb(139_92_246/15%)]': p.status === 'running',
                'bg-[rgb(255_255_255/4%)]': p.status === 'pending',
              }"
            >
              <span
                v-if="p.status === 'done'"
                class="text-[10px] text-[#22c55e]"
                >✓</span
              >
              <span
                v-else-if="p.status === 'running'"
                class="animate-pulse text-[10px] text-[#8b5cf6]"
                >●</span
              >
              <span v-else class="text-[10px] text-[#444]">○</span>
            </div>

            <!-- Phase card -->
            <div
              class="rounded-lg border p-2.5"
              :class="{
                'border-[rgb(34_197_94/10%)]': p.status === 'done',
                'border-[rgb(139_92_246/15%)]': p.status === 'running',
                'border-[rgb(255_255_255/4%)]': p.status === 'pending',
              }"
              :style="{
                background:
                  p.status === 'running'
                    ? 'rgb(139 92 246 / 3%)'
                    : 'rgb(255 255 255 / 1%)',
              }"
            >
              <div class="flex items-center gap-2">
                <span
                  class="text-xs font-medium"
                  :class="{
                    'text-[#22c55e]': p.status === 'done',
                    'text-[#8b5cf6]': p.status === 'running',
                    'text-[#444]': p.status === 'pending',
                  }"
                >
                  {{ p.label }}
                </span>
                <span
                  class="rounded px-1.5 py-0.5 text-[9px]"
                  :class="{
                    'bg-[rgb(34_197_94/8%)] text-[#22c55e]':
                      p.status === 'done',
                    'bg-[rgb(139_92_246/10%)] text-[#8b5cf6]':
                      p.status === 'running',
                    'bg-[rgb(255_255_255/4%)] text-[#444]':
                      p.status === 'pending',
                  }"
                >
                  {{
                    p.status === 'done'
                      ? 'done'
                      : p.status === 'running'
                        ? 'running...'
                        : 'pending'
                  }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Running log (only for current phase) -->
        <div
          v-if="entry.output && !entry.allDone"
          class="mt-3 rounded-lg border border-[rgb(139_92_246/10%)] p-3"
          style="background: rgb(139 92 246 / 2%)"
        >
          <div class="mb-2 flex items-center gap-2 text-[10px] text-[#8b5cf6]">
            <UIcon name="i-lucide-terminal" class="text-[10px]" />
            <span class="font-medium">即時輸出</span>
            <div
              class="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-[#8b5cf6]"
            ></div>
          </div>
          <pre
            :ref="(el) => setLogRef(entry.key, el as HTMLElement)"
            class="max-h-48 overflow-y-auto font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-[#888]"
            >{{ stripAnsi(entry.output.slice(-2000)) }}</pre
          >
        </div>

        <!-- Completed: show raw log toggle -->
        <div v-if="entry.allDone && entry.output" class="mt-3">
          <button
            class="interactive flex items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] text-[#555] hover:text-[#888]"
            @click="toggleRawLog(entry.key)"
          >
            <UIcon name="i-lucide-terminal" class="text-[10px]" />
            完整 Log
            <UIcon
              name="i-lucide-chevron-down"
              class="text-[10px] transition-transform duration-150"
              :class="{ 'rotate-180': showRawLog.has(entry.key) }"
            />
          </button>
          <pre
            v-if="showRawLog.has(entry.key)"
            class="mt-2 max-h-60 overflow-y-auto rounded-lg p-3 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-[#666]"
            style="background: rgb(0 0 0 / 30%)"
            >{{ stripAnsi(entry.output) }}</pre
          >
        </div>
      </div>
    </div>
  </div>
</template>
