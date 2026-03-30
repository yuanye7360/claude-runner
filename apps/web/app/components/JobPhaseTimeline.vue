<script setup lang="ts">
import { parseOutput } from '~/composables/useOutputParser';

const props = defineProps<{
  error?: string;
  output?: string;
  prUrl?: string;
}>();

const phases = computed(() =>
  parseOutput(props.output, !!props.error, props.prUrl),
);

const expandedPhases = ref<Set<number>>(new Set());
function togglePhase(i: number) {
  if (expandedPhases.value.has(i)) expandedPhases.value.delete(i);
  else expandedPhases.value.add(i);
}
</script>

<template>
  <div class="relative pl-7">
    <!-- Vertical line -->
    <div
      class="absolute top-2 bottom-2 left-[9px] w-px"
      style="background: rgba(255, 255, 255, 0.06)"
    ></div>

    <div v-for="(phase, i) in phases" :key="i" class="relative mb-3 last:mb-0">
      <!-- Status dot -->
      <div
        class="absolute top-[6px] -left-7 flex h-[18px] w-[18px] items-center justify-center rounded-full"
        :class="
          phase.status === 'error'
            ? 'bg-[rgba(239,68,68,0.1)]'
            : 'bg-[rgba(34,197,94,0.1)]'
        "
      >
        <span v-if="phase.status === 'done'" class="text-[10px] text-[#22c55e]"
          >✓</span
        >
        <span v-else class="text-[10px] text-[#ef4444]">✗</span>
      </div>

      <!-- Phase card -->
      <button
        class="w-full rounded-lg border p-3 text-left transition-colors"
        :class="
          phase.status === 'error'
            ? 'border-[rgba(239,68,68,0.15)]'
            : 'border-[rgba(255,255,255,0.06)]'
        "
        :style="
          phase.status === 'error'
            ? 'background: rgba(239, 68, 68, 0.03)'
            : 'background: rgba(255, 255, 255, 0.02)'
        "
        @click="togglePhase(i)"
      >
        <!-- Phase header -->
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium text-[#fafafa]">{{
            phase.label
          }}</span>
          <span
            class="rounded px-1.5 py-0.5 text-[9px]"
            :class="
              phase.status === 'error'
                ? 'bg-[rgba(239,68,68,0.1)] text-[#ef4444]'
                : 'bg-[rgba(34,197,94,0.08)] text-[#22c55e]'
            "
          >
            {{ phase.status === 'error' ? 'error' : 'done' }}
          </span>
          <UIcon
            name="i-lucide-chevron-down"
            class="ml-auto text-[#444] transition-transform duration-150"
            :class="{ 'rotate-180': expandedPhases.has(i) }"
          />
        </div>

        <!-- Highlights (always visible) -->
        <div
          v-if="phase.highlights.length > 0"
          class="mt-2 flex flex-wrap gap-1.5"
        >
          <span
            v-for="(h, j) in phase.highlights"
            :key="j"
            class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
            :class="{
              'bg-[rgba(139,92,246,0.08)] text-[#a78bfa]': h.type === 'pr',
              'bg-[rgba(6,182,212,0.08)] text-[#06b6d4]': h.type === 'branch',
              'bg-[rgba(245,158,11,0.08)] text-[#f59e0b]': h.type === 'file',
            }"
          >
            <template v-if="h.type === 'pr'">
              <a
                :href="h.text"
                target="_blank"
                rel="noopener"
                class="hover:underline"
                @click.stop
              >
                {{ h.text.split('/').slice(-2).join('/') }}
              </a>
            </template>
            <template v-else>{{ h.text }}</template>
          </span>
        </div>
      </button>

      <!-- Expanded lines -->
      <div
        v-if="expandedPhases.has(i)"
        class="mt-1 ml-0 rounded-lg border border-[rgba(255,255,255,0.04)] p-3"
        style="background: rgba(255, 255, 255, 0.01)"
      >
        <pre
          class="max-h-60 overflow-auto text-[11px] leading-relaxed whitespace-pre-wrap text-[#666]"
          >{{ phase.lines.join('\n') }}</pre
        >
      </div>
    </div>
  </div>
</template>
