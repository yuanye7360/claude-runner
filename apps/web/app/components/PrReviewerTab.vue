<script setup lang="ts">
import { usePrReviewer } from '~/composables/usePrReviewer';

const prReviewer = usePrReviewer();

defineExpose({
  loadPRs: prReviewer.loadPRs,
  loadRepos: prReviewer.loadRepos,
  loadHistory: prReviewer.loadHistory,
  loadReviewHistory: prReviewer.reviewHistory.fetch,
  reviewer: prReviewer.reviewer,
});

const statusColor: Record<string, string> = {
  'not-reviewed': 'text-gray-500 bg-gray-500/10',
  reviewed: 'text-green-400 bg-green-500/10',
  outdated: 'text-orange-400 bg-orange-500/10',
};

const statusLabel: Record<string, string> = {
  'not-reviewed': '未 review',
  reviewed: '已 review',
  outdated: '有更新',
};

const statusFilterOptions = [
  { label: '全部', value: 'all' as const },
  { label: '未 review', value: 'not-reviewed' as const },
  { label: '有更新', value: 'outdated' as const },
  { label: '已 review', value: 'reviewed' as const },
];

// Slack send modal
const showSlackModal = ref(false);
const slackChannel = ref('');

async function handleSendToSlack() {
  if (!slackChannel.value.trim()) return;
  const ok = await prReviewer.reviewHistory.sendToSlack(
    slackChannel.value.trim(),
  );
  if (ok) {
    showSlackModal.value = false;
  }
}
</script>

