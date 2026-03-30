<script setup lang="ts">
import { useRepoConfigs } from '~/composables/useRepoConfigs';

useHead({ title: 'Claude Runner — Repos' });

const {
  repoConfigs,
  editingConfig,
  newConfig,
  startEditConfig,
  saveConfig,
  cancelEdit,
  deleteConfig,
  validatePath,
  testConnection,
  validateRepo,
} = useRepoConfigs();

const showModal = computed(() => editingConfig.value !== null);
const modalPathResult = ref<null | { error?: string; valid: boolean }>(null);
const modalConnResult = ref<null | { error?: string; valid: boolean }>(null);
const validating = ref(false);
const testing = ref(false);

function openNew() {
  modalPathResult.value = null;
  modalConnResult.value = null;
  newConfig();
}

function openEdit(repo: (typeof repoConfigs.value)[0]) {
  modalPathResult.value = null;
  modalConnResult.value = null;
  startEditConfig(repo);
}

async function onValidatePath() {
  if (!editingConfig.value?.cwd) return;
  validating.value = true;
  modalPathResult.value = await validatePath(editingConfig.value.cwd);
  validating.value = false;
}

async function onTestConnection() {
  if (!editingConfig.value?.githubRepo) return;
  testing.value = true;
  modalConnResult.value = await testConnection(editingConfig.value.githubRepo);
  testing.value = false;
}

const saveError = ref<null | string>(null);
async function onSave() {
  try {
    saveError.value = null;
    await saveConfig();
    modalPathResult.value = null;
    modalConnResult.value = null;
  } catch (error: unknown) {
    saveError.value = error instanceof Error ? error.message : 'Failed to save';
  }
}

const confirmDelete = ref<null | string>(null);
async function onDelete(id: string) {
  try {
    await deleteConfig(id);
    confirmDelete.value = null;
  } catch {
    // silently handle — repo may already be deleted
  }
}
</script>

