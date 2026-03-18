// apps/web/server/utils/jira-auto-run.ts
import type { JiraCredentials } from './jira-client';

import { getSetting } from './app-settings';
import { searchJiraIssues } from './jira-client';

/** Issue keys that have already been dispatched (avoid re-triggering). */
const dispatched = new Set<string>();

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
 * Poll JIRA for issues with status "In Development" that haven't been dispatched yet.
 * Returns new candidates that should be triggered.
 */
export async function pollInDevelopmentIssues(): Promise<AutoRunCandidate[]> {
  const creds = await getStoredJiraCreds();
  if (!creds) return [];

  const labels = await getStoredJiraLabels();
  const labelJql =
    labels.length === 1
      ? `labels = "${labels[0]}"`
      : `labels in (${labels.map((l) => `"${l}"`).join(', ')})`;

  // Find issues that are "In Development" (common JIRA status name)
  // Also try "In Progress" as fallback since status names vary
  const jql = `${labelJql} AND status = "In Development" ORDER BY updated DESC`;

  const result = await searchJiraIssues(creds, { jql, maxResults: 20 });

  const candidates: AutoRunCandidate[] = [];
  for (const issue of result.issues) {
    if (!dispatched.has(issue.key)) {
      candidates.push(issue);
    }
  }

  return candidates;
}

/**
 * Mark issue keys as dispatched so they won't be triggered again.
 */
export function markDispatched(keys: string[]) {
  for (const key of keys) dispatched.add(key);
}

/**
 * Clear dispatched set (for testing or reset).
 */
export function clearDispatched() {
  dispatched.clear();
}

/**
 * Get current dispatched keys (for debugging).
 */
export function getDispatchedKeys(): string[] {
  return [...dispatched];
}
