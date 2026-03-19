<script setup lang="ts">
defineProps<{
  issueKeys: string[];
  open: boolean;
  transitioning: boolean;
}>();

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'dismiss'): void;
}>();
</script>

<template>
  <UModal :open="open" @update:open="!$event && emit('dismiss')">
    <template #content>
      <div class="p-6">
        <div class="mb-4 flex items-center gap-3">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500/10"
          >
            <UIcon
              name="i-lucide-circle-alert"
              class="text-xl text-yellow-400"
            />
          </div>
          <div>
            <h3 class="text-sm font-semibold text-gray-200">自動任務已中斷</h3>
            <p class="text-xs text-gray-500">
              是否將 JIRA 狀態切回 Open？避免下次輪詢重複觸發
            </p>
          </div>
        </div>

        <div class="mb-5 rounded-lg border border-gray-700 bg-gray-800/50 p-3">
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="key in issueKeys"
              :key="key"
              class="rounded bg-gray-700 px-2 py-0.5 font-mono text-xs text-gray-300"
            >
              {{ key }}
            </span>
          </div>
        </div>

        <div class="flex justify-end gap-2">
          <button
            class="rounded-md px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-300"
            :disabled="transitioning"
            @click="emit('dismiss')"
          >
            不用，保持原狀態
          </button>
          <button
            class="flex items-center gap-1.5 rounded-md bg-yellow-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-yellow-500 disabled:opacity-50"
            :disabled="transitioning"
            @click="emit('confirm')"
          >
            <UIcon
              v-if="transitioning"
              name="i-lucide-loader-2"
              class="animate-spin"
            />
            切回 Open
          </button>
        </div>
      </div>
    </template>
  </UModal>
</template>