<template>
  <div class="flex flex-1 flex-col overflow-auto">
    <!-- Top nav -->
    <div
      class="flex h-12 shrink-0 items-center gap-3 border-b border-[rgb(255_255_255/6%)] px-4"
    >
      <NuxtLink to="/" class="flex items-center gap-2">
        <span class="text-[#8b5cf6] text-lg">⚡</span>
        <span class="font-semibold text-[#fafafa]">Claude Runner</span>
      </NuxtLink>
      <span class="text-sm text-[#888]">/ Repos</span>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-6">
      <div class="mx-auto max-w-3xl">
        <!-- Header -->
        <div class="mb-6 flex items-center justify-between">
          <div>
            <h1 class="text-lg font-semibold text-[#fafafa]">Repos</h1>
            <p class="text-sm text-[#888]">{{ repoConfigs.length }} 個專案</p>
          </div>
          <button
            class="rounded-lg bg-[#8b5cf6] px-4 py-2 text-sm font-medium text-[#fafafa] transition-colors hover:bg-[#8b5cf6]"
            @click="openNew()"
          >
            + 新增 Repo
          </button>
        </div>

        <!-- Repo Cards -->
        <div class="space-y-3">
          <div
            v-for="repo in repoConfigs"
            :key="repo.id"
            class="flex items-center gap-4 rounded-lg border border-[rgb(255_255_255/6%)] bg-[rgb(255_255_255/2%)] p-4 transition-colors hover:border-[rgb(255_255_255/8%)]"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="font-medium text-[#fafafa]">{{ repo.name }}</span>
                <span
                  v-if="repo.validationStatus === 'valid'"
                  class="rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-[#22c55e]"
                >
                  ✓ 驗證通過
                </span>
                <span
                  v-else-if="repo.validationStatus === 'invalid'"
                  class="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-400"
                >
                  ✗ {{ repo.validationError }}
                </span>
              </div>
              <div class="mt-1 text-sm text-[#888]">
                <span class="text-[#888]">{{ repo.githubRepo }}</span>
                <span class="mx-2">·</span>
                <span>{{ repo.cwd }}</span>
              </div>
            </div>

            <div class="flex shrink-0 gap-2">
              <button
                class="rounded-md border border-[rgb(255_255_255/8%)] px-3 py-1.5 text-xs text-[#888] transition-colors hover:border-[rgb(255_255_255/8%)] hover:text-[#ccc]"
                @click="validateRepo(repo.id)"
              >
                驗證
              </button>
              <button
                class="rounded-md border border-[rgb(255_255_255/8%)] px-3 py-1.5 text-xs text-[#888] transition-colors hover:border-[rgb(255_255_255/8%)] hover:text-[#ccc]"
                @click="openEdit(repo)"
              >
                編輯
              </button>
              <button
                v-if="confirmDelete !== repo.id"
                class="rounded-md border border-[rgb(255_255_255/8%)] px-3 py-1.5 text-xs text-red-400 transition-colors hover:border-red-600 hover:text-red-300"
                @click="confirmDelete = repo.id"
              >
                刪除
              </button>
              <button
                v-else
                class="rounded-md border border-red-600 bg-red-600/10 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-600/20"
                @click="onDelete(repo.id)"
              >
                確認刪除
              </button>
            </div>
          </div>

          <div
            v-if="repoConfigs.length === 0"
            class="py-12 text-center text-[#444]"
          >
            <UIcon name="i-lucide-folder-git-2" class="mb-3 text-4xl" />
            <p>尚無 Repo，點擊「新增 Repo」開始</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal -->
    <Teleport to="body">
      <div
        v-if="showModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        @click.self="cancelEdit()"
      >
        <div
          class="w-full max-w-lg rounded-xl border border-[rgb(255_255_255/8%)] bg-[rgb(255_255_255/2%)] p-6 shadow-2xl"
        >
          <h2 class="mb-4 text-base font-semibold text-[#fafafa]">
            {{ editingConfig?.id ? '編輯 Repo' : '新增 Repo' }}
          </h2>

          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-xs text-[#888]">名稱</label>
              <input
                v-model="editingConfig!.name"
                class="w-full rounded-md border border-[rgb(255_255_255/8%)] bg-[rgb(255_255_255/4%)] px-3 py-2 text-sm text-[#ccc] placeholder-[#444] outline-none focus:border-[rgb(255_255_255/8%)]"
                placeholder="b2c-web"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs text-[#888]"
                >GitHub Repo</label
              >
              <input
                v-model="editingConfig!.githubRepo"
                class="w-full rounded-md border border-[rgb(255_255_255/8%)] bg-[rgb(255_255_255/4%)] px-3 py-2 text-sm text-[#ccc] placeholder-[#444] outline-none focus:border-[rgb(255_255_255/8%)]"
                placeholder="kkday-it/kkday-b2c-web"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs text-[#888]">Label</label>
              <input
                v-model="editingConfig!.label"
                class="w-full rounded-md border border-[rgb(255_255_255/8%)] bg-[rgb(255_255_255/4%)] px-3 py-2 text-sm text-[#ccc] placeholder-[#444] outline-none focus:border-[rgb(255_255_255/8%)]"
                placeholder="b2c-web"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs text-[#888]">本機路徑</label>
              <input
                v-model="editingConfig!.cwd"
                class="w-full rounded-md border border-[rgb(255_255_255/8%)] bg-[rgb(255_255_255/4%)] px-3 py-2 text-sm text-[#ccc] placeholder-[#444] outline-none focus:border-[rgb(255_255_255/8%)]"
                placeholder="/Users/you/KKday/kkday-b2c-web"
              />
            </div>
          </div>

          <!-- Validation buttons -->
          <div class="mt-4 flex flex-wrap gap-2">
            <button
              class="rounded-md border border-[#8b5cf6] px-3 py-1.5 text-xs text-[#8b5cf6] transition-colors hover:bg-[#8b5cf6]/10"
              :disabled="!editingConfig?.cwd || validating"
              @click="onValidatePath()"
            >
              {{ validating ? '驗證中...' : '驗證路徑' }}
            </button>
            <button
              class="rounded-md border border-[#8b5cf6] px-3 py-1.5 text-xs text-[#8b5cf6] transition-colors hover:bg-[#8b5cf6]/10 disabled:cursor-not-allowed disabled:text-[#444]"
              :disabled="!editingConfig?.githubRepo || testing"
              @click="onTestConnection()"
            >
              {{ testing ? '測試中...' : '測試 GitHub 連線' }}
            </button>
          </div>

          <!-- Validation results -->
          <div v-if="modalPathResult" class="mt-2 text-xs">
            <span v-if="modalPathResult.valid" class="text-[#22c55e]"
              >✓ 路徑有效</span
            >
            <span v-else class="text-red-400"
              >✗ {{ modalPathResult.error }}</span
            >
          </div>
          <div v-if="modalConnResult" class="mt-1 text-xs">
            <span v-if="modalConnResult.valid" class="text-[#22c55e]"
              >✓ GitHub 連線成功</span
            >
            <span v-else class="text-red-400"
              >✗ {{ modalConnResult.error }}</span
            >
          </div>

          <!-- Actions -->
          <div class="mt-6 flex justify-end gap-3">
            <button
              class="rounded-md px-4 py-2 text-sm text-[#888] transition-colors hover:text-[#ccc]"
              @click="cancelEdit()"
            >
              取消
            </button>
            <button
              class="rounded-md bg-[#8b5cf6] px-4 py-2 text-sm font-medium text-[#fafafa] transition-colors hover:bg-[#8b5cf6]"
              :disabled="
                !editingConfig?.name ||
                !editingConfig?.githubRepo ||
                !editingConfig?.label ||
                !editingConfig?.cwd
              "
              @click="onSave()"
            >
              儲存
            </button>
          </div>
          <p v-if="saveError" class="mt-2 text-sm text-red-400">
            {{ saveError }}
          </p>
        </div>
      </div>
    </Teleport>
  </div>
</template>
