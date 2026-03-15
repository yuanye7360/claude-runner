import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { cwd } from 'node:process';
import { fileURLToPath } from 'node:url';

import { defu } from 'defu';
import yaml from 'js-yaml';

export interface RepoConfig {
  name: string;
  githubRepo: string;
  label: string;
  path: string;
}

export interface AppConfig {
  github: {
    org: string;
  };
  repos: RepoConfig[];
  claude: {
    cliPath: string;
  };
}

let cachedConfig: AppConfig | null = null;

/**
 * Expand ~ to home directory. Only applies to repos[].path fields.
 */
function expandTilde(path: string): string {
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  return path;
}

/**
 * Validate that required config fields exist.
 * Throws with a clear message if anything is missing.
 */
function validateConfig(config: AppConfig): void {
  if (!config.github?.org) {
    throw new Error('config.yaml: missing required field "github.org"');
  }

  if (!Array.isArray(config.repos) || config.repos.length === 0) {
    throw new Error('config.yaml: "repos" must be a non-empty array');
  }

  for (const [i, repo] of config.repos.entries()) {
    const required = ['name', 'githubRepo', 'label', 'path'] as const;
    for (const field of required) {
      if (!repo[field]) {
        throw new Error(
          `config.yaml: repos[${i}] missing required field "${field}"`,
        );
      }
    }
  }
}

/**
 * Load and merge config from config.yaml + config.local.yaml.
 * Cached after first call — restart server to pick up changes.
 */
export function loadConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  // Find project root by navigating up from this file's location.
  // This file lives at apps/web/server/utils/config-loader.ts (4 levels below root).
  // In production build (.output/server/chunks/), use process.env.NUXT_APP_ROOT_DIR
  // or fall back to cwd-based detection.
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = thisDir.includes('.output')
    ? resolve(cwd()) // PM2 sets cwd to project root
    : resolve(thisDir, '../../../../'); // dev: server/utils/ → project root

  const configPath = resolve(projectRoot, 'config.yaml');
  const localConfigPath = resolve(projectRoot, 'config.local.yaml');

  if (!existsSync(configPath)) {
    throw new Error(
      `config.yaml not found at ${configPath}. Run setup.sh first.`,
    );
  }

  const baseConfig = yaml.load(readFileSync(configPath, 'utf8')) as AppConfig;

  let mergedConfig = baseConfig;
  if (existsSync(localConfigPath)) {
    const localConfig = yaml.load(
      readFileSync(localConfigPath, 'utf8'),
    ) as Partial<AppConfig>;
    // defu doesn't merge arrays by key, so we handle repos specially:
    // match local repos to base repos by `name` and merge properties.
    if (localConfig.repos && baseConfig.repos) {
      const localByName = new Map(localConfig.repos.map((r) => [r.name, r]));
      mergedConfig.repos = baseConfig.repos.map((baseRepo) => {
        const localRepo = localByName.get(baseRepo.name);
        return localRepo ? { ...baseRepo, ...localRepo } : baseRepo;
      });
      // Add any local repos that don't match a base repo
      for (const [name, repo] of localByName) {
        if (!baseConfig.repos.some((r) => r.name === name)) {
          mergedConfig.repos.push(repo as RepoConfig);
        }
      }
      delete localConfig.repos;
    }
    // Merge remaining non-array fields (github, claude, etc.)
    mergedConfig = defu(localConfig, mergedConfig) as AppConfig;
  }

  // Expand ~ in repo paths
  mergedConfig.repos = mergedConfig.repos.map((repo) => ({
    ...repo,
    path: expandTilde(repo.path),
  }));

  validateConfig(mergedConfig);

  cachedConfig = mergedConfig;
  return cachedConfig;
}

/**
 * Get the configured GitHub org (e.g., "kkday-it").
 */
export function getGitHubOrg(): string {
  return loadConfig().github.org;
}

/**
 * Reset cached config. Useful for testing.
 */
export function resetConfigCache(): void {
  cachedConfig = null;
}
