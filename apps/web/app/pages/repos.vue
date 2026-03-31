<script setup lang="ts">
import { useJiraConfig } from '~/composables/useJiraConfig';
import { useRepoConfigs } from '~/composables/useRepoConfigs';

useHead({ title: 'Claude Runner — Settings' });

// ── Tab (support ?tab= query param) ──
const route = useRoute();
const initialTab =
  route.query.tab === 'integrations' ? 'integrations' : 'repos';
const activeTab = ref<'integrations' | 'repos'>(initialTab);

// ── Settings (Integrations) ──
const settings = ref<Record<string, string>>({});
const settingsLoading = ref(false);
const settingsSaving = ref(false);

async function loadSettings() {
  settingsLoading.value = true;
  try {
    settings.value = await $fetch<Record<string, string>>('/api/settings');
  } catch {
    settings.value = {};
  } finally {
    settingsLoading.value = false;
  }
}

async function saveSlackSettings() {
  settingsSaving.value = true;
  try {
    await $fetch('/api/settings', {
      method: 'POST',
      body: {
        'slack.ai_notifications':
          settings.value['slack.ai_notifications'] ?? '',
      },
    });
  } finally {
    settingsSaving.value = false;
  }
}



onMounted(loadSettings);

// ── JIRA Settings ──
const { config: jiraConfig, isConfigured: jiraConfigured } = useJiraConfig();
const jiraSaving = ref(false);
const jiraAutoRunEnabled = ref(false);
const jiraAutoRunInterval = ref(2);
const jiraAutoRunLoading = ref(false);
const newLabelInput = ref('');
const intervalOptions = [1, 2, 5, 10, 15, 30];

async function loadJiraAutoRun() {
  try {
    const data = await $fetch<{ enabled: boolean; interval: number }>(
      '/api/settings/jira-auto-run',
    );
    jiraAutoRunEnabled.value = data.enabled;
    jiraAutoRunInterval.value = data.interval;
  } catch {
    // ignore
  }
}

async function saveJiraSettings() {
  jiraSaving.value = true;
  try {
    const c = jiraConfig.value;
    await $fetch('/api/settings/jira-creds', {
      method: 'PUT',
      body: {
        baseUrl: c.baseUrl,
        email: c.email,
        apiToken: c.apiToken,
        labels: c.labels,
      },
    });
    await $fetch('/api/settings/jira-auto-run', {
      method: 'PUT',
      body: {
        enabled: jiraAutoRunEnabled.value,
        interval: jiraAutoRunInterval.value,
      },
    });
    useToast().add({ title: 'JIRA 設定已儲存', color: 'success' });
  } catch (error) {
    useToast().add({
      title: '儲存失敗',
      description: (error as Error).message,
      color: 'error',
    });
  } finally {
    jiraSaving.value = false;
  }
}

function addLabel() {
  const val = newLabelInput.value.trim();
  if (val && !jiraConfig.value.labels.includes(val)) {
    jiraConfig.value.labels.push(val);
  }
  newLabelInput.value = '';
}

async function toggleAutoRun(val: boolean) {
  jiraAutoRunLoading.value = true;
  try {
    if (val) {
      const c = jiraConfig.value;
      await $fetch('/api/settings/jira-creds', {
        method: 'PUT',
        body: {
          baseUrl: c.baseUrl,
          email: c.email,
          apiToken: c.apiToken,
          labels: c.labels,
        },
      });
    }
    await $fetch('/api/settings/jira-auto-run', {
      method: 'PUT',
      body: { enabled: val, interval: jiraAutoRunInterval.value },
    });
    jiraAutoRunEnabled.value = val;
  } catch (error) {
    useToast().add({
      title: '設定失敗',
      description: (error as Error).message,
      color: 'error',
    });
  } finally {
    jiraAutoRunLoading.value = false;
  }
}

async function updateAutoRunInterval(mins: number) {
  jiraAutoRunInterval.value = mins;
  try {
    await $fetch('/api/settings/jira-auto-run', {
      method: 'PUT',
      body: { interval: mins },
    });
  } catch {
    // ignore
  }
}

