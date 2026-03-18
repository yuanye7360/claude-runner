const githubOrg = ref('');
let fetched = false;

async function fetchGitHubOrg() {
  if (fetched) return;
  try {
    const settings = await $fetch<Record<string, string>>('/api/settings');
    githubOrg.value = settings['github.org'] ?? '';
    fetched = true;
  } catch {
    // First use — no settings yet
  }
}

export function useGitHubConfig() {
  fetchGitHubOrg();

  const isConfigured = computed(() => !!githubOrg.value);

  async function saveOrg(org: string) {
    await $fetch('/api/settings', {
      method: 'PUT',
      body: { key: 'github.org', value: org },
    });
    githubOrg.value = org;
  }

  return { githubOrg, isConfigured, saveOrg };
}
