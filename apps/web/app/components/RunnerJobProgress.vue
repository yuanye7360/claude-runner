<script setup lang="ts">
import type { ActiveJob } from '~/composables/useRunnerJob';

const props = defineProps<{
  activeJob: ActiveJob | null;
}>();

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replaceAll(/\u001B\[[\d;?<>!]*[A-Z]/gi, '');
}

const logEl = ref<HTMLElement | null>(null);

watch(
  () => props.activeJob?.output,
  () => {
    nextTick(() => {
      if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight;
    });
  },
);

const issuePhaseEntries = computed(() => {
  if (!props.activeJob) return [];
  return props.activeJob.issues.map((issue) => ({
    key: issue.key,
    phases: props.activeJob!.phasesByIssue[issue.key] ?? [],
  }));
});
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

  <!-- Active job split layout -->
  <div v-else class="flex flex-1 overflow-hidden">
    <!-- Left: phase columns per issue -->
    <div
      class="shrink-0 overflow-y-auto border-r border-gray-800 bg-gray-950/50 py-4"
      :class="issuePhaseEntries.length > 1 ? 'flex gap-0' : 'w-44 px-4'"
    >
      <div
        v-for="entry in issuePhaseEntries"
        :key="entry.key"
        :class="
          issuePhaseEntries.length > 1
            ? 'w-40 shrink-0 border-r border-gray-800/60 px-3 last:border-r-0'
            : ''
        "
      >
        <div
          class="mb-3 truncate font-mono text-xs"
          :class="
            activeJob.currentIssueKey === entry.key
              ? 'text-blue-400'
              : 'text-gray-600'
          "
        >
          {{ entry.key }}
        </div>

        <div v-for="(p, i) in entry.phases" :key="p.phase" class="flex gap-2.5">
          <!-- Step icon + connector line -->
          <div class="flex flex-col items-center">
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
            <div
              v-if="i < entry.phases.length - 1"
              class="my-1 w-px flex-1"
              :class="p.status === 'done' ? 'bg-green-900' : 'bg-gray-800'"
              style="min-height: 16px"
            ></div>
          </div>

          <!-- Label -->
          <div class="min-w-0 pb-4">
            <span
              class="text-xs leading-5"
              :class="{
                'text-green-400': p.status === 'done',
                'font-semibold text-blue-400': p.status === 'running',
                'text-gray-600': p.status === 'pending',
              }"
              >{{ p.label }}</span
            >
          </div>
        </div>
      </div>
    </div>

    <!-- Right: live log -->
    <div class="flex flex-1 flex-col overflow-hidden bg-gray-950">
      <pre
        ref="logEl"
        class="text-log flex-1 overflow-y-auto px-4 py-3 font-mono leading-relaxed break-all whitespace-pre-wrap text-gray-400"
        >{{
          activeJob.output ? stripAnsi(activeJob.output) : '等待輸出...'
        }}</pre
      >
    </div>
  </div>
</template>

<style scoped>
.text-log {
  font-size: 0.875em;
}
</style>
