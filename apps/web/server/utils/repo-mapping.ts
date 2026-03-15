import { getGitHubOrg, loadConfig } from './config-loader';
import prisma from './prisma';

export interface RepoMapping {
  name: string;
  githubRepo: string;
  label: string;
  cwd: string;
}

/**
 * Get all repos: SQLite custom repos override config repos (matched by label).
 */
export async function getAllRepos(): Promise<RepoMapping[]> {
  const config = loadConfig();
  const customRepos = await prisma.repo.findMany({ where: { isCustom: true } });

  const customByLabel = new Map(customRepos.map((r) => [r.label, r]));

  const repos: RepoMapping[] = config.repos.map((configRepo) => {
    const custom = customByLabel.get(configRepo.label);
    if (custom) {
      customByLabel.delete(configRepo.label);
      return {
        name: custom.name,
        githubRepo: custom.githubRepo,
        label: custom.label,
        cwd: custom.path,
      };
    }
    return {
      name: configRepo.name,
      githubRepo: configRepo.githubRepo,
      label: configRepo.label,
      cwd: configRepo.path,
    };
  });

  // Add custom repos that don't override any config repo
  for (const custom of customByLabel.values()) {
    repos.push({
      name: custom.name,
      githubRepo: custom.githubRepo,
      label: custom.label,
      cwd: custom.path,
    });
  }

  return repos;
}

export async function resolveReposFromLabels(
  labels: string[],
): Promise<RepoMapping[]> {
  const allRepos = await getAllRepos();
  return allRepos.filter((r) => labels.includes(r.label));
}

export async function getRepoByLabel(
  label: string,
): Promise<RepoMapping | undefined> {
  const allRepos = await getAllRepos();
  return allRepos.find((r) => r.label === label);
}

export function getGhRepo(mapping: RepoMapping): string {
  return `${getGitHubOrg()}/${mapping.githubRepo}`;
}

export async function getAllGhRepos(): Promise<string[]> {
  const repos = await getAllRepos();
  return repos.map((r) => getGhRepo(r));
}

/**
 * Get formatted repo label list for task analyzer prompts.
 * Returns a multi-line string like "b2c-web -> /Users/.../kkday-b2c-web\n..."
 */
export async function getRepoLabelList(): Promise<string> {
  const repos = await getAllRepos();
  return repos.map((r) => `${r.label} -> ${r.cwd}`).join('\n');
}
