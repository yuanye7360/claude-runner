export interface RepoConfig {
  id: string;
  name: string;
  cwd: string;
  githubRepo?: string; // "owner/repo" — used by pr-runner for filtering
}

const STORAGE_KEY = 'runner-repo-configs';

function load(): RepoConfig[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function persist(configs: RepoConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
}

// Shared reactive state across all composable callers on the same page
const repoConfigs = ref<RepoConfig[]>(load());
const editingConfig = ref<null | (RepoConfig & { id: string })>(null);

export function useRepoConfigs() {
  function newConfig() {
    editingConfig.value = { id: '', name: '', cwd: '', githubRepo: '' };
  }

  function startEditConfig(c: RepoConfig) {
    editingConfig.value = { ...c, githubRepo: c.githubRepo ?? '' };
  }

  function saveConfig() {
    if (!editingConfig.value) return;
    const form = editingConfig.value;
    if (!form.name || !form.cwd) return;

    const entry: RepoConfig = {
      id: form.id || Date.now().toString(36),
      name: form.name,
      cwd: form.cwd,
      ...(form.githubRepo ? { githubRepo: form.githubRepo } : {}),
    };

    repoConfigs.value = form.id
      ? repoConfigs.value.map((c) => (c.id === form.id ? entry : c))
      : [...repoConfigs.value, entry];
    persist(repoConfigs.value);
    editingConfig.value = null;
    return entry;
  }

  function cancelEdit() {
    editingConfig.value = null;
  }

  function deleteConfig(id: string) {
    repoConfigs.value = repoConfigs.value.filter((c) => c.id !== id);
    persist(repoConfigs.value);
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
