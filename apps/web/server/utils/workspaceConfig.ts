import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import yaml from 'yaml';

interface SlackConfig {
  channels: {
    ai_notifications?: string;
    pr_review?: string;
    worklog_report?: string;
  };
}

interface WorkspaceConfig {
  slack: SlackConfig;
}

let _config: WorkspaceConfig | null = null;

/**
 * Read the Polaris workspace config by traversing up to find workspace-config.yaml,
 * then reading the company-level config.
 */
export function getWorkspaceConfig(): WorkspaceConfig {
  if (_config) return _config;

  const fallback: WorkspaceConfig = {
    slack: { channels: {} },
  };

  try {
    // Find project root (where workspace-config.yaml lives)
    let dir = resolve(new URL('.', import.meta.url).pathname);
    let rootConfigPath = '';
    for (let i = 0; i < 10; i++) {
      const candidate = join(dir, 'workspace-config.yaml');
      if (existsSync(candidate)) {
        rootConfigPath = candidate;
        break;
      }
      const parent = resolve(dir, '..');
      if (parent === dir) break;
      dir = parent;
    }

    if (!rootConfigPath) {
      _config = fallback;
      return fallback;
    }

    // Read root config to find company base_dir
    const rootRaw = readFileSync(rootConfigPath, 'utf8');
    const rootYaml = yaml.parse(rootRaw) as {
      companies?: Array<{ base_dir?: string; name: string }>;
    };

    const company = rootYaml.companies?.[0];
    if (!company?.base_dir) {
      _config = fallback;
      return fallback;
    }

    // Read company-level config
    const companyConfigPath = join(
      company.base_dir,
      'workspace-config.yaml',
    );
    if (!existsSync(companyConfigPath)) {
      _config = fallback;
      return fallback;
    }

    const companyRaw = readFileSync(companyConfigPath, 'utf8');
    const companyYaml = yaml.parse(companyRaw) as Partial<WorkspaceConfig>;

    _config = {
      slack: {
        channels: {
          ai_notifications:
            companyYaml.slack?.channels?.ai_notifications || '',
          pr_review: companyYaml.slack?.channels?.pr_review || '',
          worklog_report: companyYaml.slack?.channels?.worklog_report || '',
        },
      },
    };
    return _config;
  } catch {
    _config = fallback;
    return fallback;
  }
}

/** Get the Slack channel ID for AI notifications */
export function getSlackNotificationChannel(): string {
  return getWorkspaceConfig().slack.channels.ai_notifications || '';
}
