<script setup lang="ts">
import { parsePhases } from '~/composables/useOutputParser';

const props = defineProps<{
  error?: string;
  output?: string;
  phases?: null | { label: string; phase: number }[];
  prUrl?: string;
}>();

const parsedPhases = computed(() =>
  parsePhases(props.phases, props.output, !!props.error, props.prUrl),
);
</script>

<template>
  <div class="relative pl-7">
    <!-- Vertical line -->
    <div
      class="absolute top-2 bottom-2 left-2.25 w-px"
      style="background: rgb(255 255 255 / 6%)"
    ></div>

    <div
      v-for="(phase, i) in parsedPhases"
      :key="i"
      class="relative mb-3 last:mb-0"
    >
      <!-- Status dot -->
      <div
        class="absolute top-1.5 -left-7 flex h-4.5 w-4.5 items-center justify-center rounded-full"
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
      <div
        class="rounded-lg border p-3"
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
        </div>

        <!-- Highlights -->
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
      </div>
    </div>
  </div>
</template>
