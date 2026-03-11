const N8N_ISSUES_URL = 'http://localhost:5678/webhook/jira-claude-issues';

export default defineEventHandler(async () => {
  const response = await $fetch<unknown>(N8N_ISSUES_URL);
  return Array.isArray(response)
    ? response
    : ((response as Record<string, unknown>).issues ?? []);
});
