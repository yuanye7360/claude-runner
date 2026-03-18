export interface RepoConfig {
  id: string;
  name: string;
  githubRepo: string;
  label: string;
  cwd: string;
  validationStatus?: 'invalid' | 'valid' | null;
  validationError?: string;
}

const repoConfigs = ref<RepoConfig[]>([]);
const editingConfig = ref<null | (Partial<RepoConfig> & { id?: string })>(null);
let fetched = false;

async function fetchFromServer() {
  if (fetched) return;
  try {
    const data = await $fetch<any[]>('/api/repos');
    repoConfigs.value = data.map((r) => ({
      id: r.id,
      name: r.name,
      githubRepo: r.githubRepo,
      label: r.label,
      cwd: r.cwd ?? r.path,
    }));
    fetched = true;
  } catch {
    // fallback — empty
  }
}

export function useRepoConfigs() {
  fetchFromServer();

  function newConfig() {
    editingConfig.value = { name: '', githubRepo: '', label: '', cwd: '' };
  }

  function startEditConfig(c: RepoConfig) {
    editingConfig.value = { ...c };
  }

  async function saveConfig() {
    if (!editingConfig.value) return;
    const form = editingConfig.value;
    if (!form.name || !form.githubRepo || !form.label || !form.cwd) return;

    if (form.id) {
      const updated = await $fetch<any>(`/api/repos/${form.id}`, {
        method: 'PUT',
        body: {
          name: form.name,
          githubRepo: form.githubRepo,
          label: form.label,
          path: form.cwd,
        },
      });
      repoConfigs.value = repoConfigs.value.map((c) =>
        c.id === form.id
          ? {
              ...c,
              name: updated.name,
              githubRepo: updated.githubRepo,
              label: updated.label,
              cwd: updated.path,
            }
          : c,
      );
    } else {
      const created = await $fetch<any>('/api/repos', {
        method: 'POST',
        body: {
          name: form.name,
          githubRepo: form.githubRepo,
          label: form.label,
          path: form.cwd,
        },
      });
      repoConfigs.value.push({
        id: created.id,
        name: created.name,
        githubRepo: created.githubRepo,
        label: created.label,
        cwd: created.path,
      });
    }

    editingConfig.value = null;
  }

  function cancelEdit() {
    editingConfig.value = null;
  }

  async function deleteConfig(id: string) {
    await $fetch(`/api/repos/${id}`, { method: 'DELETE' });
    repoConfigs.value = repoConfigs.value.filter((c) => c.id !== id);
  }

  async function validatePath(
    path: string,
  ): Promise<{ error?: string; valid: boolean }> {
    return await $fetch('/api/repos/validate', {
      method: 'POST',
      body: { path },
    });
  }

  async function testConnection(
    githubRepo: string,
  ): Promise<{ error?: string; valid: boolean }> {
    return await $fetch('/api/repos/test-connection', {
      method: 'POST',
      body: { githubRepo },
    });
  }

  async function validateRepo(id: string) {
    const repo = repoConfigs.value.find((r) => r.id === id);
    if (!repo) return;

    const pathResult = await validatePath(repo.cwd);
    if (!pathResult.valid) {
      repo.validationStatus = 'invalid';
      repo.validationError = pathResult.error;
      return;
    }

    const connResult = await testConnection(repo.githubRepo);
    if (!connResult.valid) {
      repo.validationStatus = 'invalid';
      repo.validationError = connResult.error;
      return;
    }

    repo.validationStatus = 'valid';
    repo.validationError = undefined;
  }

  function refetch() {
    fetched = false;
    fetchFromServer();
  }

  return {
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
    refetch,
  };
}
