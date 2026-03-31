import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
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

/**
 * Parse Claude CLI output to extract Slack messages.
 * Tries JSON extraction first (from structured prompt), falls back to text parsing.
 */
function parseMessages(stdout: string): CachedSlackMessage[] {
  // Strategy 1: Extract JSON array from output
  // The prompt asks Claude to output JSON, but it may wrap it in markdown code blocks
  const jsonMatch = /\[[\s\S]*\]/.exec(stdout);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        bot_id?: string;
        text?: string;
        ts?: string;
        user?: string;
        username?: string;
      }>;
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].ts) {
        return parsed.map((m) => ({
          text: m.text ?? '',
          ts: m.ts ?? '',
          userId: m.user ?? m.bot_id ?? 'unknown',
        }));
      }
    } catch {
      // Not valid JSON, fall through
    }
  }

  // Strategy 2: Parse the "=== Message from ..." text format
  const messages: CachedSlackMessage[] = [];
  const headerRegex =
    /=== Message from .+? \(([^)]+)\) at .+? ===[\t\v\f\r \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s*Message TS: ([\d.]+)\n/g;

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
    // End at the start of the next header, or end of string
    const nextHeaderStart =
      i + 1 < splits.length
        ? stdout.lastIndexOf('===', splits[i + 1].index)
        : stdout.length;
    const end = nextHeaderStart > start ? nextHeaderStart : stdout.length;
    const text = stdout.slice(start, end).trim();
    if (text) {
      messages.push({ text, ts: splits[i].ts, userId: splits[i].userId });
    }
  }

  return messages;
}

/**
 * Spawn Claude CLI in background to refresh the Slack cache.
 * Returns a promise that resolves when done.
 */
export function refreshSlackCache(): Promise<null | SlackCache> {
  return new Promise((resolve) => {
    getPrInboxChannel().then((channel) => {
      if (!channel) {
        resolve(null);
        return;
      }

      if (_fetching) {
        resolve(_cache);
        return;
      }

      _fetching = true;
      const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 86_400;

      const prompt = [
        `Use the slack_read_channel tool to read channel ${channel} with oldest=${twoDaysAgo} and limit=100.`,
        'After getting the result, output ONLY a JSON array of the messages.',
        'Each message object should have these fields: user, text, ts, bot_id (if present).',
        'Output the JSON array directly with no markdown formatting, no explanation, just the raw JSON.',
      ].join(' ');

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

      const chunks: string[] = [];
      const child = spawn(
        cliPath,
        ['--dangerously-skip-permissions', '-p', prompt],
        { env, cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
      );

      child.stdout.on('data', (data: Buffer) => {
        chunks.push(data.toString());
      });

      child.stderr.on('data', (data: Buffer) => {
        // Ignore ANSI/progress output from Claude CLI
        const text = data.toString().trim();
        if (text && !text.startsWith('\u001B')) {
          console.warn('[pr-inbox] Claude CLI stderr:', text);
        }
      });

      child.on('close', (code) => {
        _fetching = false;
        const stdout = chunks.join('');

        if (code !== 0) {
          console.error(`[pr-inbox] Claude CLI exited with code ${code}`);
          resolve(_cache);
          return;
        }

        const messages = parseMessages(stdout);

        if (stdout.trim().length > 0 && messages.length === 0) {
          console.warn(
            '[pr-inbox] Failed to parse any messages from Claude CLI output. First 500 chars:',
            stdout.slice(0, 500),
          );
        }

        _cache = {
          channel,
          fetchedAt: new Date().toISOString(),
          messages,
        };
        console.warn(
          `[pr-inbox] Slack cache refreshed: ${messages.length} messages from ${channel}`,
        );
        resolve(_cache);
      });

      // Kill after 3 minutes
      const killTimer = setTimeout(() => {
        child.kill('SIGTERM');
        console.error('[pr-inbox] Claude CLI timed out after 3 minutes');
      }, 180_000);

      child.on('close', () => clearTimeout(killTimer));
    });
  });
}
