export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  label: string;
}

const STORAGE_KEY = 'cr-jira-config';

function load(): JiraConfig {
  if (typeof localStorage === 'undefined')
    return { baseUrl: '', email: '', apiToken: '', label: 'claude' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as JiraConfig;
      if (!parsed.label) parsed.label = 'claude';
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return { baseUrl: '', email: '', apiToken: '', label: 'claude' };
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
      'x-jira-label': c.label || 'claude',
    };
  }

  return { config, isConfigured, jiraHeaders };
}
