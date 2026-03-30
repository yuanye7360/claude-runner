<script setup lang="ts">
import type { SkillDetail, SkillItem } from '~/composables/useSkills';

import { useSkills } from '~/composables/useSkills';

useHead({ title: 'Claude Runner — Skills' });

const {
  skills: skillList,
  loaded,
  enabledSkillNames,
  fetchSkills,
  fetchSkillDetail,
  toggle: toggleSkill,
  createSkill,
  updateSkill,
  deleteSkill,
} = useSkills();

// ── Skill usage stats ────────────────────────────────────
interface SkillStat {
  name: string;
  triggerCount: number;
  successCount: number;
  lastUsedAt: null | string;
}
const skillStats = ref<Map<string, SkillStat>>(new Map());

async function fetchStats() {
  try {
    const data = await $fetch<SkillStat[]>('/api/skills/stats');
    const map = new Map<string, SkillStat>();
    for (const s of data) map.set(s.name, s);
    skillStats.value = map;
  } catch {
    // stats not critical
  }
}

function getStats(name: string): SkillStat {
  return (
    skillStats.value.get(name) || {
      name,
      triggerCount: 0,
      successCount: 0,
      lastUsedAt: null,
    }
  );
}

// ── KPI aggregates ──────────────────────────────────────
const totalTriggers = computed(() => {
  let sum = 0;
  for (const s of skillStats.value.values()) sum += s.triggerCount;
  return sum;
});

const avgSuccessRate = computed(() => {
  let total = 0;
  let success = 0;
  for (const s of skillStats.value.values()) {
    total += s.triggerCount;
    success += s.successCount;
  }
  return total > 0 ? Math.round((success / total) * 100) : 0;
});

const topSkill = computed(() => {
  let top: null | SkillStat = null;
  for (const s of skillStats.value.values()) {
    if (!top || s.triggerCount > top.triggerCount) top = s;
  }
  return top;
});

function fmtTimeAgo(iso: null | string): string {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}

// ── Grouped by source (accordion) ────────────────────────
interface SkillGroup {
  key: string;
  label: string;
  color: string;
  skills: SkillItem[];
}

const expandedGroups = ref<Set<string>>(
  new Set(['custom', 'external', 'project']),
);

function toggleGroup(key: string) {
  if (expandedGroups.value.has(key)) expandedGroups.value.delete(key);
  else expandedGroups.value.add(key);
}

const groupedSkills = computed<SkillGroup[]>(() => {
  const groups: Record<string, SkillItem[]> = {
    project: [],
    custom: [],
    external: [],
  };
  for (const s of skillList.value) {
    const key = s.source || 'external';
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  }
  const defs: { color: string; key: string; label: string }[] = [
    { key: 'project', label: 'Project', color: '#8b5cf6' },
    { key: 'custom', label: 'Server', color: '#06b6d4' },
    { key: 'external', label: 'Global', color: '#888' },
  ];
  return defs
    .filter((d) => (groups[d.key] ?? []).length > 0)
    .map((d) => ({ ...d, skills: groups[d.key] ?? [] }));
});

// ── Selected skill detail ────────────────────────────────
const selectedSkill = ref<null | (SkillDetail & { enabled: boolean })>(null);
const selectedName = ref('');
const loadingDetail = ref(false);
const showDetail = ref(false);

async function selectSkill(skill: SkillItem) {
  selectedName.value = skill.name;
  loadingDetail.value = true;
  showDetail.value = true;
  const detail = await fetchSkillDetail(skill.name);
  selectedSkill.value = detail ? { ...detail, enabled: skill.enabled } : null;
  loadingDetail.value = false;
}

// ── Edit / Create / Delete / Presets (keep existing logic) ──
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
  fetchStats();
});
</script>

