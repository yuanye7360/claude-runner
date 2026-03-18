import { getGitHubOrg } from './app-settings';
import prisma from './prisma';

export interface RepoMapping {
  name: string;
  githubRepo: string;
  label: string;
  cwd: string;
}

export async function getAllRepos(): Promise<RepoMapping[]> {
  const repos = await prisma.repo.findMany();
  return repos.map((r) => ({
    name: r.name,
    githubRepo: r.githubRepo,
    label: r.label,
    cwd: r.path,
  }));
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

export async function getGhRepo(mapping: RepoMapping): Promise<string> {
  const org = await getGitHubOrg();
  return `${org}/${mapping.githubRepo}`;
}

export async function getAllGhRepos(): Promise<string[]> {
  const org = await getGitHubOrg();
  const repos = await getAllRepos();
  return repos.map((r) => `${org}/${r.githubRepo}`);
}

export async function getRepoLabelList(): Promise<string> {
  const repos = await getAllRepos();
  return repos.map((r) => `${r.label} -> ${r.cwd}`).join('\n');
}
