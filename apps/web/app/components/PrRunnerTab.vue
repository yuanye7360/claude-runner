<script setup lang="ts">
import { usePrReviewRunner } from '~/composables/usePrReviewRunner';

const props = defineProps<{
  crCreatedPrUrls: string[];
}>();

const prRunner = usePrReviewRunner({
  crCreatedPrUrls: toRef(props, 'crCreatedPrUrls'),
});

defineExpose({
  loadPRs: prRunner.loadPRs,
  loadHistory: prRunner.loadHistory,
  pr: prRunner.pr,
  prsWithNotifications: prRunner.prsWithNotifications,
  prNotifications: prRunner.prNotifications,
});
</script>

<template>
  <div class="flex flex-1 overflow-hidden">
    <!-- Left: PR list (full height) -->
    <div
      class="flex w-96 shrink-0 flex-col overflow-hidden border-r border-gray-800"
    >
      <!-- Header -->
      <div
        class="flex h-11 shrink-0 items-center gap-2 border-b border-gray-800 px-4"
      >
        <span class="text-sm font-medium text-gray-300">PR Reviews</span>
        <span
          v-if="
            !prRunner.loading.value &&
            prRunner.filteredGroups.value.reduce(
              (a, g) => a + g.prs.length,
              0,
            ) > 0
          "
          class="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400"
        >
          {{
            prRunner.filteredGroups.value.reduce((a, g) => a + g.prs.length, 0)
          }}
        </span>
        <div class="ml-auto flex items-center gap-1">
          <button
            class="flex items-center rounded px-1.5 py-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
            :class="{
              'pointer-events-none opacity-50': prRunner.loading.value,
            }"
            @click="prRunner.loadPRs()"
          >
            <UIcon
              name="i-lucide-refresh-cw"
              :class="{ 'animate-spin': prRunner.loading.value }"
              style="font-size: 0.85em"
            />
          </button>
        </div>
      </div>

      <!-- Selection count -->
      <div
        v-if="prRunner.selectedCount.value"
        class="shrink-0 border-b border-gray-800/60 px-4 py-1.5"
      >
        <span class="text-xs font-medium text-green-400">
          已選 {{ prRunner.selectedCount.value }}
        </span>
      </div>

      <!-- PR list (full remaining height) -->
      <div class="flex-1 overflow-y-auto">
        <div v-if="prRunner.loading.value" class="space-y-1.5 p-2">
          <div
            v-for="n in 5"
            :key="n"
            class="h-12 animate-pulse rounded-lg bg-gray-800/50"
          ></div>
        </div>

        <div v-else-if="prRunner.loadError.value" class="p-4 text-center">
          <UIcon name="i-lucide-wifi-off" class="mb-2 text-xl text-red-500" />
          <p class="mb-2 text-xs text-gray-500">
            {{ prRunner.loadError.value }}
          </p>
          <UButton size="xs" @click="prRunner.loadPRs()">重試</UButton>
        </div>

        <div
          v-else-if="prRunner.filteredGroups.value.length === 0"
          class="p-6 text-center text-gray-600"
        >
          <UIcon name="i-lucide-git-pull-request" class="mb-2 text-2xl" />
          <p class="text-xs">沒有待處理的 PR</p>
        </div>

        <div v-else class="space-y-1 p-2">
          <div
            v-for="group in prRunner.filteredGroups.value"
            :key="group.repo"
            class="mb-2"
          >
            <!-- Repo group header -->
            <button
              class="flex w-full items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-gray-800/50"
              @click="prRunner.toggleRepoCollapse(group.repo)"
            >
              <UIcon
                :name="
                  prRunner.collapsedRepos.value.has(group.repo)
                    ? 'i-lucide-chevron-right'
                    : 'i-lucide-chevron-down'
                "
                class="shrink-0 text-sm text-gray-500 transition-transform duration-150"
              />
              <span class="truncate text-xs font-medium text-gray-300">
                {{ group.repo.split('/')[1] || group.repo }}
              </span>
              <span class="truncate text-xs text-gray-600">
                {{ group.repo.split('/')[0] }}
              </span>
              <span
                class="ml-auto rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-500 tabular-nums"
              >
                {{ group.prs.length }}
              </span>
            </button>

            <!-- PR items (indented) -->
            <div
              v-show="!prRunner.collapsedRepos.value.has(group.repo)"
              class="ml-3 space-y-1 border-l border-gray-800/60 pt-1 pl-2"
            >
              <div
                v-for="prItem in group.prs"
                :key="prItem.number"
                role="button"
                tabindex="0"
                class="group flex w-full items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-all duration-150"
                :class="[
                  prRunner.pr.isRunning.value
                    ? 'cursor-default opacity-70'
                    : 'cursor-pointer hover:-translate-y-px hover:border-gray-700/50 hover:bg-gray-800/60 hover:shadow-lg hover:shadow-black/20',
                  prRunner.selected.value.has(
                    prRunner.prKey(group.repo, prItem.number),
                  )
                    ? 'border-green-500/20 bg-green-500/5'
                    : '',
                ]"
                @click="prRunner.togglePR(group.repo, prItem.number)"
              >
                <UCheckbox
                  :model-value="
                    prRunner.selected.value.has(
                      prRunner.prKey(group.repo, prItem.number),
                    )
                  "
                  class="pointer-events-none mt-0.5 shrink-0"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <a
                      :href="prItem.html_url"
                      target="_blank"
                      rel="noopener"
                      class="shrink-0 font-mono text-sm font-semibold text-green-400 underline-offset-2 hover:underline"
                      @click.stop
                      >#{{ prItem.number }}</a
                    >
                    <UBadge
                      v-if="prItem.draft"
                      color="neutral"
                      variant="soft"
                      size="xs"
                    >
                      Draft
                    </UBadge>
                    <UBadge
                      v-if="prRunner.isFromClaudeRunner(prItem.html_url)"
                      color="warning"
                      variant="soft"
                      size="xs"
                    >
                      from JIRA
                    </UBadge>
                  </div>
                  <p class="mt-1 truncate text-sm leading-snug text-gray-400">
                    {{ prItem.title }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Run button (pinned to bottom) -->
      <div class="shrink-0 border-t border-gray-800 px-3 py-2">
        <UButton
          class="w-full justify-center"
          size="sm"
          color="success"
          :disabled="
            !prRunner.selectedCount.value || prRunner.pr.isRunning.value
          "
          :loading="prRunner.pr.isRunning.value"
          icon="i-lucide-git-pull-request"
          @click="prRunner.runPR()"
        >
          {{
            prRunner.pr.isRunning.value
              ? '修復中...'
              : `修復 Review${prRunner.selectedCount.value ? ` (${prRunner.selectedCount.value})` : ''}`
          }}
        </UButton>
      </div>
    </div>

    <!-- Right: PR detail panel -->
    <div class="flex flex-1 flex-col overflow-hidden">
      <!-- Tab bar -->
      <div class="flex shrink-0 items-center border-b border-gray-800 px-1">
        <button
          class="-mb-px flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm transition-colors"
          :class="
            prRunner.rightTab.value === 'progress'
              ? 'border-primary-500 font-medium text-white'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          "
          @click="prRunner.rightTab.value = 'progress'"
        >
          <UIcon
            v-if="prRunner.pr.isRunning.value"
            name="i-lucide-loader-circle"
            class="text-primary-400 animate-spin"
            style="font-size: 0.8em"
          />
          執行過程
        </button>
        <button
          class="-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors"
          :class="
            prRunner.rightTab.value === 'history'
              ? 'border-primary-500 font-medium text-white'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          "
          @click="prRunner.rightTab.value = 'history'"
        >
          執行紀錄
          <span
            v-if="prRunner.history.value.length > 0"
            class="rounded-full bg-gray-700 px-1.5 py-0.5 text-xs leading-none text-gray-400"
          >
            {{ prRunner.history.value.length }}
          </span>
        </button>
      </div>

      <!-- Status row -->
      <RunnerStatusRow
        v-if="prRunner.pr.activeJob.value"
        :active-job="prRunner.pr.activeJob.value"
        :is-running="prRunner.pr.isRunning.value"
        :success-count="prRunner.pr.successCount.value"
        :error-count="prRunner.pr.errorCount.value"
        :elapsed="prRunner.pr.elapsed.value"
        :expanded="prRunner.rowExpanded.value"
        :get-item-url="prRunner.getPrUrl"
        @update:expanded="prRunner.rowExpanded.value = $event"
        @cancel="prRunner.pr.cancelJob"
      />

      <!-- Progress -->
      <template v-if="prRunner.rightTab.value === 'progress'">
        <RunnerJobProgress
          v-if="prRunner.pr.activeJob.value"
          :active-job="prRunner.pr.activeJob.value"
          class="flex-1 overflow-hidden"
        />
        <div
          v-else
          class="flex flex-1 flex-col items-center justify-center gap-3 text-gray-700 select-none"
        >
          <UIcon name="i-lucide-git-pull-request" class="text-5xl" />
          <div class="text-center">
            <p class="font-medium text-gray-600">
              從左側選擇 PR，開始自動修復 Review
            </p>
            <p class="mt-1 text-xs text-gray-600">
              Claude 會自動分析 Review 意見、修復程式碼並 Push
            </p>
          </div>
        </div>
      </template>

      <!-- History -->
      <template v-else-if="prRunner.rightTab.value === 'history'">
        <RunnerJobHistory
          :history="prRunner.history.value"
          :get-item-url="prRunner.getPrUrl"
          @clear="prRunner.clearHistory()"
        />
      </template>
    </div>
  </div>
</template>
