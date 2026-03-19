// apps/web/server/utils/migrate-config.ts
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import yaml from 'js-yaml';

import prisma from './prisma';

interface YamlConfig {
  github?: { org?: string };
  repos?: Array<{
    githubRepo: string;
    label: string;
    name: string;
    path: string;
  }>;
  claude?: { cliPath?: string };
}

function expandTilde(path: string): string {
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  return path;
}

export async function migrateConfigYaml(projectRoot: string): Promise<void> {
  const configPath = resolve(projectRoot, 'config.yaml');
  const localConfigPath = resolve(projectRoot, 'config.local.yaml');

  if (!existsSync(configPath)) return;

  console.warn('[migrate-config] Found config.yaml, migrating to database...');

  const baseConfig = yaml.load(readFileSync(configPath, 'utf8')) as YamlConfig;

  const mergedConfig = { ...baseConfig };
  if (existsSync(localConfigPath)) {
    console.warn('[migrate-config] Also merging config.local.yaml');
    const localConfig = yaml.load(
      readFileSync(localConfigPath, 'utf8'),
    ) as YamlConfig;
    if (localConfig.github?.org) {
      mergedConfig.github = { ...mergedConfig.github, ...localConfig.github };
    }
    if (localConfig.repos) {
      const localByName = new Map(localConfig.repos.map((r) => [r.name, r]));
      const baseRepos = mergedConfig.repos ?? [];
      mergedConfig.repos = baseRepos.map((baseRepo) => {
        const localRepo = localByName.get(baseRepo.name);
        if (localRepo) {
          localByName.delete(baseRepo.name);
          return { ...baseRepo, ...localRepo };
        }
        return baseRepo;
      });
      for (const repo of localByName.values()) {
        mergedConfig.repos = [...(mergedConfig.repos ?? []), repo];
      }
    }
  }

  const org = mergedConfig.github?.org ?? '';

  const seenLabels = new Set<string>();
  for (const repo of mergedConfig.repos ?? []) {
    if (seenLabels.has(repo.label)) {
      console.warn(
        `[migrate-config] Duplicate label "${repo.label}" — skipping`,
      );
      continue;
    }
    seenLabels.add(repo.label);

    const expandedPath = expandTilde(repo.path);
    const fullGithubRepo = org ? `${org}/${repo.githubRepo}` : repo.githubRepo;
    await prisma.repo.upsert({
      where: { label: repo.label },
      update: {
        name: repo.name,
        githubRepo: fullGithubRepo,
        path: expandedPath,
      },
      create: {
        name: repo.name,
        githubRepo: fullGithubRepo,
        label: repo.label,
        path: expandedPath,
      },
    });
  }

  unlinkSync(configPath);
  if (existsSync(localConfigPath)) {
    unlinkSync(localConfigPath);
  }

  console.warn(
    '[migrate-config] Migration complete. config.yaml has been removed.',
  );
}