<template>
  <div class="flex flex-1 overflow-hidden">
    <!-- Left: PR list -->
    <div
      class="flex w-96 shrink-0 flex-col overflow-hidden border-r border-gray-800"
    >
      <!-- Header -->
      <div
        class="flex h-11 shrink-0 items-center gap-2 border-b border-gray-800 px-4"
      >
        <span class="text-sm font-medium text-gray-300">PR Review</span>
        <span
          v-if="!prReviewer.loading.value && prReviewer.prList.value.length > 0"
          class="rounded-full bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-400"
        >
          {{ prReviewer.prList.value.length }}
        </span>
        <div class="ml-auto flex items-center gap-1">
          <button
            class="flex items-center rounded px-1.5 py-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
            :class="{
              'pointer-events-none opacity-50': prReviewer.loading.value,
            }"
            @click="prReviewer.loadPRs()"
          >
            <UIcon
              name="i-lucide-refresh-cw"
              :class="{ 'animate-spin': prReviewer.loading.value }"
              style="font-size: 0.85em"
            />
          </button>
        </div>
      </div>

      <!-- Repo selector (multi) with counts -->
      <div class="shrink-0 border-b border-gray-800/60 px-4 py-2">
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="repo in prReviewer.repos.value"
            :key="repo.label"
            class="rounded-md px-2.5 py-1 text-xs transition-colors"
            :class="
              prReviewer.selectedRepos.value.has(repo.label)
                ? 'bg-purple-500/20 font-medium text-purple-300'
                : 'bg-gray-800 text-gray-500 hover:text-gray-300'
            "
            @click="prReviewer.toggleRepo(repo.label)"
          >
            {{ repo.label }}
            <span
              v-if="prReviewer.repoCount.value.get(repo.label)"
              class="ml-0.5 opacity-60"
            >
              ({{ prReviewer.repoCount.value.get(repo.label) }})
            </span>
          </button>
        </div>
      </div>

      <!-- Search + Filters -->
      <div class="shrink-0 space-y-1.5 border-b border-gray-800/60 px-4 py-2">
        <input
          v-model="prReviewer.searchQuery.value"
          class="w-full rounded-md border border-gray-700 bg-gray-800/60 px-2.5 py-1.5 text-xs text-gray-300 placeholder-gray-600 outline-none focus:border-gray-600"
          placeholder="搜尋 JIRA 單號、PR 標題..."
        />
        <div class="flex items-center gap-1">
          <button
            v-for="opt in statusFilterOptions"
            :key="opt.value"
            class="shrink-0 rounded-md px-2 py-1 text-xs whitespace-nowrap transition-colors"
            :class="
              prReviewer.statusFilter.value === opt.value
                ? 'bg-gray-700 font-medium text-white'
                : 'text-gray-500 hover:text-gray-300'
            "
            @click="prReviewer.statusFilter.value = opt.value"
          >
            {{ opt.label }}
          </button>
          <select
            v-model="prReviewer.authorFilter.value"
            class="ml-auto min-w-0 truncate rounded-md border border-gray-700 bg-gray-800/60 px-2 py-1 text-xs text-gray-300 outline-none focus:border-gray-600"
          >
            <option value="">全部作者</option>
            <option
              v-for="author in prReviewer.authors.value"
              :key="author"
              :value="author"
            >
              @{{ author }}
            </option>
          </select>
        </div>
      </div>

      <!-- Selection count -->
      <div
        v-if="prReviewer.selectedCount.value"
        class="shrink-0 border-b border-gray-800/60 px-4 py-1.5"
      >
        <span class="text-xs font-medium text-purple-400">
          已選 {{ prReviewer.selectedCount.value }}
        </span>
      </div>

      <!-- PR list -->
      <div class="flex-1 overflow-y-auto">
        <div v-if="prReviewer.loading.value" class="space-y-1.5 p-2">
          <div
            v-for="n in 5"
            :key="n"
            class="h-12 animate-pulse rounded-lg bg-gray-800/50"
          ></div>
        </div>

        <div v-else-if="prReviewer.loadError.value" class="p-4 text-center">
          <UIcon name="i-lucide-wifi-off" class="mb-2 text-xl text-red-500" />
          <p class="mb-2 text-xs text-gray-500">
            {{ prReviewer.loadError.value }}
          </p>
          <UButton size="xs" @click="prReviewer.loadPRs()">重試</UButton>
        </div>

        <div
          v-else-if="prReviewer.prList.value.length === 0"
          class="p-6 text-center text-gray-600"
        >
          <UIcon name="i-lucide-search" class="mb-2 text-2xl" />
          <p class="text-xs">
            {{
              prReviewer.selectedRepos.value.size > 0
                ? '沒有 Open PR'
                : '請先選擇 Repo'
            }}
          </p>
        </div>

        <div
          v-else-if="prReviewer.filteredGrouped.value.size === 0"
          class="p-6 text-center text-gray-600"
        >
          <UIcon name="i-lucide-filter-x" class="mb-2 text-2xl" />
          <p class="text-xs">沒有符合條件的 PR</p>
        </div>

        <div v-else class="space-y-1 p-2">
          <template
            v-for="[repoLabel, repoPrs] in prReviewer.filteredGrouped.value"
            :key="repoLabel"
          >
            <div
              class="sticky top-0 z-10 flex items-center justify-between bg-gray-950/90 px-2 py-1 backdrop-blur-sm"
            >
              <span class="text-xs font-semibold text-gray-500">
                {{ repoLabel }}
                <span class="font-normal opacity-60"
                  >({{ repoPrs.length }})</span
                >
              </span>
              <button
                class="text-xs text-purple-400/70 transition-colors hover:text-purple-300"
                :class="{
                  'pointer-events-none opacity-50':
                    prReviewer.reviewer.isRunning.value,
                }"
                @click="prReviewer.selectAllUnreviewed(repoLabel)"
              >
                全選未 review
              </button>
            </div>
            <div
              v-for="pr in repoPrs"
              :key="`${repoLabel}-${pr.number}`"
              role="button"
              tabindex="0"
              class="group flex w-full items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-all duration-150"
              :class="[
                prReviewer.reviewer.isRunning.value
                  ? 'cursor-default opacity-70'
                  : 'cursor-pointer hover:-translate-y-px hover:border-gray-700/50 hover:bg-gray-800/60 hover:shadow-lg hover:shadow-black/20',
                prReviewer.selected.value.has(`${repoLabel}#${pr.number}`)
                  ? 'border-purple-500/20 bg-purple-500/5'
                  : '',
              ]"
              @click="prReviewer.togglePR(repoLabel, pr.number)"
            >
              <UCheckbox
                :model-value="
                  prReviewer.selected.value.has(`${repoLabel}#${pr.number}`)
                "
                class="pointer-events-none mt-0.5 shrink-0"
              />
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <a
                    :href="pr.htmlUrl"
                    target="_blank"
                    rel="noopener"
                    class="shrink-0 font-mono text-sm font-semibold text-blue-400 underline-offset-2 hover:underline"
                    @click.stop
                  >
                    #{{ pr.number }}
                  </a>
                  <span
                    class="rounded-full px-2 py-0.5 text-xs"
                    :class="statusColor[pr.reviewStatus]"
                  >
                    {{ statusLabel[pr.reviewStatus] }}
                  </span>
                </div>
                <p class="mt-1 truncate text-sm leading-snug text-gray-400">
                  {{ pr.title }}
                </p>
                <p class="mt-0.5 text-xs text-gray-600">by @{{ pr.author }}</p>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- Run button (pinned to bottom) -->
      <div class="shrink-0 border-t border-gray-800 px-3 py-2">
        <UButton
          class="w-full justify-center"
          size="sm"
          color="primary"
          :disabled="
            !prReviewer.selectedCount.value ||
            prReviewer.reviewer.isRunning.value ||
            prReviewer.starting.value
          "
          :loading="
            prReviewer.reviewer.isRunning.value || prReviewer.starting.value
          "
          icon="i-lucide-search-code"
          @click="prReviewer.runReview()"
        >
          {{
            prReviewer.starting.value
              ? '準備中...'
              : prReviewer.reviewer.isRunning.value
                ? 'Review 中...'
                : `Review${prReviewer.selectedCount.value ? ` (${prReviewer.selectedCount.value})` : ''}`
          }}
        </UButton>
      </div>
    </div>

    <!-- Right: Detail panel -->
    <div class="flex flex-1 flex-col overflow-hidden">
      <!-- Tab bar -->
      <div class="flex shrink-0 items-center border-b border-gray-800 px-1">
        <button
          class="-mb-px flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm transition-colors"
          :class="
            prReviewer.rightTab.value === 'progress'
              ? 'border-primary-500 font-medium text-white'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          "
          @click="prReviewer.rightTab.value = 'progress'"
        >
          <UIcon
            v-if="prReviewer.reviewer.isRunning.value"
            name="i-lucide-loader-circle"
            class="text-primary-400 animate-spin"
            style="font-size: 0.8em"
          />
          執行過程
        </button>
        <button
          class="-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors"
          :class="
            prReviewer.rightTab.value === 'history'
              ? 'border-primary-500 font-medium text-white'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          "
          @click="prReviewer.rightTab.value = 'history'"
        >
          執行紀錄
          <span
            v-if="prReviewer.history.value.length > 0"
            class="rounded-full bg-gray-700 px-1.5 py-0.5 text-xs leading-none text-gray-400"
          >
            {{ prReviewer.history.value.length }}
          </span>
        </button>
      </div>

      <!-- Status row -->
      <RunnerStatusRow
        v-if="prReviewer.reviewer.activeJob.value"
        :active-job="prReviewer.reviewer.activeJob.value"
        :is-running="prReviewer.reviewer.isRunning.value"
        :success-count="prReviewer.reviewer.successCount.value"
        :error-count="prReviewer.reviewer.errorCount.value"
        :elapsed="prReviewer.reviewer.elapsed.value"
        :expanded="true"
        @cancel="prReviewer.reviewer.cancelJob"
      />

      <!-- Progress -->
      <template v-if="prReviewer.rightTab.value === 'progress'">
        <RunnerJobProgress
          v-if="prReviewer.reviewer.activeJob.value"
          :active-job="prReviewer.reviewer.activeJob.value"
          class="flex-1 overflow-hidden"
        />
        <div
          v-else
          class="flex flex-1 flex-col items-center justify-center gap-3 text-gray-700 select-none"
        >
          <UIcon name="i-lucide-search" class="text-5xl" />
          <div class="text-center">
            <p class="font-medium text-gray-600">
              從左側勾選 PR，開始自動 Code Review
            </p>
            <p class="mt-1 text-xs text-gray-600">
              Claude 會分析程式碼並在 GitHub 上留下 Review 意見
            </p>
          </div>
        </div>
      </template>

      <!-- History -->
      <template v-else-if="prReviewer.rightTab.value === 'history'">
        <RunnerJobHistory :history="prReviewer.history.value" />
      </template>

      <!-- Today's review summary (always visible at bottom) -->
      <div class="shrink-0 border-t border-gray-800 bg-gray-900/50">
        <div class="flex items-center justify-between px-4 py-2">
          <span class="text-xs font-medium text-gray-400">
            今日 Review 摘要
            <span v-if="prReviewer.reviewHistory.reviews.value.length > 0">
              ({{ prReviewer.reviewHistory.reviews.value.length }})
            </span>
          </span>
          <UButton
            v-if="prReviewer.reviewHistory.reviews.value.length > 0"
            size="xs"
            variant="ghost"
            icon="i-lucide-send"
            @click="showSlackModal = true"
          >
            發送到 Slack
          </UButton>
        </div>

        <!-- Empty state -->
        <div
          v-if="prReviewer.reviewHistory.reviews.value.length === 0"
          class="px-4 pb-3 text-center text-xs text-gray-600"
        >
          今天還沒有 Review 紀錄
        </div>

        <!-- Review list -->
        <template v-else>
          <div class="max-h-40 overflow-y-auto px-4 pb-3">
            <div
              v-for="review in prReviewer.reviewHistory.reviews.value"
              :key="review.id"
              class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs"
            >
              <span class="shrink-0 font-mono text-blue-400"
                >{{ review.repoLabel }}#{{ review.prNumber }}</span
              >
              <span class="min-w-0 truncate text-gray-500">{{
                review.prTitle
              }}</span>
              <div class="ml-auto flex shrink-0 items-center gap-1.5">
                <span v-if="review.blockers > 0" class="text-red-400"
                  >🔴{{ review.blockers }}</span
                >
                <span v-if="review.majors > 0" class="text-yellow-400"
                  >🟡{{ review.majors }}</span
                >
                <span v-if="review.minors > 0" class="text-green-400"
                  >🟢{{ review.minors }}</span
                >
                <span v-if="review.suggestions > 0" class="text-blue-400"
                  >💡{{ review.suggestions }}</span
                >
              </div>
            </div>
          </div>
          <!-- Stats bar -->
          <div
            class="flex items-center gap-4 border-t border-gray-800/50 px-4 py-2 text-xs text-gray-500"
          >
            <span>🔴 {{ prReviewer.reviewHistory.totalBlockers.value }}</span>
            <span>🟡 {{ prReviewer.reviewHistory.totalMajors.value }}</span>
            <span>🟢 {{ prReviewer.reviewHistory.totalMinors.value }}</span>
            <span
              >💡 {{ prReviewer.reviewHistory.totalSuggestions.value }}</span
            >
          </div>
        </template>
      </div>
    </div>

    <!-- Slack send modal -->
    <UModal v-model:open="showSlackModal">
      <template #content>
        <div class="p-6">
          <h3 class="mb-4 text-sm font-semibold text-white">
            發送今日 Review 報告到 Slack
          </h3>
          <div class="mb-4">
            <label class="mb-1 block text-xs text-gray-400">Channel 名稱</label>
            <input
              v-model="slackChannel"
              class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 placeholder-gray-600 focus:border-purple-500 focus:outline-none"
              placeholder="#channel-name"
              @keydown.enter="handleSendToSlack"
            />
            <p class="mt-1 text-xs text-gray-600">
              輸入 Slack channel 名稱，例如 #code-review
            </p>
          </div>
          <div class="flex justify-end gap-2">
            <UButton size="sm" variant="ghost" @click="showSlackModal = false">
              取消
            </UButton>
            <UButton
              size="sm"
              color="primary"
              icon="i-lucide-send"
              :disabled="
                !slackChannel.trim() || prReviewer.reviewHistory.sending.value
              "
              :loading="prReviewer.reviewHistory.sending.value"
              @click="handleSendToSlack"
            >
              發送
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
