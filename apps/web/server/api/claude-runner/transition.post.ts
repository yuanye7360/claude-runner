import {
  getJiraTransitions,
  transitionJiraIssue,
} from '../../utils/jira-client';

export default defineEventHandler(async (event) => {
  const baseUrl = getHeader(event, 'x-jira-base-url');
  const email = getHeader(event, 'x-jira-email');
  const apiToken = getHeader(event, 'x-jira-api-token');

  if (!baseUrl || !email || !apiToken) {
    throw createError({ statusCode: 401, message: 'Missing JIRA credentials' });
  }

  const creds = { baseUrl: baseUrl.replace(/\/$/, ''), email, apiToken };

  const { issueKeys, targetStatus } = await readBody<{
    issueKeys: string[];
    targetStatus: string;
  }>(event);

  if (!issueKeys?.length || !targetStatus) {
    throw createError({
      statusCode: 400,
      message: 'Missing issueKeys or targetStatus',
    });
  }

  const results: Array<{ error?: string; issueKey: string; ok: boolean }> = [];

  for (const issueKey of issueKeys) {
    try {
      // Find the transition that leads to the target status
      const transitions = await getJiraTransitions(creds, issueKey);
      const match = transitions.find(
        (t) =>
          t.name.toLowerCase() === targetStatus.toLowerCase() ||
          t.to.name.toLowerCase() === targetStatus.toLowerCase(),
      );

      if (!match) {
        results.push({
          issueKey,
          ok: false,
          error: `No transition to "${targetStatus}" found. Available: ${transitions.map((t) => `${t.name} → ${t.to.name}`).join(', ')}`,
        });
        continue;
      }

      await transitionJiraIssue(creds, issueKey, match.id);
      results.push({ issueKey, ok: true });
    } catch (error) {
      results.push({
        issueKey,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { results };
});
