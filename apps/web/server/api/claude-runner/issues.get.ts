const N8N_ISSUES_URL = 'http://localhost:5678/webhook/jira-claude-issues';

interface RawIssue {
  key: string;
  self?: string;
  [k: string]: unknown;
}

function extractBrowseUrl(issue: RawIssue): string | undefined {
  // self is like "https://xxx.atlassian.net/rest/api/2/issue/12345"
  if (issue.self) {
    const base = issue.self.replace(/\/rest\/api\/.*$/, '');
    return `${base}/browse/${issue.key}`;
  }
  return undefined;
}

export default defineEventHandler(async () => {
  const response = await $fetch<unknown>(N8N_ISSUES_URL);
  const issues: RawIssue[] = Array.isArray(response)
    ? response
    : ((response as Record<string, unknown>).issues as RawIssue[] ?? []);

  return issues.map((issue) => ({
    ...issue,
    url: issue.url ?? extractBrowseUrl(issue),
  }));
});
