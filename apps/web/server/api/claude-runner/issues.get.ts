import { searchJiraIssues } from '../../utils/jira-client';

export default defineEventHandler(async (event) => {
  const baseUrl = getHeader(event, 'x-jira-base-url');
  const email = getHeader(event, 'x-jira-email');
  const apiToken = getHeader(event, 'x-jira-api-token');
  if (!baseUrl || !email || !apiToken) return [];
  const creds = { baseUrl: baseUrl.replace(/\/$/, ''), email, apiToken };

  const query = getQuery(event);
  const jql =
    (query.jql as string) || 'labels = "claude" ORDER BY updated DESC';
  const startAt = Number(query.startAt) || 0;
  const maxResults = Number(query.maxResults) || 50;

  try {
    const result = await searchJiraIssues(creds, { jql, startAt, maxResults });
    return result.issues.map((issue) => ({
      ...issue,
      url: `${creds.baseUrl}/browse/${issue.key}`,
    }));
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch JIRA issues';
    throw createError({
      statusCode: message.includes('401') ? 401 : 502,
      message,
    });
  }
});
