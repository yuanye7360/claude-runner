<script setup lang="ts">
import type { ActiveJob } from '~/composables/useRunnerJob';

const props = defineProps<{
  activeJob: ActiveJob;
  elapsed: string;
  errorCount: number;
  expanded: boolean;
  getItemUrl?: (key: string) => null | string;
  isRunning: boolean;
  successCount: number;
}>();

const emit = defineEmits<{
  cancel: [];
  'update:expanded': [value: boolean];
}>();

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replaceAll(/\u001B\[[\d;?<>!]*[A-Z]/gi, '');
}

function toggleExpanded() {
  emit('update:expanded', !props.expanded);
}
</script>

<template>
  <div class="shrink-0 border-b border-gray-800">
    <!-- Row header -->
    <div
      class="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-800/40"
      role="button"
      tabindex="0"
      :aria-expanded="expanded"
      @click="toggleExpanded"
      @keydown.enter.space="toggleExpanded"
    >
      <UIcon
        v-if="isRunning"
        name="i-lucide-loader-circle"
        class="text-primary-400 shrink-0 animate-spin"
      />
      <UIcon
        v-else-if="activeJob.status === 'cancelled'"
        name="i-lucide-circle-x"
        class="shrink-0 text-yellow-400"
      />
      <UIcon
        v-else-if="errorCount > 0"
        name="i-lucide-circle-x"
        class="shrink-0 text-red-400"
      />
      <UIcon
        v-else
        name="i-lucide-circle-check"
        class="shrink-0 text-green-400"
      />

      <span class="font-medium text-gray-300">
        {{
          isRunning
            ? '執行中'
            : activeJob.status === 'cancelled'
              ? '已中斷'
              : '完成'
        }}
      </span>
      <span class="text-muted">·</span>
      <span class="text-muted truncate">
        {{ activeJob.issues.map((i) => i.key).join('、') }}
      </span>

      <template v-if="isRunning">
        <span class="text-muted">·</span>
        <span class="text-muted shrink-0">已耗時 {{ elapsed }}</span>
        <button
          class="ml-1 shrink-0 rounded px-2 py-0.5 text-sm text-yellow-500 transition-colors hover:bg-yellow-950/40 hover:text-yellow-400"
          @click.stop="emit('cancel')"
        >
          ■ 中斷
        </button>
      </template>
      <template v-else>
        <span class="text-muted">·</span>
        <span class="shrink-0 text-green-400">{{ successCount }} 成功</span>
        <span v-if="errorCount" class="shrink-0 text-red-400"
          >{{ errorCount }} 失敗</span
        >
      </template>

      <UIcon
        name="i-lucide-chevron-down"
        class="ml-auto shrink-0 text-gray-600 transition-transform duration-200"
        :class="{ 'rotate-180': expanded }"
      />
    </div>

    <!-- Expandable output -->
    <div v-if="expanded" class="border-t border-gray-800 bg-gray-950">
      <!-- Completed results view -->
      <template v-if="!isRunning && activeJob.results.length > 0">
        <div
          v-for="r in activeJob.results"
          :key="r.issueKey"
          class="overflow-hidden border-b border-gray-800/60 last:border-b-0"
        >
          <div
            class="flex items-center gap-3 px-4 py-2"
            :class="r.error ? 'bg-red-950/20' : 'bg-green-950/10'"
          >
            <UIcon
              :name="r.error ? 'i-lucide-circle-x' : 'i-lucide-circle-check'"
              class="shrink-0"
              :class="r.error ? 'text-red-400' : 'text-green-400'"
            />
            <component
              :is="getItemUrl?.(r.issueKey) ? 'a' : 'span'"
              :href="getItemUrl?.(r.issueKey) ?? undefined"
              target="_blank"
              rel="noopener"
              class="shrink-0 font-mono font-semibold text-gray-300"
              :class="{
                'underline-offset-2 hover:underline': getItemUrl?.(r.issueKey),
              }"
              >{{ r.issueKey }}</component
            >
            <span class="text-muted flex-1 truncate">
              {{ activeJob.issues.find((i) => i.key === r.issueKey)?.summary }}
            </span>
            <a
              v-if="r.prUrl"
              :href="r.prUrl"
              target="_blank"
              rel="noopener"
              class="shrink-0 font-medium text-blue-400 underline-offset-2 hover:underline"
              @click.stop
            >
              PR 已建立 ↗
            </a>
            <span
              v-else
              class="shrink-0 font-medium"
              :class="r.error ? 'text-red-400' : 'text-green-400'"
            >
              {{ r.error ? '失敗' : '完成' }}
            </span>
          </div>
          <div class="bg-gray-950 px-4 py-3">
            <pre
              class="text-log max-h-64 overflow-y-auto font-mono leading-relaxed break-all whitespace-pre-wrap text-gray-400"
              >{{ stripAnsi(r.error || r.output || '（無輸出）') }}</pre
            >
          </div>
        </div>
      </template>

      <!-- Live stdout while running (or no results yet) -->
      <div v-else class="p-4">
        <pre
          class="text-log max-h-96 overflow-y-auto font-mono leading-relaxed break-all whitespace-pre-wrap text-gray-400"
          >{{
            activeJob.output ? stripAnsi(activeJob.output) : '等待輸出...'
          }}</pre
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
.text-muted {
  font-size: 0.875em;
  color: rgb(107 114 128);
}

.text-log {
  font-size: 0.875em;
}
</style>
