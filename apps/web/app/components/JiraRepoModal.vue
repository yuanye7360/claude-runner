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
            <label class="mb-1 block text-xs text-[#888]">GitHub Repo</label>
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

        <div v-if="modalPathResult" class="mt-2 text-xs">
          <span v-if="modalPathResult.valid" class="text-[#22c55e]"
            >✓ 路徑有效</span
          >
          <span v-else class="text-red-400">✗ {{ modalPathResult.error }}</span>
        </div>
        <div v-if="modalConnResult" class="mt-1 text-xs">
          <span v-if="modalConnResult.valid" class="text-[#22c55e]"
            >✓ GitHub 連線成功</span
          >
          <span v-else class="text-red-400">✗ {{ modalConnResult.error }}</span>
        </div>

        <div class="mt-6 flex justify-end gap-3">
          <button
            class="rounded-md px-4 py-2 text-sm text-[#888] transition-colors hover:text-[#ccc]"
            @click="onCancel()"
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
</template>
