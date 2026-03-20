export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  labels: string[];
}

const STORAGE_KEY = 'cr-jira-config';

function load(): JiraConfig {
  if (!import.meta.client)
    return { baseUrl: '', email: '', apiToken: '', labels: ['claude'] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as JiraConfig & { label?: string };
      // Migrate old single label to array
      if (!parsed.labels) {
        parsed.labels = parsed.label ? [parsed.label] : ['claude'];
      }
      return {
        baseUrl: parsed.baseUrl,
        email: parsed.email,
        apiToken: parsed.apiToken,
        labels: parsed.labels,
      };
    }
  } catch {
    /* ignore */
  }
  return { baseUrl: '', email: '', apiToken: '', labels: ['claude'] };
}

const config = ref<JiraConfig>(load());

watch(
  config,
  (v) => {
    if (import.meta.client) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    }
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
      'x-jira-labels': c.labels.join(','),
    };
  }

  return { config, isConfigured, jiraHeaders };
}
