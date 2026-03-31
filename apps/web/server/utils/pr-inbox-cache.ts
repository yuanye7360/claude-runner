import { execSync } from 'node:child_process';
import process from 'node:process';

import { resolveClaudeCliPath } from './claude-cli';
import { getPrInboxChannel } from './workspaceConfig';

interface CachedSlackMessage {
  text: string;
  ts: string;
  userId: string;
}

interface SlackCache {
  channel: string;
  fetchedAt: string;
  messages: CachedSlackMessage[];
}

let _cache: null | SlackCache = null;
let _fetching = false;

export function getSlackCache(): null | SlackCache {
  return _cache;
}

export function isSlackFetching(): boolean {
  return _fetching;
}

/** Parse raw Claude CLI stdout into structured Slack messages */
function parseSlackMessages(stdout: string): CachedSlackMessage[] {
  const messages: CachedSlackMessage[] = [];
  const headerRegex =
    /=== Message from .+? \(([^)]+)\) at .+? ===\nMessage TS: ([\d.]+)\n/g;

  const splits: Array<{ index: number; ts: string; userId: string }> = [];
  for (const match of stdout.matchAll(headerRegex)) {
    if (match.index === undefined) continue;
    splits.push({
      index: match.index + match[0].length,
      ts: match[2],
      userId: match[1],
    });
  }

  for (let i = 0; i < splits.length; i++) {
    const start = splits[i].index;
    const end =
      i + 1 < splits.length
        ? splits[i + 1].index - splits[i + 1].ts.length - 50
        : stdout.length;
    const text = stdout.slice(start, end).trim();
    messages.push({ text, ts: splits[i].ts, userId: splits[i].userId });
  }

  return messages;
}

/**
 * Fetch Slack messages via Claude CLI and update the cache.
 * Returns the cached data, or null if channel not configured.
 */
export async function refreshSlackCache(): Promise<null | SlackCache> {
  const channel = await getPrInboxChannel();
  if (!channel) return null;

  if (_fetching) {
    // Already fetching, return current cache
    return _cache;
  }

  _fetching = true;
  try {
    const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 86_400;
    const prompt = `Read Slack channel ${channel} messages from the last 2 days using slack_read_channel with oldest=${twoDaysAgo}. Print the full raw output exactly as returned. Do not summarize, filter, or reformat.`;

    const cliPath = resolveClaudeCliPath();
    const env: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (e): e is [string, string] => e[1] !== undefined,
        ),
      ),
      PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
    };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    const stdout = execSync(
      `${cliPath} --dangerously-skip-permissions -p ${JSON.stringify(prompt)}`,
      { encoding: 'utf8', timeout: 60_000, env, cwd: process.cwd() },
    );

    const messages = parseSlackMessages(stdout);

    if (stdout.trim().length > 0 && messages.length === 0) {
      console.warn(
        '[pr-inbox] parseSlackMessages returned empty for non-empty CLI output. Format may have changed.',
      );
    }

    _cache = { channel, fetchedAt: new Date().toISOString(), messages };
    console.warn(
      `[pr-inbox] Slack cache refreshed: ${messages.length} messages from ${channel}`,
    );
    return _cache;
  } catch (error) {
    console.error('[pr-inbox] Failed to refresh Slack cache:', error);
    throw error;
  } finally {
    _fetching = false;
  }
}
