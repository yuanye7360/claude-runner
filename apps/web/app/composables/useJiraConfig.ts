export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

const STORAGE_KEY = 'cr-jira-config';

function load(): JiraConfig {
  if (typeof localStorage === 'undefined')
    return { baseUrl: '', email: '', apiToken: '' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as JiraConfig;
  } catch {
    /* ignore */
  }
  return { baseUrl: '', email: '', apiToken: '' };
}

const config = ref<JiraConfig>(load());

watch(
  config,
  (v) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  },
  { deep: true },
);

export function useJiraConfig() {
  const isConfigured = computed(
    () =>
      !!(config.value.baseUrl && config.value.email && config.value.apiToken),
  );

  /** Headers to attach to server API calls */
  function jiraHeaders(): Record<string, string> {
    const c = config.value;
    if (!c.baseUrl && !c.email && !c.apiToken) return {};
    return {
      'x-jira-base-url': c.baseUrl,
      'x-jira-email': c.email,
      'x-jira-api-token': c.apiToken,
    };
  }

  return { config, isConfigured, jiraHeaders };
}
