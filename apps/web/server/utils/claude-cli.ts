import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { loadConfig } from './config-loader';

const FALLBACK_PATHS = ['/opt/homebrew/bin/claude', '/usr/local/bin/claude'];

let cachedPath: null | string = null;

/**
 * Resolve the Claude CLI binary path.
 * - If config says "auto": try `which claude`, then fallback paths
 * - Otherwise: use the configured absolute path
 */
export function resolveClaudeCliPath(): string {
  if (cachedPath) return cachedPath;

  const config = loadConfig();
  const configuredPath = config.claude.cliPath;

  if (configuredPath !== 'auto') {
    if (!existsSync(configuredPath)) {
      throw new Error(
        `Claude CLI not found at configured path: ${configuredPath}`,
      );
    }
    cachedPath = configuredPath;
    return cachedPath;
  }

  // Auto-detect
  try {
    const whichResult = execSync('which claude', { encoding: 'utf8' }).trim();
    if (whichResult && existsSync(whichResult)) {
      cachedPath = whichResult;
      return cachedPath;
    }
  } catch {
    // `which` failed, try fallbacks
  }

  for (const fallback of FALLBACK_PATHS) {
    if (existsSync(fallback)) {
      cachedPath = fallback;
      return cachedPath;
    }
  }

  throw new Error(
    'Claude CLI not found. Install it or set claude.cliPath in config.yaml.\n' +
      'Tried: which claude, /opt/homebrew/bin/claude, /usr/local/bin/claude',
  );
}
