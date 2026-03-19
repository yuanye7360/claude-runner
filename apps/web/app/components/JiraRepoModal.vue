<script setup lang="ts">
import { useRepoConfigs } from '~/composables/useRepoConfigs';

const { editingConfig, saveConfig, cancelEdit, validatePath, testConnection } =
  useRepoConfigs();

const showModal = computed(() => editingConfig.value !== null);
const modalPathResult = ref<null | { error?: string; valid: boolean }>(null);
const modalConnResult = ref<null | { error?: string; valid: boolean }>(null);
const validating = ref(false);
const testing = ref(false);
const saveError = ref<null | string>(null);

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

function onCancel() {
  cancelEdit();
  modalPathResult.value = null;
  modalConnResult.value = null;
  saveError.value = null;
}

defineExpose({ resetState: onCancel });
</script>

<template>
  <Teleport to="body">
    <div
      v-if="showModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      @click.self="onCancel()"
    >
      <div
        class="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl"
      >
        <h2 class="mb-4 text-base font-semibold text-white">
          {{ editingConfig?.id ? '編輯 Repo' : '新增 Repo' }}
        </h2>

        <div class="space-y-3">
          <div>
            <label class="mb-1 block text-xs text-gray-500">名稱</label>
            <input
              v-model="editingConfig!.name"
              class="w-full rounded-md border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-gray-300 placeholder-gray-600 outline-none focus:border-gray-600"
              placeholder="b2c-web"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs text-gray-500">GitHub Repo</label>
            <input
              v-model="editingConfig!.githubRepo"
              class="w-full rounded-md border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-gray-300 placeholder-gray-600 outline-none focus:border-gray-600"
              placeholder="kkday-it/kkday-b2c-web"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs text-gray-500">Label</label>
            <input
              v-model="editingConfig!.label"
              class="w-full rounded-md border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-gray-300 placeholder-gray-600 outline-none focus:border-gray-600"
              placeholder="b2c-web"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs text-gray-500">本機路徑</label>
            <input
              v-model="editingConfig!.cwd"
              class="w-full rounded-md border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-gray-300 placeholder-gray-600 outline-none focus:border-gray-600"
              placeholder="/Users/you/KKday/kkday-b2c-web"
            />
          </div>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <button
            class="rounded-md border border-blue-600 px-3 py-1.5 text-xs text-blue-400 transition-colors hover:bg-blue-600/10"
            :disabled="!editingConfig?.cwd || validating"
            @click="onValidatePath()"
          >
            {{ validating ? '驗證中...' : '驗證路徑' }}
          </button>
          <button
            class="rounded-md border border-blue-600 px-3 py-1.5 text-xs text-blue-400 transition-colors hover:bg-blue-600/10 disabled:cursor-not-allowed disabled:text-gray-600"
            :disabled="!editingConfig?.githubRepo || testing"
            @click="onTestConnection()"
          >
            {{ testing ? '測試中...' : '測試 GitHub 連線' }}
          </button>
        </div>

        <div v-if="modalPathResult" class="mt-2 text-xs">
          <span v-if="modalPathResult.valid" class="text-green-400"
            >✓ 路徑有效</span
          >
          <span v-else class="text-red-400">✗ {{ modalPathResult.error }}</span>
        </div>
        <div v-if="modalConnResult" class="mt-1 text-xs">
          <span v-if="modalConnResult.valid" class="text-green-400"
            >✓ GitHub 連線成功</span
          >
          <span v-else class="text-red-400">✗ {{ modalConnResult.error }}</span>
        </div>

        <div class="mt-6 flex justify-end gap-3">
          <button
            class="rounded-md px-4 py-2 text-sm text-gray-400 transition-colors hover:text-gray-300"
            @click="onCancel()"
          >
            取消
          </button>
          <button
            class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
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
</template>