<template>
  <div class="flex flex-1 flex-col overflow-auto p-6">
    <!-- ══════ KPI Header ══════ -->
    <div class="mb-6 grid grid-cols-4 gap-3">
      <div
        class="rounded-lg border p-4"
        style="
          background: rgb(255 255 255 / 2%);
          border-color: rgb(255 255 255 / 6%);
        "
      >
        <div
          class="text-[10px] font-medium tracking-wider text-[#888] uppercase"
        >
          Total Skills
        </div>
        <div
          class="mt-1 text-2xl font-bold tracking-tight text-[#fafafa] tabular-nums"
        >
          {{ skillList.length }}
        </div>
        <div class="mt-0.5 text-[10px] text-[#555]">
          {{ enabledSkillNames.length }} enabled
        </div>
      </div>
      <div
        class="rounded-lg border p-4"
        style="
          background: rgb(139 92 246 / 4%);
          border-color: rgb(139 92 246 / 12%);
        "
      >
        <div
          class="text-[10px] font-medium tracking-wider text-[#888] uppercase"
        >
          Total Triggers
        </div>
        <div
          class="mt-1 text-2xl font-bold tracking-tight text-[#8b5cf6] tabular-nums"
        >
          {{ totalTriggers }}
        </div>
        <div class="mt-0.5 text-[10px] text-[#555]">across all skills</div>
      </div>
      <div
        class="rounded-lg border p-4"
        style="
          background: rgb(34 197 94 / 4%);
          border-color: rgb(34 197 94 / 12%);
        "
      >
        <div
          class="text-[10px] font-medium tracking-wider text-[#888] uppercase"
        >
          Success Rate
        </div>
        <div
          class="mt-1 text-2xl font-bold tracking-tight text-[#22c55e] tabular-nums"
        >
          {{ avgSuccessRate }}%
        </div>
        <div class="mt-0.5 text-[10px] text-[#555]">average</div>
      </div>
      <div
        class="rounded-lg border p-4"
        style="
          background: rgb(6 182 212 / 4%);
          border-color: rgb(6 182 212 / 12%);
        "
      >
        <div
          class="text-[10px] font-medium tracking-wider text-[#888] uppercase"
        >
          Most Active
        </div>
        <div class="mt-1 truncate text-sm font-bold text-[#06b6d4]">
          {{ topSkill?.name || '—' }}
        </div>
        <div class="mt-0.5 text-[10px] text-[#555]">
          {{ topSkill?.triggerCount || 0 }} triggers
        </div>
      </div>
    </div>

    <!-- ══════ Action Bar ══════ -->
    <div class="mb-4 flex items-center gap-2">
      <span class="text-sm font-semibold text-[#fafafa]">Skills</span>
      <span
        class="rounded-full px-2 py-0.5 text-[10px] text-[#888] tabular-nums"
        style="background: rgb(255 255 255 / 4%)"
      >
        {{ enabledSkillNames.length }} / {{ skillList.length }}
      </span>
      <div class="ml-auto flex items-center gap-2">
        <button
          class="interactive flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[#8b5cf6] hover:bg-[rgb(139_92_246/8%)]"
          @click="showCreate = true"
        >
          <UIcon name="i-lucide-plus" />
          新增 Skill
        </button>
      </div>
    </div>

    <!-- ══════ Skill Groups (Accordion + Cards) ══════ -->
    <div v-if="!loaded" class="py-8 text-center text-sm text-[#444]">
      載入中...
    </div>
    <div
      v-else-if="skillList.length === 0"
      class="py-8 text-center text-sm text-[#444]"
    >
      尚無 Skill
    </div>
    <div v-else class="space-y-4">
      <div v-for="group in groupedSkills" :key="group.key">
        <!-- Group header -->
        <button
          class="interactive mb-2 flex w-full items-center gap-2 text-left"
          @click="toggleGroup(group.key)"
        >
          <UIcon
            name="i-lucide-chevron-right"
            class="shrink-0 text-xs text-[#555] transition-transform duration-150"
            :class="{ 'rotate-90': expandedGroups.has(group.key) }"
          />
          <span
            class="text-[11px] font-bold tracking-[1.5px] uppercase"
            :style="{ color: group.color }"
          >
            {{ group.label }}
          </span>
          <span
            class="rounded-full px-1.5 py-0.5 text-[9px] text-[#666] tabular-nums"
            style="background: rgb(255 255 255 / 4%)"
          >
            {{ group.skills.length }}
          </span>
          <div
            class="ml-auto h-px flex-1"
            style="background: rgb(255 255 255 / 4%)"
          ></div>
        </button>

        <!-- Skill cards grid -->
        <div
          v-if="expandedGroups.has(group.key)"
          class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3"
        >
          <div
            v-for="skill in group.skills"
            :key="skill.name"
            class="card-glow interactive cursor-pointer rounded-lg border p-3"
            :class="
              selectedName === skill.name
                ? 'border-l-2'
                : 'border-l-2 border-l-transparent'
            "
            :style="{
              borderColor:
                selectedName === skill.name
                  ? group.color
                  : 'rgb(255 255 255 / 6%)',
              background:
                selectedName === skill.name
                  ? 'rgb(139 92 246 / 4%)'
                  : 'rgb(255 255 255 / 2%)',
            }"
            @click="selectSkill(skill)"
          >
            <!-- Top row: name -->
            <div class="flex items-center gap-2">
              <span
                class="flex-1 truncate text-[13px] font-medium text-[#fafafa]"
              >
                {{ skill.name }}
              </span>
              <UBadge
                v-if="skill.inject && skill.inject !== 'context'"
                color="info"
                variant="soft"
                size="xs"
              >
                {{ skill.inject }}
              </UBadge>
            </div>

            <!-- Description -->
            <p
              class="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[#666]"
            >
              {{ skill.description }}
            </p>

            <!-- Stats bar -->
            <div
              class="mt-2 flex items-center gap-3 border-t pt-2 text-[10px]"
              style="border-color: rgb(255 255 255 / 4%)"
            >
              <span class="flex items-center gap-1 text-[#8b5cf6]">
                <UIcon name="i-lucide-zap" class="text-[9px]" />
                {{ getStats(skill.name).triggerCount }}
              </span>
              <span class="flex items-center gap-1 text-[#22c55e]">
                <UIcon name="i-lucide-check" class="text-[9px]" />
                {{
                  getStats(skill.name).triggerCount > 0
                    ? Math.round(
                        (getStats(skill.name).successCount /
                          getStats(skill.name).triggerCount) *
                          100,
                      )
                    : 0
                }}%
              </span>
              <span class="flex items-center gap-1 text-[#555]">
                <UIcon name="i-lucide-clock" class="text-[9px]" />
                {{ fmtTimeAgo(getStats(skill.name).lastUsedAt) }}
              </span>
              <!-- Mini progress bar -->
              <div
                class="ml-auto h-1 w-12 overflow-hidden rounded-full"
                style="background: rgb(255 255 255 / 4%)"
              >
                <div
                  class="h-full rounded-full transition-all duration-300"
                  :style="{
                    width:
                      getStats(skill.name).triggerCount > 0
                        ? `${Math.round((getStats(skill.name).successCount / getStats(skill.name).triggerCount) * 100)}%`
                        : '0%',
                    background: group.color,
                  }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════ Detail Modal ══════ -->
    <UModal v-model:open="showDetail">
      <template #content>
        <div
          v-if="selectedSkill"
          style="background: rgb(15 15 25 / 95%)"
          class="flex max-h-[80vh] flex-col"
        >
          <!-- Header -->
          <div
            class="flex shrink-0 items-center justify-between border-b px-5 py-4"
            style="border-color: rgb(255 255 255 / 6%)"
          >
            <div class="flex items-center gap-3">
              <h2 class="text-base font-semibold text-[#fafafa]">
                {{ selectedSkill.name }}
              </h2>
              <UBadge
                :color="
                  selectedSkill.source === 'project'
                    ? 'primary'
                    : selectedSkill.source === 'custom'
                      ? 'info'
                      : 'neutral'
                "
                variant="soft"
                size="xs"
              >
                {{
                  selectedSkill.source === 'project'
                    ? 'Project'
                    : selectedSkill.source === 'custom'
                      ? 'Server'
                      : 'Global'
                }}
              </UBadge>
            </div>
            <div class="flex items-center gap-2">
              <!-- Enable toggle -->
              <button
                class="interactive rounded-lg px-2.5 py-1 text-xs"
                :class="
                  selectedSkill.enabled
                    ? 'bg-[rgb(34_197_94/10%)] text-[#22c55e]'
                    : 'text-[#555] hover:text-[#888]'
                "
                style="border: 1px solid rgb(255 255 255 / 8%)"
                @click="
                  toggleSkill(selectedName);
                  if (selectedSkill)
                    selectedSkill.enabled = !selectedSkill.enabled;
                "
              >
                {{ selectedSkill.enabled ? '✓ Enabled' : 'Disabled' }}
              </button>
            </div>
          </div>

          <!-- Stats row -->
          <div
            class="flex shrink-0 items-center gap-6 border-b px-5 py-3 text-[11px]"
            style="border-color: rgb(255 255 255 / 4%)"
          >
            <span class="flex items-center gap-1.5 text-[#8b5cf6]">
              <UIcon name="i-lucide-zap" class="text-[10px]" />
              {{ getStats(selectedName).triggerCount }} triggers
            </span>
            <span class="flex items-center gap-1.5 text-[#22c55e]">
              <UIcon name="i-lucide-check" class="text-[10px]" />
              {{
                getStats(selectedName).triggerCount > 0
                  ? Math.round(
                      (getStats(selectedName).successCount /
                        getStats(selectedName).triggerCount) *
                        100,
                    )
                  : 0
              }}% success
            </span>
            <span class="flex items-center gap-1.5 text-[#555]">
              <UIcon name="i-lucide-clock" class="text-[10px]" />
              {{ fmtTimeAgo(getStats(selectedName).lastUsedAt) }}
            </span>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-5">
            <p class="mb-3 text-sm text-[#888]">
              {{ selectedSkill.description }}
            </p>
            <template v-if="!editing">
              <pre
                class="rounded-lg p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-[#ccc]"
                style="background: rgb(0 0 0 / 30%)"
                >{{ selectedSkill.content }}</pre
              >
            </template>
            <template v-else>
              <div class="space-y-3">
                <div>
                  <label class="mb-1 block text-xs font-medium text-[#888]"
                    >說明</label
                  >
                  <input
                    v-model="editForm.description"
                    class="w-full rounded px-3 py-2 text-sm text-[#fafafa] ring-1 ring-[rgb(255_255_255/8%)] outline-none"
                    style="background: rgb(0 0 0 / 30%)"
                  />
                </div>
                <div>
                  <label class="mb-1 block text-xs font-medium text-[#888]"
                    >內容 (Markdown)</label
                  >
                  <textarea
                    v-model="editForm.content"
                    rows="15"
                    class="w-full rounded px-3 py-2 font-mono text-sm leading-relaxed text-[#fafafa] ring-1 ring-[rgb(255_255_255/8%)] outline-none"
                    style="background: rgb(0 0 0 / 30%)"
                  ></textarea>
                </div>
              </div>
            </template>
          </div>

          <!-- Footer actions -->
          <div
            class="flex shrink-0 items-center gap-2 border-t px-5 py-3"
            style="border-color: rgb(255 255 255 / 6%)"
          >
            <template v-if="!editing">
              <UButton
                v-if="
                  selectedSkill.source === 'project' ||
                  selectedSkill.source === 'custom'
                "
                size="xs"
                variant="soft"
                @click="startEdit"
              >
                <UIcon name="i-lucide-pencil" class="mr-1" /> 編輯
              </UButton>
              <UButton
                v-if="
                  selectedSkill.source === 'project' ||
                  selectedSkill.source === 'custom'
                "
                size="xs"
                color="error"
                variant="soft"
                @click="confirmDelete = true"
              >
                <UIcon name="i-lucide-trash-2" class="mr-1" /> 刪除
              </UButton>
            </template>
            <template v-else>
              <UButton size="xs" :loading="saving" @click="saveEdit"
                >儲存</UButton
              >
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                @click="cancelEdit"
                >取消</UButton
              >
            </template>
          </div>
        </div>
      </template>
    </UModal>

    <!-- ══════ Modals ══════ -->
    <UModal v-model:open="showCreate">
      <template #content>
        <div style="background: rgb(15 15 25 / 95%)" class="p-6">
          <h3 class="mb-4 text-lg font-semibold text-[#fafafa]">新增 Skill</h3>
          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-xs text-[#888]">名稱</label>
              <input
                v-model="newSkill.name"
                placeholder="my-custom-skill"
                class="w-full rounded px-3 py-2 font-mono text-sm text-[#fafafa] ring-1 ring-[rgb(255_255_255/8%)] outline-none"
                style="background: rgb(0 0 0 / 30%)"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs text-[#888]">說明</label>
              <input
                v-model="newSkill.description"
                placeholder="這個 skill 做什麼..."
                class="w-full rounded px-3 py-2 text-sm text-[#fafafa] ring-1 ring-[rgb(255_255_255/8%)] outline-none"
                style="background: rgb(0 0 0 / 30%)"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs text-[#888]">注入位置</label>
              <select
                v-model="newSkill.inject"
                class="rounded px-3 py-2 text-sm text-[#fafafa] ring-1 ring-[rgb(255_255_255/8%)] outline-none"
                style="background: rgb(0 0 0 / 30%)"
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
              <label class="mb-1 block text-xs text-[#888]"
                >內容 (Markdown)</label
              >
              <textarea
                v-model="newSkill.content"
                rows="10"
                placeholder="Skill 的 Markdown 指令內容..."
                class="w-full rounded px-3 py-2 font-mono text-sm text-[#fafafa] ring-1 ring-[rgb(255_255_255/8%)] outline-none"
                style="background: rgb(0 0 0 / 30%)"
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
              >建立</UButton
            >
            <UButton color="neutral" variant="ghost" @click="showCreate = false"
              >取消</UButton
            >
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="confirmDelete">
      <template #content>
        <div style="background: rgb(15 15 25 / 95%)" class="p-6">
          <h3 class="mb-2 text-lg font-semibold text-[#fafafa]">確認刪除</h3>
          <p class="mb-4 text-sm text-[#888]">
            確定要刪除 skill
            <span class="font-mono text-red-400">{{ selectedName }}</span
            >？此操作無法復原。
          </p>
          <div class="flex gap-2">
            <UButton color="error" :loading="deleting" @click="doDelete"
              >刪除</UButton
            >
            <UButton
              color="neutral"
              variant="ghost"
              @click="confirmDelete = false"
              >取消</UButton
            >
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
