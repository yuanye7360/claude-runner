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

// Auto-expand the first issue, and auto-expand new issues as they start
watch(
  () => props.activeJob?.issues.map((i) => i.key),
  (keys) => {
    if (!keys) return;
    for (const k of keys) {
      expandedKeys.value.add(k);
    }
  },
  { immediate: true },
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
    const output =
      props.activeJob!.outputByIssue[issue.key] ||
      (props.activeJob!.issues.length === 1 ? props.activeJob!.output : '');
    return {
      key: issue.key,
      summary: issue.summary,
      phases,
      currentPhase,
      allDone,
      output,
    };
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
</script>

<template>
  <!-- Empty state -->
  <div
    v-if="!activeJob"
    class="flex flex-1 flex-col items-center justify-center gap-3 text-gray-700 select-none"
  >
    <UIcon name="i-lucide-terminal" class="text-5xl" />
    <p class="text-gray-600">尚無執行中的工作</p>
  </div>

  <!-- Active job: collapsible items per task -->
  <div v-else class="flex flex-1 flex-col overflow-y-auto">
    <div
      v-for="entry in issueEntries"
      :key="entry.key"
      class="border-b border-gray-800 last:border-b-0"
    >
      <!-- Collapsible header -->
      <div
        class="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-800/40"
        role="button"
        tabindex="0"
        :aria-expanded="expandedKeys.has(entry.key)"
        @click="toggleExpanded(entry.key)"
        @keydown.enter.space="toggleExpanded(entry.key)"
      >
        <!-- Status icon -->
        <UIcon
          v-if="entry.currentPhase"
          name="i-lucide-loader-circle"
          class="text-primary-400 shrink-0 animate-spin"
        />
        <UIcon
          v-else-if="entry.allDone"
          name="i-lucide-circle-check"
          class="shrink-0 text-green-400"
        />
        <UIcon
          v-else
          name="i-lucide-circle-dot"
          class="shrink-0 text-gray-600"
        />

        <!-- Issue key -->
        <span class="shrink-0 font-mono text-sm font-semibold text-gray-300">
          {{ entry.key }}
        </span>

        <!-- Current phase label -->
        <span v-if="entry.currentPhase" class="text-sm text-blue-400">
          {{ entry.currentPhase.label }}
        </span>
        <span v-else-if="entry.allDone" class="text-sm text-green-400">
          完成
        </span>

        <!-- Phase dots -->
        <div class="ml-auto flex items-center gap-1.5">
          <div
            v-for="p in entry.phases"
            :key="p.phase"
            class="h-2 w-2 rounded-full"
            :class="{
              'bg-green-500': p.status === 'done',
              'animate-pulse bg-blue-500': p.status === 'running',
              'bg-gray-700': p.status === 'pending',
            }"
            :title="p.label"
          ></div>
        </div>

        <!-- Chevron -->
        <UIcon
          name="i-lucide-chevron-down"
          class="shrink-0 text-gray-600 transition-transform duration-200"
          :class="{ 'rotate-180': expandedKeys.has(entry.key) }"
        />
      </div>

      <!-- Expanded content -->
      <div
        v-if="expandedKeys.has(entry.key)"
        class="border-t border-gray-800/60 bg-gray-950"
      >
        <!-- Phase progress bar -->
        <div class="flex items-center gap-4 px-4 py-2.5">
          <div
            v-for="(p, i) in entry.phases"
            :key="p.phase"
            class="flex items-center gap-2"
          >
            <!-- Step circle -->
            <div
              class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              :class="{
                'bg-green-600 text-white': p.status === 'done',
                'animate-pulse bg-blue-600 text-white': p.status === 'running',
                'border border-gray-700 text-transparent':
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
                'text-green-400': p.status === 'done',
                'font-semibold text-blue-400': p.status === 'running',
                'text-gray-600': p.status === 'pending',
              }"
            >
              {{ p.label }}
            </span>
            <!-- Connector -->
            <div
              v-if="i < entry.phases.length - 1"
              class="h-px w-6"
              :class="p.status === 'done' ? 'bg-green-900' : 'bg-gray-800'"
            ></div>
          </div>
        </div>

        <!-- Log output -->
        <pre
          :ref="(el) => setLogRef(entry.key, el as HTMLElement)"
          class="text-log max-h-80 overflow-y-auto border-t border-gray-800/40 px-4 py-3 font-mono leading-relaxed break-all whitespace-pre-wrap text-gray-400"
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
