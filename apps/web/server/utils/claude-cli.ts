import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const FALLBACK_PATHS = ['/opt/homebrew/bin/claude', '/usr/local/bin/claude'];

let cachedPath: null | string = null;

/**
 * Resolve the Claude CLI binary path via auto-detection.
 * Tries `which claude`, then known fallback paths.
 */
export function resolveClaudeCliPath(): string {
  if (cachedPath) return cachedPath;

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
    'Claude CLI not found. Install it from https://docs.anthropic.com/en/docs/claude-code\n' +
      'Tried: which claude, /opt/homebrew/bin/claude, /usr/local/bin/claude',
  );
}
