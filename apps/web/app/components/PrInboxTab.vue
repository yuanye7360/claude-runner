<script setup lang="ts">
import { usePrInbox } from '~/composables/usePrInbox';

const inbox = usePrInbox();

defineExpose({
  fetchItems: inbox.fetchItems,
  loadHistory: inbox.loadHistory,
  reviewer: inbox.reviewer,
});

const statusColor: Record<string, string> = {
  'not-reviewed': 'text-[#888] bg-gray-500/10',
  reviewed: 'text-[#22c55e] bg-green-500/10',
  outdated: 'text-orange-400 bg-orange-500/10',
  closed: 'text-[#555] bg-gray-500/10',
};

const statusLabel: Record<string, string> = {
  'not-reviewed': '待 review',
  reviewed: '已 review',
  outdated: '有更新',
  closed: '已關閉',
};

const statusFilterOptions = [
  { label: '全部', value: 'all' as const },
  { label: '待 review', value: 'not-reviewed' as const },
  { label: '有更新', value: 'outdated' as const },
  { label: '已 review', value: 'reviewed' as const },
  { label: '已關閉', value: 'closed' as const },
];

function repoShort(repo: string): string {
  const name = repo.split('/').pop() ?? repo;
  return name.startsWith('kkday-') ? name.slice('kkday-'.length) : name;
}
</script>

