<script setup lang="ts">
import { useRepoConfigs } from '~/composables/useRepoConfigs';

const { repoConfigs, newConfig, startEditConfig, deleteConfig, validateRepo } =
  useRepoConfigs();

const open = ref(false);
const confirmDelete = ref<null | string>(null);

watch(open, (v) => {
  if (!v) confirmDelete.value = null;
});
</script>

<template>
  <UPopover v-model:open="open">
    <button
      data-tour="repos"
      class="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[#888] transition-colors hover:bg-[rgb(255_255_255/4%)] hover:text-[#ccc]"
      :class="{ 'text-[#8b5cf6]': open }"
    >
      <UIcon name="i-lucide-folder-git-2" style="font-size: 1em" />
      <span class="text-xs">Repos</span>
      <span
        v-if="repoConfigs.length > 0"
        class="bg-primary-500/20 rounded-full px-1.5 py-0.5 text-xs leading-none text-[#8b5cf6] tabular-nums"
      >
        {{ repoConfigs.length }}
      </span>
    </button>

    <template #content>
      <div
        class="w-80 rounded-xl border border-[rgb(255_255_255/8%)] bg-[rgb(255_255_255/2%)] p-3"
      >
        <div class="mb-2 flex items-center justify-between">
          <span class="text-xs font-medium text-[#ccc]">Repos</span>
          <button
            class="rounded px-1.5 py-0.5 text-xs text-[#8b5cf6] transition-colors hover:bg-[#8b5cf6]/10"
            @click="newConfig()"
          >
            + 新增
          </button>
        </div>

        <div v-if="repoConfigs.length === 0" class="py-4 text-center">
          <p class="text-xs text-[#444]">尚無 Repo</p>
        </div>

        <div v-else class="max-h-64 space-y-1.5 overflow-y-auto">
          <div
            v-for="repo in repoConfigs"
            :key="repo.id"
            class="group rounded-lg border border-[rgb(255_255_255/8%)] bg-[rgb(255_255_255/4%)] px-3 py-2 transition-colors hover:border-[rgb(255_255_255/8%)]"
          >
            <div class="flex items-center justify-between">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <span class="text-xs font-medium text-[#fafafa]">{{
                    repo.name
                  }}</span>
                  <span
                    v-if="repo.validationStatus === 'valid'"
                    class="text-xs text-green-500"
                    >✓</span
                  >
                  <span
                    v-else-if="repo.validationStatus === 'invalid'"
                    class="text-xs text-red-500"
                    >✗</span
                  >
                </div>
                <div class="mt-0.5 truncate text-xs text-[#444]">
                  {{ repo.githubRepo }}
                </div>
              </div>
              <div
                class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <button
                  class="rounded p-1 text-[#444] hover:text-[#888]"
                  title="驗證"
                  @click="validateRepo(repo.id)"
                >
                  <UIcon
                    name="i-lucide-shield-check"
                    style="font-size: 0.8em"
                  />
                </button>
                <button
                  class="rounded p-1 text-[#444] hover:text-[#888]"
                  title="編輯"
                  @click="startEditConfig(repo)"
                >
                  <UIcon name="i-lucide-pencil" style="font-size: 0.8em" />
                </button>
                <button
                  v-if="confirmDelete !== repo.id"
                  class="rounded p-1 text-[#444] hover:text-red-400"
                  title="刪除"
                  @click="confirmDelete = repo.id"
                >
                  <UIcon name="i-lucide-trash-2" style="font-size: 0.8em" />
                </button>
                <button
                  v-else
                  class="rounded bg-red-600/10 p-1 text-red-400"
                  @click="
                    deleteConfig(repo.id);
                    confirmDelete = null;
                  "
                >
                  <UIcon name="i-lucide-check" style="font-size: 0.8em" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UPopover>

  <!-- Repo Modal (shared via useRepoConfigs singleton) -->
  <JiraRepoModal />
</template>
