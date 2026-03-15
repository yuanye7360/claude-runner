<script setup lang="ts">
import type { SkillDetail, SkillItem } from '~/composables/useSkills';

import { useSkills } from '~/composables/useSkills';

useHead({ title: 'Claude Runner — Skills' });

const {
  skills: skillList,
  loaded,
  modePresets,
  enabledSkillNames,
  fetchSkills,
  fetchSkillDetail,
  toggle: toggleSkill,
  updatePreset,
  createSkill,
  updateSkill,
  deleteSkill,
} = useSkills();

// ── Selected skill detail ────────────────────────────────
const selectedSkill = ref<null | SkillDetail>(null);
const selectedName = ref('');
const loadingDetail = ref(false);

async function selectSkill(skill: SkillItem) {
  if (selectedName.value === skill.name) {
    selectedName.value = '';
    selectedSkill.value = null;
    return;
  }
  selectedName.value = skill.name;
  loadingDetail.value = true;
  selectedSkill.value = await fetchSkillDetail(skill.name);
  loadingDetail.value = false;
}

// ── Edit mode ────────────────────────────────────────────
const editing = ref(false);
const editForm = ref({ content: '', description: '', inject: '' });
const saving = ref(false);

function startEdit() {
  if (!selectedSkill.value) return;
  editForm.value = {
    content: selectedSkill.value.content,
    description: selectedSkill.value.description,
    inject: selectedSkill.value.inject || 'context',
  };
  editing.value = true;
}

async function saveEdit() {
  if (!selectedSkill.value) return;
  saving.value = true;
  try {
    await updateSkill(selectedName.value, editForm.value);
    selectedSkill.value = await fetchSkillDetail(selectedName.value);
    editing.value = false;
  } finally {
    saving.value = false;
  }
}

function cancelEdit() {
  editing.value = false;
}

// ── Delete ───────────────────────────────────────────────
const confirmDelete = ref(false);
const deleting = ref(false);

async function doDelete() {
  deleting.value = true;
  try {
    await deleteSkill(selectedName.value);
    selectedSkill.value = null;
    selectedName.value = '';
    confirmDelete.value = false;
  } finally {
    deleting.value = false;
  }
}

// ── Create ───────────────────────────────────────────────
const showCreate = ref(false);
const newSkill = ref({
  content: '',
  description: '',
  inject: 'context',
  name: '',
});
const createError = ref('');
const creating = ref(false);

async function doCreate() {
  if (!newSkill.value.name.trim() || !newSkill.value.content.trim()) return;
  creating.value = true;
  createError.value = '';
  try {
    await createSkill(newSkill.value);
    newSkill.value = {
      content: '',
      description: '',
      inject: 'context',
      name: '',
    };
    showCreate.value = false;
  } catch (error: unknown) {
    const msg =
      (error as { data?: { message?: string } })?.data?.message ||
      (error as Error).message;
    createError.value = msg;
  } finally {
    creating.value = false;
  }
}

// ── Preset editing ───────────────────────────────────────
const editingPresets = ref(false);
const presetDraft = ref<Record<string, string[]>>({});

function startEditPresets() {
  presetDraft.value = structuredClone(toRaw(modePresets.value));
  editingPresets.value = true;
}

function togglePresetSkill(mode: string, skillName: string) {
  const arr = presetDraft.value[mode] || [];
  const idx = arr.indexOf(skillName);
  if (idx === -1) {
    arr.push(skillName);
  } else {
    arr.splice(idx, 1);
  }
  presetDraft.value[mode] = [...arr];
}

function savePresets() {
  for (const [mode, names] of Object.entries(presetDraft.value)) {
    updatePreset(mode, names);
  }
  editingPresets.value = false;
}

const INJECT_OPTIONS = [
  { label: '通用 (context)', value: 'context' },
  { label: '分支 (branch)', value: 'branch' },
  { label: 'PR (pr)', value: 'pr' },
  { label: '工時 (worklog)', value: 'worklog' },
  { label: 'JIRA (jira)', value: 'jira' },
];

// ── Init ─────────────────────────────────────────────────
onMounted(() => {
  if (!loaded.value) fetchSkills();
});
</script>

