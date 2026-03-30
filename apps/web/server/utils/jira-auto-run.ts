// apps/web/server/utils/jira-auto-run.ts
import type { JiraCredentials } from './jira-client';

import { getSetting } from './app-settings';
import { searchJiraIssues } from './jira-client';
import { listActiveJobs } from './jobStore';
import prisma from './prisma';

export interface AutoRunCandidate {
  key: string;
  summary: string;
  labels: string[];
  status: string;
}

/**
 * Check if auto-run is enabled and credentials are configured.
 */
export async function isAutoRunEnabled(): Promise<boolean> {
  const enabled = await getSetting('jira-auto-run-enabled');
  return enabled === 'true';
}

/**
 * Get the polling interval in ms (default 2 minutes).
 */
export async function getAutoRunInterval(): Promise<number> {
  const raw = await getSetting('jira-auto-run-interval');
  const mins = raw ? Number(raw) : 2;
  return (mins > 0 ? mins : 2) * 60 * 1000;
}

/**
 * Load JIRA credentials from AppSettings (stored server-side).
 */
export async function getStoredJiraCreds(): Promise<JiraCredentials | null> {
  const [baseUrl, email, apiToken] = await Promise.all([
    getSetting('jira-creds-base-url'),
    getSetting('jira-creds-email'),
    getSetting('jira-creds-api-token'),
  ]);
  if (!baseUrl || !email || !apiToken) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ''), email, apiToken };
}

/**
 * Get JIRA labels from settings (default: ['claude']).
 */
export async function getStoredJiraLabels(): Promise<string[]> {
  const raw = await getSetting('jira-creds-labels');
  if (!raw) return ['claude'];
  return raw
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Find issue keys that already have a successful auto-run job (persisted in DB)
 * or are currently active in memory. These should be skipped.
 */
async function getCompletedOrRunningAutoRunKeys(
  issueKeys: string[],
): Promise<Set<string>> {
  if (issueKeys.length === 0) return new Set();

  const skipKeys = new Set<string>();

  // 1. Check in-memory active jobs (not yet persisted to DB)
  //    Job issue keys may have @repoName suffix (e.g. "KB2CW-419@kkday-b2c-web"),
  //    so strip it before comparing with plain JIRA keys.
  const activeJobs = listActiveJobs({ trigger: 'auto' });
  for (const job of activeJobs) {
    for (const issue of job.issues) {
      const bareKey = issue.key.replace(/@.*$/, '');
      if (issueKeys.includes(bareKey)) {
        skipKeys.add(bareKey);
      }
    }
  }

  // 2. Check DB for persisted auto-run jobs that completed successfully
  //    DB issue keys may also have @repoName suffix, so search with both
  //    plain keys and wildcard patterns.
  const dbJobs = await prisma.job.findMany({
    where: {
      trigger: 'auto',
      status: 'done',
      issues: {
        some: {
          OR: issueKeys.map((k) => ({
            key: { startsWith: k },
          })),
        },
      },
    },
    include: { issues: { select: { key: true } } },
  });

  for (const job of dbJobs) {
    for (const issue of job.issues) {
      const bareKey = issue.key.replace(/@.*$/, '');
      if (issueKeys.includes(bareKey)) {
        skipKeys.add(bareKey);
      }
    }
  }

  return skipKeys;
}

/**
 * Poll JIRA for issues with status "In Development" that haven't been
 * successfully auto-run yet. Cancelled/errored jobs will be retried.
 */
export async function pollInDevelopmentIssues(): Promise<AutoRunCandidate[]> {
  const creds = await getStoredJiraCreds();
  if (!creds) return [];

  const labels = await getStoredJiraLabels();
  const labelJql =
    labels.length === 1
      ? `labels = "${labels[0]}"`
      : `labels in (${labels.map((l) => `"${l}"`).join(', ')})`;

  const jql = `${labelJql} AND status = "In Development" ORDER BY updated DESC`;
  const result = await searchJiraIssues(creds, { jql, maxResults: 20 });

  if (result.issues.length === 0) return [];

  // Filter out issues that already have a successful or running auto-run job
  const allKeys = result.issues.map((i) => i.key);
  const skipKeys = await getCompletedOrRunningAutoRunKeys(allKeys);

  return result.issues.filter((issue) => !skipKeys.has(issue.key));
}
