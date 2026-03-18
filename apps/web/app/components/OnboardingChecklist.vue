<script setup lang="ts">
import type { OnboardingStep } from '~/composables/useOnboarding';

const props = defineProps<{
  completedCount: number;
  steps: OnboardingStep[];
}>();

const emit = defineEmits<{
  (e: 'dismiss'): void;
}>();

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
    class="flex flex-1 flex-col items-center justify-center px-8 transition-opacity duration-500"
    :class="{ 'opacity-0': fadeOut }"
  >
    <!-- Completed state -->
    <template v-if="justCompleted">
      <div class="text-center">
        <p class="text-3xl">✅</p>
        <p class="mt-2 font-medium text-gray-300">設定完成！</p>
      </div>
    </template>

    <!-- Checklist -->
    <template v-else>
      <div class="w-full max-w-sm">
        <!-- Header -->
        <div class="mb-1 flex items-start justify-between">
          <div>
            <p class="font-medium text-gray-300">👋 歡迎！完成設定開始使用</p>
            <p class="mt-0.5 text-xs text-gray-600">完成以下步驟即可開始</p>
          </div>
          <button
            class="shrink-0 text-xs text-gray-600 hover:text-gray-400"
            @click="emit('dismiss')"
          >
            跳過
          </button>
        </div>

        <!-- Steps -->
        <div class="mt-4 space-y-2">
          <button
            v-for="(step, idx) in steps"
            :key="step.id"
            class="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all"
            :class="
              step.completed.value
                ? 'border-green-500/20 bg-green-500/5'
                : 'border-gray-700 bg-gray-800/40 hover:border-gray-600 hover:bg-gray-800/60'
            "
            @click="step.action()"
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
              ○
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
        <div class="mt-4 flex items-center gap-2">
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
      </div>
    </template>
  </div>
</template>
