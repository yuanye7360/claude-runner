export interface RepoConfig {
  id: string;
  name: string;
  cwd: string;
  githubRepo?: string;
  label?: string;
  isCustom?: boolean;
}

const STORAGE_KEY = 'runner-repo-configs';

const repoConfigs = ref<RepoConfig[]>([]);
const editingConfig = ref<null | (RepoConfig & { id: string })>(null);
let fetched = false;

async function fetchFromServer() {
  if (fetched) return;
  try {
    const data = await $fetch<any[]>('/api/repos');
    repoConfigs.value = data.map((r) => ({
      id: r.label || r.id,
      name: r.name,
      cwd: r.cwd,
      ...r,
    }));
    fetched = true;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    if (typeof localStorage !== 'undefined') {
      try {
        repoConfigs.value = JSON.parse(
          localStorage.getItem(STORAGE_KEY) || '[]',
        );
      } catch {
        /* empty */
      }
    }
  }
}

export function useRepoConfigs() {
  fetchFromServer();

  function newConfig() {
    editingConfig.value = { id: '', name: '', cwd: '' };
  }

  function startEditConfig(c: RepoConfig) {
    editingConfig.value = { ...c };
  }

  async function saveConfig() {
    if (!editingConfig.value) return;
    const form = editingConfig.value;
    if (!form.name || !form.cwd) return;

    if (form.id && form.isCustom) {
      const updated = await $fetch<any>(`/api/repos/${form.id}`, {
        method: 'PUT',
        body: {
          name: form.name,
          path: form.cwd,
          githubRepo: form.githubRepo,
          label: form.label,
        },
      });
      repoConfigs.value = repoConfigs.value.map((c) =>
        c.id === form.id
          ? { ...c, ...updated, cwd: updated.cwd || updated.path }
          : c,
      );
    } else if (!form.id) {
      const created = await $fetch<any>('/api/repos', {
        method: 'POST',
        body: {
          name: form.name,
          path: form.cwd,
          githubRepo: form.name,
          label: form.name,
        },
      });
      repoConfigs.value.push({
        id: created.id,
        name: created.name,
        cwd: created.path,
        ...created,
      });
    }

    editingConfig.value = null;
  }

  function cancelEdit() {
    editingConfig.value = null;
  }

  async function deleteConfig(id: string) {
    try {
      await $fetch(`/api/repos/${id}`, { method: 'DELETE' });
    } catch {
      /* may not be a custom repo */
    }
    repoConfigs.value = repoConfigs.value.filter((c) => c.id !== id);
  }

  return {
    repoConfigs,
    editingConfig,
    newConfig,
    startEditConfig,
    saveConfig,
    cancelEdit,
    deleteConfig,
  };
}