<template>
  <div class="flex flex-1 overflow-hidden">
    <!-- Left: PR list -->
    <div
      class="flex w-[480px] shrink-0 flex-col overflow-hidden border-r border-[rgb(255_255_255/6%)]"
    >
      <!-- Header -->
      <div
        class="flex h-11 shrink-0 items-center gap-2 border-b border-[rgb(255_255_255/6%)] px-4"
      >
        <span class="text-sm font-medium text-[#ccc]">PR Inbox</span>
        <span
          v-if="!inbox.loading.value && inbox.items.value.length > 0"
          class="rounded-full bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-[#a78bfa]"
        >
          {{ inbox.items.value.length }}
        </span>
        <span
          v-if="inbox.fetchedAgo.value"
          class="text-xs text-[#555]"
        >
          上次更新：{{ inbox.fetchedAgo.value }}
        </span>
        <div class="ml-auto flex items-center gap-1">
          <button
            class="flex items-center rounded px-1.5 py-1 text-[#888] transition-colors hover:bg-[rgb(255_255_255/4%)] hover:text-[#ccc]"
            :class="{
              'pointer-events-none opacity-50': inbox.loading.value,
            }"
            @click="inbox.fetchItems()"
          >
            <UIcon
              name="i-lucide-refresh-cw"
              :class="{ 'animate-spin': inbox.loading.value }"
              style="font-size: 0.85em"
            />
          </button>
        </div>
      </div>

      <!-- Status filter tabs -->
      <div
        class="shrink-0 border-b border-[rgb(255_255_255/6%)]/60 px-4 py-2"
      >
        <div class="flex items-center gap-1">
          <button
            v-for="opt in statusFilterOptions"
            :key="opt.value"
            class="shrink-0 rounded-md px-2 py-1 text-xs whitespace-nowrap transition-colors"
            :class="
              inbox.statusFilter.value === opt.value
                ? 'bg-[rgb(255_255_255/6%)] font-medium text-[#fafafa]'
                : 'text-[#888] hover:text-[#ccc]'
            "
            @click="inbox.statusFilter.value = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- PR list -->
      <div class="flex-1 overflow-y-auto">
        <!-- Loading skeleton -->
        <div v-if="inbox.loading.value" class="space-y-1.5 p-2">
          <div
            v-for="n in 5"
            :key="n"
            class="h-14 animate-pulse rounded-lg bg-[rgb(255_255_255/4%)]"
          ></div>
        </div>

        <!-- Error state -->
        <div v-else-if="inbox.fetchError.value" class="p-4 text-center">
          <UIcon name="i-lucide-wifi-off" class="mb-2 text-xl text-red-500" />
          <p class="mb-2 text-xs text-[#888]">
            {{ inbox.fetchError.value }}
          </p>
          <UButton size="xs" @click="inbox.fetchItems()">重試</UButton>
        </div>

        <!-- Empty: no items fetched yet -->
        <div
          v-else-if="inbox.items.value.length === 0"
          class="p-6 text-center text-[#444]"
        >
          <UIcon name="i-lucide-inbox" class="mb-2 text-2xl" />
          <p class="text-xs">點擊右上角重新整理以載入 PR 列表</p>
        </div>

        <!-- Empty after filter -->
        <div
          v-else-if="inbox.groupedByUser.value.size === 0"
          class="p-6 text-center text-[#444]"
        >
          <UIcon name="i-lucide-filter-x" class="mb-2 text-2xl" />
          <p class="text-xs">沒有符合條件的 PR</p>
        </div>

        <!-- Grouped list -->
        <div v-else class="space-y-1 p-2">
          <template
            v-for="[slackUser, userItems] in inbox.groupedByUser.value"
            :key="slackUser"
          >
            <!-- Group header -->
            <div
              class="sticky top-0 z-10 flex items-center justify-between bg-[#0a0a0f]/90 px-2 py-1 backdrop-blur-sm"
            >
              <span class="text-xs font-semibold text-[#888]">
                {{ slackUser || '未知來源' }}
                <span class="font-normal opacity-60"
                  >({{ userItems.length }})</span
                >
              </span>
            </div>

            <!-- PR rows -->
            <div
              v-for="item in userItems"
              :key="`${item.repo}#${item.prNumber}`"
              role="button"
              tabindex="0"
              class="group flex w-full items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-all duration-150"
              :class="[
                !item.repoLabel
                  ? 'cursor-default opacity-40'
                  : inbox.reviewer.isRunning.value
                    ? 'cursor-default opacity-70'
                    : 'cursor-pointer hover:-translate-y-px hover:border-[rgb(255_255_255/8%)] hover:bg-[rgb(255_255_255/4%)] hover:shadow-lg hover:shadow-black/20',
                item.repoLabel &&
                inbox.selected.value.has(`${item.repo}#${item.prNumber}`)
                  ? 'border-purple-500/20 bg-purple-500/5'
                  : '',
              ]"
              @click="inbox.toggleItem(item)"
            >
              <!-- Checkbox or warning icon -->
              <div class="mt-0.5 shrink-0">
                <UIcon
                  v-if="!item.repoLabel"
                  name="i-lucide-alert-triangle"
                  class="text-orange-400"
                  style="font-size: 0.9em"
                />
                <UCheckbox
                  v-else
                  :model-value="
                    inbox.selected.value.has(`${item.repo}#${item.prNumber}`)
                  "
                  class="pointer-events-none"
                />
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <!-- PR number link -->
                  <a
                    :href="item.htmlUrl"
                    target="_blank"
                    rel="noopener"
                    class="shrink-0 font-mono text-sm font-semibold text-[#8b5cf6] underline-offset-2 hover:underline"
                    @click.stop
                  >
                    #{{ item.prNumber }}
                  </a>

                  <!-- Repo badge -->
                  <span
                    v-if="item.repoLabel"
                    class="rounded bg-[rgb(255_255_255/6%)] px-1.5 py-0.5 font-mono text-xs text-[#888]"
                  >
                    {{ repoShort(item.repoLabel) }}
                  </span>

                  <!-- Status badge -->
                  <span
                    class="rounded-full px-2 py-0.5 text-xs"
                    :class="statusColor[item.reviewStatus] ?? 'text-[#888] bg-gray-500/10'"
                  >
                    {{ statusLabel[item.reviewStatus] ?? item.reviewStatus }}
                  </span>
                </div>

                <!-- PR title -->
                <p class="mt-1 truncate text-sm leading-snug text-[#888]">
                  {{ item.prTitle }}
                </p>

                <!-- Author -->
                <p class="mt-0.5 text-xs text-[#444]">
                  by @{{ item.prAuthor }}
                </p>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- Bottom action bar -->
      <div
        class="shrink-0 border-t border-[rgb(255_255_255/6%)] px-3 py-2"
      >
        <div class="flex items-center gap-2">
          <button
            class="rounded-md px-2.5 py-1.5 text-xs text-[#a78bfa] transition-colors hover:bg-purple-500/10 disabled:pointer-events-none disabled:opacity-50"
            :disabled="inbox.reviewer.isRunning.value"
            @click="inbox.selectAllPending()"
          >
            全選待 review
          </button>
          <button
            v-if="inbox.selectedCount.value > 0"
            class="rounded-md px-2.5 py-1.5 text-xs text-[#888] transition-colors hover:bg-[rgb(255_255_255/4%)] hover:text-[#ccc]"
            @click="inbox.clearSelection()"
          >
            取消全選
          </button>
          <div class="ml-auto">
            <UButton
              size="sm"
              color="primary"
              :disabled="
                !inbox.selectedCount.value ||
                inbox.reviewer.isRunning.value ||
                inbox.starting.value
              "
              :loading="
                inbox.reviewer.isRunning.value || inbox.starting.value
              "
              icon="i-lucide-search-code"
              @click="inbox.runReview()"
            >
              {{
                inbox.starting.value
                  ? '準備中...'
                  : inbox.reviewer.isRunning.value
                    ? 'Review 中...'
                    : `Review${inbox.selectedCount.value ? ` (${inbox.selectedCount.value})` : ''}`
              }}
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: Execution panel -->
    <div class="flex flex-1 flex-col overflow-hidden">
      <!-- Tab bar -->
      <div
        class="flex shrink-0 items-center border-b border-[rgb(255_255_255/6%)] px-1"
      >
        <button
          class="-mb-px flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm transition-colors"
          :class="
            inbox.rightTab.value === 'progress'
              ? 'border-primary-500 font-medium text-[#fafafa]'
              : 'border-transparent text-[#888] hover:text-[#ccc]'
          "
          @click="inbox.rightTab.value = 'progress'"
        >
          <UIcon
            v-if="inbox.reviewer.isRunning.value"
            name="i-lucide-loader-circle"
            class="animate-spin text-[#8b5cf6]"
            style="font-size: 0.8em"
          />
          執行過程
        </button>
        <button
          class="-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors"
          :class="
            inbox.rightTab.value === 'history'
              ? 'border-primary-500 font-medium text-[#fafafa]'
              : 'border-transparent text-[#888] hover:text-[#ccc]'
          "
          @click="inbox.rightTab.value = 'history'"
        >
          執行紀錄
          <span
            v-if="inbox.history.value.length > 0"
            class="rounded-full bg-[#444] px-1.5 py-0.5 text-xs leading-none text-[#888]"
          >
            {{ inbox.history.value.length }}
          </span>
        </button>
      </div>

      <!-- Status row -->
      <RunnerStatusRow
        v-if="inbox.reviewer.activeJob.value"
        :active-job="inbox.reviewer.activeJob.value"
        :is-running="inbox.reviewer.isRunning.value"
        :success-count="inbox.reviewer.successCount.value"
        :error-count="inbox.reviewer.errorCount.value"
        :elapsed="inbox.reviewer.elapsed.value"
        :expanded="true"
        :hide-results="inbox.rightTab.value === 'progress'"
        @cancel="inbox.reviewer.cancelJob"
      />

      <!-- Progress tab -->
      <template v-if="inbox.rightTab.value === 'progress'">
        <RunnerJobProgress
          v-if="inbox.reviewer.activeJob.value"
          :active-job="inbox.reviewer.activeJob.value"
          class="flex-1 overflow-hidden"
        />
        <div
          v-else
          class="flex flex-1 flex-col items-center justify-center gap-3 text-[#444] select-none"
        >
          <UIcon name="i-lucide-inbox" class="text-5xl" />
          <div class="text-center">
            <p class="font-medium text-[#444]">
              從左側勾選 PR，開始自動 Code Review
            </p>
            <p class="mt-1 text-xs text-[#444]">
              Claude 會分析程式碼並在 GitHub 上留下 Review 意見
            </p>
          </div>
        </div>
      </template>

      <!-- History tab -->
      <template v-else-if="inbox.rightTab.value === 'history'">
        <RunnerJobHistory :history="inbox.history.value" />
      </template>
    </div>
  </div>
</template>
