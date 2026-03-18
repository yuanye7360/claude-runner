import { searchJiraIssues } from '../../utils/jira-client';

export default defineEventHandler(async (event) => {
  const baseUrl = getHeader(event, 'x-jira-base-url');
  const email = getHeader(event, 'x-jira-email');
  const apiToken = getHeader(event, 'x-jira-api-token');
  if (!baseUrl || !email || !apiToken) return [];
  const creds = { baseUrl: baseUrl.replace(/\/$/, ''), email, apiToken };

  const labelsHeader = getHeader(event, 'x-jira-labels') || 'claude';
  const labels = labelsHeader.split(',').map((l) => l.trim()).filter(Boolean);
  const query = getQuery(event);
  const labelJql =
    labels.length === 1
      ? `labels = "${labels[0]}"`
      : `labels in (${labels.map((l) => `"${l}"`).join(', ')})`;
  const jql =
    (query.jql as string) ||
    `${labelJql} AND statusCategory != "Done" ORDER BY updated DESC`;
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