<template>
  <div class="flex h-screen flex-col bg-gray-950 text-gray-100">
    <!-- ══════ Top nav ══════ -->
    <div
      class="flex h-12 shrink-0 items-center gap-3 border-b border-gray-800 px-4"
    >
      <NuxtLink to="/" class="flex items-center gap-2 hover:opacity-80">
        <span class="text-primary-400 text-lg">&#9889;</span>
        <span class="font-semibold text-white">Claude Runner</span>
      </NuxtLink>
      <span class="text-gray-600">/</span>
      <span class="text-sm font-medium text-gray-300">Skills 管理</span>

      <div class="ml-auto flex items-center gap-2">
        <span class="text-xs text-gray-600">
          已啟用 {{ enabledSkillNames.length }} / {{ skillList.length }}
        </span>
        <button
          class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          @click="startEditPresets"
        >
          <UIcon name="i-lucide-sliders-horizontal" />
          模式預設
        </button>
        <button
          class="bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors"
          @click="showCreate = true"
        >
          <UIcon name="i-lucide-plus" />
          新增 Skill
        </button>
      </div>
    </div>

    <!-- ══════ Skills ══════ -->
    <div class="flex min-h-0 flex-1">
      <!-- ── Skill list (left) ── -->
      <div
        class="w-80 shrink-0 overflow-y-auto border-r border-gray-800 lg:w-96"
      >
        <div v-if="!loaded" class="p-4 text-sm text-gray-600">載入中...</div>
        <div
          v-else-if="skillList.length === 0"
          class="p-4 text-sm text-gray-600"
        >
          尚無 Skill
        </div>
        <div v-else class="divide-y divide-gray-800/60">
          <div
            v-for="skill in skillList"
            :key="skill.name"
            class="flex cursor-pointer items-start gap-3 px-4 py-3 transition-all duration-100"
            :class="[
              selectedName === skill.name
                ? 'bg-primary-500/10 border-l-primary-400 border-l-2'
                : 'border-l-2 border-l-transparent hover:bg-gray-900/60',
            ]"
            @click="selectSkill(skill)"
          >
            <UCheckbox
              :model-value="skill.enabled"
              class="mt-0.5 shrink-0"
              @click.stop="toggleSkill(skill.name)"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate text-sm font-medium text-gray-200">{{
                  skill.name
                }}</span>
                <UBadge
                  :color="skill.source === 'project' ? 'success' : 'neutral'"
                  variant="soft"
                  size="xs"
                >
                  {{ skill.source === 'project' ? 'Project' : 'Global' }}
                </UBadge>
                <UBadge
                  v-if="skill.inject && skill.inject !== 'context'"
                  color="info"
                  variant="soft"
                  size="xs"
                >
                  {{ skill.inject }}
                </UBadge>
              </div>
              <p class="mt-0.5 line-clamp-2 text-xs text-gray-500">
                {{ skill.description }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Detail panel (right) ── -->
      <div class="flex flex-1 flex-col overflow-y-auto">
        <!-- Empty state -->
        <div
          v-if="!selectedSkill && !loadingDetail"
          class="flex flex-1 items-center justify-center text-gray-600"
        >
          <div class="text-center">
            <UIcon
              name="i-heroicons-cube"
              class="mx-auto mb-2 text-3xl text-gray-700"
            />
            <p class="text-sm">選擇一個 Skill 查看詳情</p>
          </div>
        </div>

        <!-- Loading -->
        <div
          v-else-if="loadingDetail"
          class="flex flex-1 items-center justify-center text-gray-600"
        >
          <p class="text-sm">載入中...</p>
        </div>

        <!-- Detail view -->
        <div v-else-if="selectedSkill" class="flex flex-1 flex-col">
          <!-- Header -->
          <div
            class="flex shrink-0 items-center justify-between border-b border-gray-800 px-6 py-4"
          >
            <div>
              <h2 class="text-lg font-semibold text-white">
                {{ selectedSkill.name }}
              </h2>
              <p class="mt-0.5 text-sm text-gray-500">
                {{ selectedSkill.description }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <UBadge
                :color="
                  selectedSkill.source === 'project' ? 'success' : 'neutral'
                "
                variant="soft"
              >
                {{ selectedSkill.source === 'project' ? 'Project' : 'Global' }}
              </UBadge>
              <UBadge color="info" variant="soft">
                inject: {{ selectedSkill.inject || 'context' }}
              </UBadge>
            </div>
          </div>

          <!-- Content / Edit -->
          <div class="flex-1 overflow-y-auto p-6">
            <!-- View mode -->
            <template v-if="!editing">
              <pre
                class="rounded-lg bg-gray-900 p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap text-gray-300"
                >{{ selectedSkill.content }}</pre
              >
            </template>

            <!-- Edit mode -->
            <template v-else>
              <div class="space-y-4">
                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-500"
                    >說明</label
                  >
                  <input
                    v-model="editForm.description"
                    class="focus:ring-primary-500 w-full rounded bg-gray-900 px-3 py-2 text-sm text-gray-100 ring-1 ring-gray-700 outline-none focus:ring-1"
                  />
                </div>
                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-500"
                    >注入位置</label
                  >
                  <select
                    v-model="editForm.inject"
                    class="focus:ring-primary-500 rounded bg-gray-900 px-3 py-2 text-sm text-gray-100 ring-1 ring-gray-700 outline-none focus:ring-1"
                  >
                    <option
                      v-for="opt in INJECT_OPTIONS"
                      :key="opt.value"
                      :value="opt.value"
                    >
                      {{ opt.label }}
                    </option>
                  </select>
                </div>
                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-500"
                    >內容 (Markdown)</label
                  >
                  <textarea
                    v-model="editForm.content"
                    rows="20"
                    class="focus:ring-primary-500 w-full rounded bg-gray-900 px-3 py-2 font-mono text-sm leading-relaxed text-gray-100 ring-1 ring-gray-700 outline-none focus:ring-1"
                  ></textarea>
                </div>
              </div>
            </template>
          </div>

          <!-- Footer actions -->
          <div
            class="flex shrink-0 items-center gap-2 border-t border-gray-800 px-6 py-3"
          >
            <template v-if="!editing">
              <UButton
                v-if="selectedSkill.source === 'project'"
                size="sm"
                @click="startEdit"
              >
                <UIcon name="i-lucide-pencil" class="mr-1" />
                編輯
              </UButton>
              <UButton
                v-else
                size="sm"
                variant="soft"
                disabled
                title="Global skill 請至 ~/.claude/skills/ 編輯"
              >
                <UIcon name="i-lucide-pencil" class="mr-1" />
                編輯 (僅限 Project)
              </UButton>
              <UButton
                v-if="selectedSkill.source === 'project'"
                size="sm"
                color="error"
                variant="soft"
                @click="confirmDelete = true"
              >
                <UIcon name="i-lucide-trash-2" class="mr-1" />
                刪除
              </UButton>
            </template>
            <template v-else>
              <UButton size="sm" :loading="saving" @click="saveEdit">
                儲存
              </UButton>
              <UButton
                size="sm"
                color="neutral"
                variant="ghost"
                @click="cancelEdit"
              >
                取消
              </UButton>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════ Create modal ══════ -->
    <UModal v-model:open="showCreate">
      <template #content>
        <div class="bg-gray-900 p-6">
          <h3 class="mb-4 text-lg font-semibold text-white">新增 Skill</h3>
          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-xs text-gray-500">名稱</label>
              <input
                v-model="newSkill.name"
                placeholder="my-custom-skill"
                class="focus:ring-primary-500 w-full rounded bg-gray-800 px-3 py-2 font-mono text-sm text-gray-100 ring-1 ring-gray-700 outline-none focus:ring-1"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs text-gray-500">說明</label>
              <input
                v-model="newSkill.description"
                placeholder="這個 skill 做什麼..."
                class="focus:ring-primary-500 w-full rounded bg-gray-800 px-3 py-2 text-sm text-gray-100 ring-1 ring-gray-700 outline-none focus:ring-1"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs text-gray-500">注入位置</label>
              <select
                v-model="newSkill.inject"
                class="focus:ring-primary-500 rounded bg-gray-800 px-3 py-2 text-sm text-gray-100 ring-1 ring-gray-700 outline-none focus:ring-1"
              >
                <option
                  v-for="opt in INJECT_OPTIONS"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-xs text-gray-500"
                >內容 (Markdown)</label
              >
              <textarea
                v-model="newSkill.content"
                rows="12"
                placeholder="Skill 的 Markdown 指令內容..."
                class="focus:ring-primary-500 w-full rounded bg-gray-800 px-3 py-2 font-mono text-sm text-gray-100 ring-1 ring-gray-700 outline-none focus:ring-1"
              ></textarea>
            </div>
          </div>
          <p v-if="createError" class="mt-2 text-xs text-red-400">
            {{ createError }}
          </p>
          <div class="mt-4 flex gap-2">
            <UButton
              :loading="creating"
              :disabled="!newSkill.name.trim() || !newSkill.content.trim()"
              @click="doCreate"
            >
              建立
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="showCreate = false"
            >
              取消
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- ══════ Delete confirmation modal ══════ -->
    <UModal v-model:open="confirmDelete">
      <template #content>
        <div class="bg-gray-900 p-6">
          <h3 class="mb-2 text-lg font-semibold text-white">確認刪除</h3>
          <p class="mb-4 text-sm text-gray-400">
            確定要刪除 skill
            <span class="font-mono text-red-400">{{ selectedName }}</span>
            ？此操作無法復原。
          </p>
          <div class="flex gap-2">
            <UButton color="error" :loading="deleting" @click="doDelete">
              刪除
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="confirmDelete = false"
            >
              取消
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- ══════ Presets modal ══════ -->
    <UModal v-model:open="editingPresets">
      <template #content>
        <div class="bg-gray-900 p-6">
          <h3 class="mb-4 text-lg font-semibold text-white">模式預設</h3>
          <p class="mb-4 text-xs text-gray-500">
            設定每個模式切換時自動啟用的 skills
          </p>
          <div class="space-y-6">
            <div
              v-for="mode in Object.keys(presetDraft)"
              :key="mode"
              class="rounded-lg border border-gray-700 p-4"
            >
              <div class="mb-2 text-sm font-medium text-gray-300 capitalize">
                {{ mode }} 模式
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="skill in skillList"
                  :key="skill.name"
                  class="rounded-lg border px-2.5 py-1 text-xs transition-all"
                  :class="
                    (presetDraft[mode] || []).includes(skill.name)
                      ? 'border-primary-500/40 bg-primary-500/10 text-primary-400'
                      : 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-400'
                  "
                  @click="togglePresetSkill(mode, skill.name)"
                >
                  {{ skill.name }}
                </button>
              </div>
            </div>
          </div>
          <div class="mt-4 flex gap-2">
            <UButton @click="savePresets">儲存</UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="editingPresets = false"
            >
              取消
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
