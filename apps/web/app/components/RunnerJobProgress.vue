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

// Auto-expand issues when they first appear with progress, or transition to running
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
        // New issue appearing: expand if running or already done
        if (phase >= 1 || allDone) {
          expandedKeys.value.add(key);
        }
      } else if (phase >= 1 && (prevEntry.phase ?? -1) <= 0) {
        // Transitioning from queued/unknown to running
        expandedKeys.value.add(key);
      }
    }
  },
  { deep: true, immediate: true },
);

function toggleExpanded(key: string) {
  if (expandedKeys.value.has(key)) {
    expandedKeys.value.delete(key);
  } else {
    expandedKeys.value.add(key);
  }
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
      if (e.currentPhase && e.currentPhase.phase > 0) return 0; // running
      if (e.isQueued) return 1; // queued
      if (e.allDone) return 2; // done
      return 1; // no phase yet = queued
    };
    return order(a) - order(b);
  });
});

// Auto-scroll each log element
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

/** Filter out phase 0 (queued) from display — it's a wait state, not a progress step */
function visiblePhases(phases: (typeof issueEntries.value)[0]['phases']) {
  return phases.filter((p) => p.phase > 0);
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

  <!-- Active job: collapsible items per task -->
  <div v-else class="flex flex-1 flex-col overflow-y-auto">
    <div
      v-for="entry in sortedIssueEntries"
      :key="entry.key"
      class="border-b border-[rgb(255_255_255/6%)] last:border-b-0"
    >
      <!-- Collapsible header -->
      <div
        class="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[rgb(255_255_255/4%)]"
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
          class="text-[#8b5cf6] shrink-0 animate-spin"
        />
        <UIcon
          v-else-if="entry.isQueued"
          name="i-lucide-clock"
          class="shrink-0 text-[#888]"
        />
        <UIcon
          v-else-if="entry.allDone"
          name="i-lucide-circle-check"
          class="shrink-0 text-[#22c55e]"
        />
        <UIcon
          v-else
          name="i-lucide-circle-dot"
          class="shrink-0 text-[#444]"
        />

        <!-- Issue key -->
        <span class="shrink-0 font-mono text-sm font-semibold text-[#ccc]">
          {{ entry.key }}
        </span>

        <!-- Current phase label -->
        <span
          v-if="entry.currentPhase && entry.currentPhase.phase > 0"
          class="text-sm text-[#8b5cf6]"
        >
          {{ entry.currentPhase.label }}
        </span>
        <span v-else-if="entry.isQueued" class="text-sm text-[#888]">
          排隊中
        </span>
        <span v-else-if="entry.allDone" class="text-sm text-[#22c55e]">
          完成
        </span>

        <!-- Phase dots (exclude phase 0) -->
        <div class="ml-auto flex items-center gap-1.5">
          <div
            v-for="p in visiblePhases(entry.phases)"
            :key="p.phase"
            class="h-2 w-2 rounded-full"
            :class="{
              'bg-[#22c55e]': p.status === 'done',
              'animate-pulse bg-[#8b5cf6]': p.status === 'running',
              'bg-[#444]': p.status === 'pending',
            }"
            :title="p.label"
          ></div>
        </div>

        <!-- Chevron -->
        <UIcon
          name="i-lucide-chevron-down"
          class="shrink-0 text-[#444] transition-transform duration-200"
          :class="{ 'rotate-180': expandedKeys.has(entry.key) }"
        />
      </div>

      <!-- Expanded content -->
      <div
        v-if="expandedKeys.has(entry.key)"
        class="border-t border-[rgb(255_255_255/4%)] bg-[#0a0a0f]"
      >
        <!-- Phase progress bar (exclude phase 0) -->
        <div class="flex items-center gap-4 px-4 py-2.5">
          <div
            v-for="(p, i) in visiblePhases(entry.phases)"
            :key="p.phase"
            class="flex items-center gap-2"
          >
            <!-- Step circle -->
            <div
              class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              :class="{
                'bg-[#22c55e] text-[#fafafa]': p.status === 'done',
                'animate-pulse bg-[#8b5cf6] text-[#fafafa]': p.status === 'running',
                'border border-[rgb(255_255_255/8%)] text-transparent':
                  p.status === 'pending',
              }"
            >
              {{
                p.status === 'done' ? '✓' : p.status === 'running' ? '●' : ''
              }}
            </div>
            <!-- Label -->
            <span
              class="text-xs"
              :class="{
                'text-[#22c55e]': p.status === 'done',
                'font-semibold text-[#8b5cf6]': p.status === 'running',
                'text-[#444]': p.status === 'pending',
              }"
            >
              {{ p.label }}
            </span>
            <!-- Connector -->
            <div
              v-if="i < visiblePhases(entry.phases).length - 1"
              class="h-px w-6"
              :class="p.status === 'done' ? 'bg-[rgb(34_197_94/15%)]' : 'bg-[rgb(255_255_255/4%)]'"
            ></div>
          </div>
        </div>

        <!-- Log output -->
        <pre
          :ref="(el) => setLogRef(entry.key, el as HTMLElement)"
          class="text-log max-h-80 overflow-y-auto border-t border-[rgb(255_255_255/4%)] px-4 py-3 font-mono leading-relaxed break-all whitespace-pre-wrap text-[#888]"
          >{{ entry.output ? stripAnsi(entry.output) : '等待輸出...' }}</pre
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
.text-log {
  font-size: 0.875em;
}
</style>