onMounted(loadJiraAutoRun);

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
    <!-- Tabs -->
    <div
      class="flex shrink-0 gap-4 border-b border-[rgb(255_255_255/6%)] px-6 pt-4"
    >
      <button
        class="interactive border-b-2 pb-2 text-sm font-medium transition-colors"
        :class="
          activeTab === 'repos'
            ? 'border-[#8b5cf6] text-[#fafafa]'
            : 'border-transparent text-[#555] hover:text-[#888]'
        "
        @click="activeTab = 'repos'"
      >
        <UIcon name="i-lucide-folder-git-2" class="mr-1.5" />
        Repos
      </button>
      <button
        class="interactive border-b-2 pb-2 text-sm font-medium transition-colors"
        :class="
          activeTab === 'integrations'
            ? 'border-[#06b6d4] text-[#fafafa]'
            : 'border-transparent text-[#555] hover:text-[#888]'
        "
        @click="activeTab = 'integrations'"
      >
        <UIcon name="i-lucide-plug" class="mr-1.5" />
        Integrations
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-6">
      <!-- ══════ Integrations Tab ══════ -->
      <div v-if="activeTab === 'integrations'" class="mx-auto max-w-3xl">
        <h1 class="mb-1 text-lg font-semibold text-[#fafafa]">Integrations</h1>
        <p class="mb-6 text-sm text-[#555]">配置外部服務連接</p>

        <!-- Slack -->
        <div
          class="rounded-lg border p-5"
          style="
            background: rgb(255 255 255 / 2%);
            border-color: rgb(255 255 255 / 6%);
          "
        >
          <div class="mb-4 flex items-center gap-3">
            <div
              class="flex h-9 w-9 items-center justify-center rounded-lg"
              style="background: rgb(6 182 212 / 8%)"
            >
              <UIcon
                name="i-simple-icons-slack"
                class="text-lg text-[#06b6d4]"
              />
            </div>
            <div>
              <h2 class="text-sm font-semibold text-[#fafafa]">Slack</h2>
              <p class="text-[11px] text-[#555]">
                Job 完成後自動發送通知到 Slack channel
              </p>
            </div>
          </div>

          <div
            v-if="settingsLoading"
            class="py-4 text-center text-xs text-[#444]"
          >
            載入中...
          </div>
          <div v-else class="space-y-3">
            <div>
              <label class="mb-1 block text-xs text-[#888]"
                >AI Notifications Channel ID</label
              >
              <div class="flex gap-2">
                <input
                  v-model="settings['slack.ai_notifications']"
                  placeholder="C08NJ2GL204"
                  class="flex-1 rounded-md border px-3 py-2 font-mono text-sm text-[#ccc] placeholder-[#333] outline-none"
                  style="
                    background: rgb(0 0 0 / 30%);
                    border-color: rgb(255 255 255 / 8%);
                  "
                />
              </div>
              <p class="mt-1 text-[10px] text-[#444]">
                PR 請求和 Review 完成通知會發到這個 channel。留空則不發送。
              </p>
            </div>

            <button
              class="interactive mt-2 rounded-lg bg-[#06b6d4] px-4 py-2 text-sm font-medium text-[#fafafa] hover:bg-[#0891b2]"
              :disabled="settingsSaving"
              @click="saveSlackSettings"
            >
              {{ settingsSaving ? '儲存中...' : '儲存' }}
            </button>
          </div>
        </div>

        <!-- JIRA -->
        <div
          class="mt-4 rounded-lg border p-5"
          style="
            background: rgb(255 255 255 / 2%);
            border-color: rgb(255 255 255 / 6%);
          "
        >
          <div class="mb-4 flex items-center gap-3">
            <div
              class="flex h-9 w-9 items-center justify-center rounded-lg"
              style="background: rgb(139 92 246 / 8%)"
            >
              <UIcon
                name="i-simple-icons-jira"
                class="text-lg text-[#8b5cf6]"
              />
            </div>
            <div>
              <h2 class="text-sm font-semibold text-[#fafafa]">JIRA</h2>
              <p class="text-[11px] text-[#555]">
                JIRA Atlassian 連線設定與自動執行
              </p>
            </div>
            <span
              v-if="jiraConfigured"
              class="ml-auto rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-[#22c55e]"
            >
              已連線
            </span>
            <span
              v-else
              class="ml-auto rounded-full bg-orange-500/15 px-2 py-0.5 text-xs text-orange-400"
            >
              未設定
            </span>
          </div>

          <div class="space-y-4">
            <!-- Connection -->
            <div>
              <div
                class="mb-2 text-xs font-medium tracking-wide text-[#888] uppercase"
              >
                連線資訊
              </div>
              <div class="space-y-2">
                <div>
                  <label class="mb-1 block text-xs text-[#888]">Base URL</label>
                  <input
                    v-model="jiraConfig.baseUrl"
                    placeholder="https://yourorg.atlassian.net"
                    class="w-full rounded-md border px-3 py-2 font-mono text-sm text-[#ccc] placeholder-[#333] outline-none"
                    style="
                      background: rgb(0 0 0 / 30%);
                      border-color: rgb(255 255 255 / 8%);
                    "
                  />
                </div>
                <div>
                  <label class="mb-1 block text-xs text-[#888]">Email</label>
                  <input
                    v-model="jiraConfig.email"
                    placeholder="you@company.com"
                    class="w-full rounded-md border px-3 py-2 font-mono text-sm text-[#ccc] placeholder-[#333] outline-none"
                    style="
                      background: rgb(0 0 0 / 30%);
                      border-color: rgb(255 255 255 / 8%);
                    "
                  />
                </div>
                <div>
                  <label class="mb-1 block text-xs text-[#888]"
                    >API Token</label
                  >
                  <input
                    v-model="jiraConfig.apiToken"
                    type="password"
                    placeholder="ATATT3x..."
                    class="w-full rounded-md border px-3 py-2 font-mono text-sm text-[#ccc] placeholder-[#333] outline-none"
                    style="
                      background: rgb(0 0 0 / 30%);
                      border-color: rgb(255 255 255 / 8%);
                    "
                  />
                </div>
              </div>
            </div>

            <!-- Labels -->
            <div>
              <div
                class="mb-2 text-xs font-medium tracking-wide text-[#888] uppercase"
              >
                JIRA Labels
              </div>
              <div class="flex flex-wrap items-center gap-1.5">
                <span
                  v-for="(lbl, idx) in jiraConfig.labels"
                  :key="idx"
                  class="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-[#8b5cf6]"
                >
                  {{ lbl }}
                  <button
                    class="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-blue-500/20 hover:text-[#8b5cf6]"
                    @click="jiraConfig.labels.splice(idx, 1)"
                  >
                    <UIcon name="i-lucide-x" style="font-size: 0.7em" />
                  </button>
                </span>
                <input
                  v-model="newLabelInput"
                  class="w-32 min-w-0 rounded-md border px-2.5 py-1 text-xs text-[#ccc] placeholder-[#444] outline-none"
                  style="
                    background: rgb(0 0 0 / 30%);
                    border-color: rgb(255 255 255 / 8%);
                  "
                  placeholder="新增 label..."
                  @keydown.enter.prevent="addLabel()"
                />
              </div>
              <p class="mt-1 text-[10px] text-[#444]">
                只會抓取包含這些 label 的 JIRA Issue
              </p>
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
                  class="flex items-center justify-between rounded-md border px-3 py-2"
                  style="
                    background: rgb(0 0 0 / 30%);
                    border-color: rgb(255 255 255 / 8%);
                  "
                  :class="{
                    'opacity-50': !jiraConfigured || jiraAutoRunLoading,
                  }"
                >
                  <span class="text-xs text-[#ccc]">
                    狀態切 In Development 時自動觸發
                  </span>
                  <USwitch
                    :model-value="jiraAutoRunEnabled"
                    :disabled="!jiraConfigured || jiraAutoRunLoading"
                    @update:model-value="toggleAutoRun($event)"
                  />
                </label>
                <div
                  class="flex items-center justify-between rounded-md border px-3 py-2"
                  style="
                    background: rgb(0 0 0 / 30%);
                    border-color: rgb(255 255 255 / 8%);
                  "
                  :class="{ 'opacity-50': !jiraAutoRunEnabled }"
                >
                  <span class="text-xs text-[#888]">輪詢間隔</span>
                  <div class="flex items-center gap-1">
                    <button
                      v-for="opt in intervalOptions"
                      :key="opt"
                      class="rounded px-1.5 py-0.5 text-[11px] transition-colors"
                      :class="
                        jiraAutoRunInterval === opt
                          ? 'bg-[#8b5cf6] text-[#fafafa]'
                          : 'text-[#888] hover:bg-[rgb(255_255_255/6%)] hover:text-[#ccc]'
                      "
                      :disabled="!jiraAutoRunEnabled"
                      @click="updateAutoRunInterval(opt)"
                    >
                      {{ opt }}m
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Save -->
            <button
              class="interactive rounded-lg bg-[#8b5cf6] px-4 py-2 text-sm font-medium text-[#fafafa] hover:bg-[#7c3aed]"
              :disabled="jiraSaving"
              @click="saveJiraSettings"
            >
              {{ jiraSaving ? '儲存中...' : '儲存' }}
            </button>
          </div>
        </div>
      </div>

      <!-- ══════ Repos Tab ══════ -->
      <div v-else class="mx-auto max-w-3xl">
        <!-- Header -->
        <div class="mb-6 flex items-center justify-between">
          <div>
            <h1 class="text-lg font-semibold text-[#fafafa]">Repos</h1>
            <p class="text-sm text-[#888]">{{ repoConfigs.length }} 個專案</p>
          </div>
          <button
            class="interactive rounded-lg bg-[#8b5cf6] px-4 py-2 text-sm font-medium text-[#fafafa] hover:bg-[#7c3aed]"
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
