// apps/web/server/utils/repo-mapping.ts

import { homedir } from 'node:os';
import { join } from 'node:path';

export interface RepoMapping {
  label: string; // JIRA label, e.g. "repo:b2c-web"
  repo: string; // repo name for display
  cwd: string; // absolute path
}

/** JIRA label → repo path mapping. Prefix: "repo:" */
export const REPO_MAPPINGS: RepoMapping[] = [
  {
    label: 'repo:b2c-web',
    repo: 'kkday-b2c-web',
    cwd: join(homedir(), 'KKday', 'kkday-b2c-web'),
  },
  {
    label: 'repo:member',
    repo: 'kkday-member-ci',
    cwd: join(homedir(), 'KKday', 'kkday-member-ci'),
  },
  {
    label: 'repo:mobile-member',
    repo: 'kkday-mobile-member-ci',
    cwd: join(homedir(), 'KKday', 'kkday-mobile-member-ci'),
  },
  {
    label: 'repo:design-system',
    repo: 'web-design-system',
    cwd: join(homedir(), 'KKday', 'web-design-system'),
  },
];

/** Extract repo cwds from JIRA labels. Returns empty array if no repo labels found. */
export function resolveReposFromLabels(labels: string[]): RepoMapping[] {
  return REPO_MAPPINGS.filter((m) => labels.includes(m.label));
}

/** Get all repo label names for use in prompts */
export function getRepoLabelList(): string {
  return REPO_MAPPINGS.map((m) => `${m.label} → ${m.cwd}`).join('\n');
}

/** Get GitHub org/repo format for a mapping */
export function getGhRepo(mapping: RepoMapping): string {
  return `kkday/${mapping.repo}`;
}

/** Get all GitHub org/repo strings */
export function getAllGhRepos(): string[] {
  return REPO_MAPPINGS.map((m) => getGhRepo(m));
}
