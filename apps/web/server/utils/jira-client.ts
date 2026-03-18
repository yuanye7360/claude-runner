import { Buffer } from 'node:buffer';

export interface JiraCredentials {
  apiToken: string;
  baseUrl: string;
  email: string;
}

interface JiraIssue {
  key: string;
  summary: string;
  labels: string[];
  status: string;
}

interface JiraSearchResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issues: Array<{
    fields: {
      labels: Array<string | { name: string }>;
      status: { name: string };
      summary: string;
    };
    key: string;
  }>;
}

function buildAuthHeader(email: string, apiToken: string): string {
  return `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
}

/**
 * Search JIRA issues by JQL query.
 */
export async function searchJiraIssues(
  creds: JiraCredentials,
  options: {
    jql: string;
    maxResults?: number;
    startAt?: number;
  },
): Promise<{ issues: JiraIssue[]; total: number }> {
  const { baseUrl, email, apiToken } = creds;
  const { jql, startAt = 0, maxResults = 50 } = options;

  const searchUrl = new URL(`${baseUrl}/rest/api/3/search/jql`);
  searchUrl.searchParams.set('jql', jql);
  searchUrl.searchParams.set('startAt', String(startAt));
  searchUrl.searchParams.set('maxResults', String(maxResults));
  searchUrl.searchParams.set('fields', 'summary,status,description,labels');

  const response = await fetch(searchUrl.toString(), {
    headers: {
      Authorization: buildAuthHeader(email, apiToken),
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`JIRA API error (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as JiraSearchResponse;

  const issues: JiraIssue[] = data.issues.map((issue) => ({
    key: issue.key,
    summary: issue.fields.summary,
    labels: issue.fields.labels.map((l) =>
      typeof l === 'string' ? l : l.name,
    ),
    status: issue.fields.status.name,
  }));

  return { issues, total: data.total };
}

/**
 * Get a single JIRA issue by key.
 */
export async function getJiraIssue(
  creds: JiraCredentials,
  issueKey: string,
): Promise<JiraIssue> {
  const { baseUrl, email, apiToken } = creds;

  const response = await fetch(
    `${baseUrl}/rest/api/3/issue/${issueKey}?fields=summary,labels,status`,
    {
      headers: {
        Authorization: buildAuthHeader(email, apiToken),
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`JIRA API error (${response.status}): ${errorBody}`);
  }

  const issue = (await response.json()) as JiraSearchResponse['issues'][0];

  return {
    key: issue.key,
    summary: issue.fields.summary,
    labels: issue.fields.labels.map((l) =>
      typeof l === 'string' ? l : l.name,
    ),
    status: issue.fields.status.name,
  };
}
