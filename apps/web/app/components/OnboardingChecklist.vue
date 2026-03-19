<script setup lang="ts">
import type { OnboardingStep } from '~/composables/useOnboarding';

const props = defineProps<{
  completedCount: number;
  steps: OnboardingStep[];
}>();

const emit = defineEmits<{
  (e: 'dismiss'): void;
  (e: 'highlight', tourIndex: number): void;
}>();

function handleClick(step: OnboardingStep) {
  if (step.tourIndex !== null) {
    emit('highlight', step.tourIndex);
  } else if (step.id === 'skills') {
    navigateTo('/skills');
  }
}

// Completion animation state
const justCompleted = ref(false);
const fadeOut = ref(false);

watch(
  () => props.completedCount,
  (count) => {
    if (count === props.steps.length) {
      justCompleted.value = true;
      setTimeout(() => {
        fadeOut.value = true;
        setTimeout(() => emit('dismiss'), 500);
      }, 1500);
    }
  },
);
</script>

<template>
  <div
    class="fixed right-4 bottom-4 z-50 w-72 rounded-xl border border-gray-700 bg-gray-900/95 shadow-2xl backdrop-blur transition-opacity duration-500"
    :class="{ 'opacity-0': fadeOut }"
  >
    <!-- Completed state -->
    <template v-if="justCompleted">
      <div class="px-4 py-5 text-center">
        <p class="text-2xl">✅</p>
        <p class="mt-1 text-sm font-medium text-gray-300">設定完成！</p>
      </div>
    </template>

    <!-- Checklist -->
    <template v-else>
      <!-- Header -->
      <div
        class="flex items-center justify-between border-b border-gray-800 px-4 py-3"
      >
        <div>
          <p class="text-sm font-medium text-gray-300">👋 快速設定</p>
        </div>
        <button
          class="text-xs text-gray-600 hover:text-gray-400"
          @click="emit('dismiss')"
        >
          跳過
        </button>
      </div>

      <!-- Steps -->
      <div class="space-y-0.5 p-2">
        <button
          v-for="(step, idx) in steps"
          :key="step.id"
          class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all"
          :class="step.completed.value ? 'opacity-60' : 'hover:bg-gray-800/60'"
          @click="handleClick(step)"
        >
          <!-- Icon -->
          <span
            v-if="step.completed.value"
            class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500/10 text-xs text-green-400"
          >
            ✓
          </span>
          <span
            v-else
            class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-600 text-xs text-gray-500"
          >
            {{ idx + 1 }}
          </span>

          <!-- Label -->
          <span
            class="flex-1 text-sm"
            :class="
              step.completed.value
                ? 'text-gray-500 line-through'
                : 'text-gray-300'
            "
          >
            {{ step.label }}
          </span>

          <!-- Arrow for first incomplete -->
          <UIcon
            v-if="
              !step.completed.value &&
              steps.findIndex((s) => !s.completed.value) === idx
            "
            name="i-lucide-arrow-right"
            class="shrink-0 text-blue-400"
            style="font-size: 0.85em"
          />
        </button>
      </div>

      <!-- Progress bar -->
      <div class="flex items-center gap-2 border-t border-gray-800 px-4 py-2.5">
        <div class="h-1 flex-1 overflow-hidden rounded-full bg-gray-800">
          <div
            class="h-full rounded-full bg-blue-500 transition-all duration-500"
            :style="{ width: `${(completedCount / steps.length) * 100}%` }"
          ></div>
        </div>
        <span class="text-xs text-gray-600 tabular-nums">
          {{ completedCount }}/{{ steps.length }}
        </span>
      </div>
    </template>
  </div>
</template>
