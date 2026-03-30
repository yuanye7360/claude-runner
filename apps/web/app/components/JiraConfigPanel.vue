<script setup lang="ts">
import type { JiraConfig } from '~/composables/useJiraConfig';

const props = defineProps<{
  autoRunEnabled: boolean;
  autoRunInterval: number;
  autoRunLoading: boolean;
  jiraConfig: JiraConfig;
  jiraConfigured: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:jiraConfig', val: JiraConfig): void;
  (e: 'toggleAutoRun', val: boolean): void;
  (e: 'updateInterval', val: number): void;
  (e: 'done'): void;
}>();

const intervalOptions = [1, 2, 5, 10, 15, 30];

const config = computed({
  get: () => props.jiraConfig,
  set: (v) => emit('update:jiraConfig', v),
});

const newLabelInput = ref('');
function addLabel() {
  const val = newLabelInput.value.trim();
  if (val && !config.value.labels.includes(val)) {
    config.value.labels.push(val);
  }
  newLabelInput.value = '';
}
</script>

<template>
  <div class="flex-1 overflow-y-auto">
    <div class="space-y-4 p-4">
      <!-- JIRA 連線 -->
      <div data-tour="jira-connection">
        <div
          class="mb-2 flex items-center gap-2 text-xs font-medium tracking-wide text-[#888] uppercase"
        >
          JIRA 連線
          <span
            v-if="jiraConfigured"
            class="inline-block h-1.5 w-1.5 rounded-full bg-[#22c55e]"
          ></span>
          <span
            v-else
            class="inline-block h-1.5 w-1.5 rounded-full bg-[#444]"
          ></span>
        </div>
        <div class="space-y-2">
          <input
            :value="config.baseUrl"
            class="w-full rounded-md border border-[rgb(255_255_255/8%)] bg-[rgb(255_255_255/4%)] px-2.5 py-1.5 text-xs text-[#ccc] placeholder-[#444] outline-none focus:border-[rgb(255_255_255/8%)]"
            placeholder="https://yourorg.atlassian.net"
            @input="config.baseUrl = ($event.target as HTMLInputElement).value"
          />
          <input
            :value="config.email"
            class="w-full rounded-md border border-[rgb(255_255_255/8%)] bg-[rgb(255_255_255/4%)] px-2.5 py-1.5 text-xs text-[#ccc] placeholder-[#444] outline-none focus:border-[rgb(255_255_255/8%)]"
            placeholder="you@company.com"
            @input="config.email = ($event.target as HTMLInputElement).value"
          />
          <input
            :value="config.apiToken"
            type="password"
            class="w-full rounded-md border border-[rgb(255_255_255/8%)] bg-[rgb(255_255_255/4%)] px-2.5 py-1.5 text-xs text-[#ccc] placeholder-[#444] outline-none focus:border-[rgb(255_255_255/8%)]"
            placeholder="ATATT3x..."
            @input="config.apiToken = ($event.target as HTMLInputElement).value"
          />
        </div>
      </div>

      <!-- JIRA Labels -->
      <div data-tour="jira-labels">
        <div
          class="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-[#888] uppercase"
        >
          JIRA Labels
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <span
            v-for="(lbl, idx) in config.labels"
            :key="idx"
            class="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-[#8b5cf6]"
          >
            {{ lbl }}
            <button
              class="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-blue-500/20 hover:text-[#8b5cf6]"
              @click="config.labels.splice(idx, 1)"
            >
              <UIcon name="i-lucide-x" style="font-size: 0.7em" />
            </button>
          </span>
          <input
            v-model="newLabelInput"
            class="w-24 min-w-0 flex-1 rounded-md border border-[rgb(255_255_255/8%)] bg-[rgb(255_255_255/4%)] px-2 py-1 text-xs text-[#ccc] placeholder-[#444] outline-none focus:border-[rgb(255_255_255/8%)]"
            placeholder="新增 label..."
            @keydown.enter.prevent="addLabel()"
          />
        </div>
      </div>

      <!-- Auto Run -->
      <div>
        <div
          class="mb-2 text-xs font-medium tracking-wide text-[#888] uppercase"
        >
          自動執行
        </div>
        <div class="space-y-2">
          <label
            class="flex items-center justify-between rounded-md border border-[rgb(255_255_255/8%)] bg-[rgb(255_255_255/4%)] px-3 py-2"
            :class="{ 'opacity-50': !jiraConfigured || autoRunLoading }"
          >
            <div class="flex flex-col gap-0.5">
              <span class="text-xs text-[#ccc]">
                狀態切 In Development 時自動觸發
              </span>
            </div>
            <USwitch
              :model-value="autoRunEnabled"
              :disabled="!jiraConfigured || autoRunLoading"
              @update:model-value="emit('toggleAutoRun', $event)"
            />
          </label>
          <div
            class="flex items-center justify-between rounded-md border border-[rgb(255_255_255/8%)] bg-[rgb(255_255_255/4%)] px-3 py-2"
            :class="{ 'opacity-50': !autoRunEnabled }"
          >
            <span class="text-xs text-[#888]">輪詢間隔</span>
            <div class="flex items-center gap-1">
              <button
                v-for="opt in intervalOptions"
                :key="opt"
                class="rounded px-1.5 py-0.5 text-[11px] transition-colors"
                :class="
                  autoRunInterval === opt
                    ? 'bg-primary-600 text-[#fafafa]'
                    : 'text-[#888] hover:bg-[rgb(255_255_255/6%)] hover:text-[#ccc]'
                "
                :disabled="!autoRunEnabled"
                @click="emit('updateInterval', opt)"
              >
                {{ opt }}m
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Done button -->
    <div class="shrink-0 border-t border-[rgb(255_255_255/6%)] px-4 py-3">
      <button
        class="w-full rounded-md py-1.5 text-xs font-medium transition-colors"
        :class="
          jiraConfigured
            ? 'bg-primary-600 hover:bg-primary-500 text-[#fafafa]'
            : 'cursor-not-allowed bg-[rgb(255_255_255/4%)] text-[#444]'
        "
        :disabled="!jiraConfigured"
        @click="emit('done')"
      >
        {{ jiraConfigured ? '完成設定' : '請填寫 JIRA 連線資訊' }}
      </button>
    </div>
  </div>
</template>
