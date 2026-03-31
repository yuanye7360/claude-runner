import { execSync } from 'node:child_process';
import process from 'node:process';

import { resolveClaudeCliPath } from '../../utils/claude-cli';
import prisma from '../../utils/prisma';
import { getAllRepos } from '../../utils/repo-mapping';
import { getPrInboxChannel } from '../../utils/workspaceConfig';

interface PrInboxItem {
  headSha: string;
  htmlUrl: string;
  prAuthor: string;
  prNumber: number;
  prTitle: string;
  repo: string;
  repoLabel: null | string;
  requestedAt: string;
  reviewStatus: 'closed' | 'not-reviewed' | 'outdated' | 'reviewed';
  slackTs: string;
  slackUser: string;
}

interface PrInboxResponse {
  channel: string;
  fetchedAt: string;
  items: PrInboxItem[];
}

interface SlackMessage {
  text: string;
  ts: string;
  userId: string;
}

/** Parse raw Claude CLI stdout into structured Slack messages */
function parseSlackMessages(stdout: string): SlackMessage[] {
  const messages: SlackMessage[] = [];

  // Split on message headers: "=== Message from ... (USER_ID) at ... ==="
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

/** Check if a user ID is a bot (starts with B) */
function isBotUser(userId: string): boolean {
  return userId.startsWith('B');
}

/** Extract GitHub PR URLs from text */
function extractPrUrls(
  text: string,
): Array<{ prNumber: number; repo: string; url: string }> {
  const results: Array<{ prNumber: number; repo: string; url: string }> = [];
  const prRegex = /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/g;
  for (const m of text.matchAll(prRegex)) {
    results.push({
      prNumber: Number.parseInt(m[2], 10),
      repo: m[1],
      url: m[0],
    });
  }
  return results;
}

export default defineEventHandler(async (_event): Promise<PrInboxResponse> => {
  // Step 1: Get Slack channel from settings
  const channel = await getPrInboxChannel();
  if (!channel) {
    throw createError({
      statusCode: 400,
      message: 'pr_inbox.slack_channel is not configured in settings',
    });
  }

  // Step 2: Spawn Claude CLI to read the Slack channel via MCP
  const prompt = `Read the Slack channel "${channel}" using the slack_read_channel tool. Return all messages from the channel. Include message timestamps and user IDs in the output exactly as provided.`;

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

  let stdout: string;
  try {
    stdout = execSync(
      `${cliPath} --dangerously-skip-permissions -p ${JSON.stringify(prompt)}`,
      {
        encoding: 'utf8',
        timeout: 60_000,
        env,
        cwd: process.cwd(),
      },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw createError({
      statusCode: 500,
      message: `Failed to read Slack channel: ${msg}`,
    });
  }

  // Step 3: Parse Slack messages
  const messages = parseSlackMessages(stdout);

  // Step 4: Apply exclusion rules and extract PR URLs
  // Deduplicate by repo+prNumber
  const seen = new Map<
    string,
    { message: SlackMessage; prNumber: number; repo: string; url: string }
  >();

  for (const msg of messages) {
    // Skip messages containing "PR Review Status" (review reports)
    if (msg.text.includes('PR Review Status')) continue;

    // Skip bot reminders without PR URLs
    const prUrls = extractPrUrls(msg.text);
    if (isBotUser(msg.userId) && prUrls.length === 0) continue;

    for (const pr of prUrls) {
      const key = `${pr.repo}#${pr.prNumber}`;
      if (!seen.has(key)) {
        seen.set(key, {
          message: msg,
          prNumber: pr.prNumber,
          repo: pr.repo,
          url: pr.url,
        });
      }
    }
  }

  // Step 5: Enrich each PR with gh pr view metadata
  const allRepos = await getAllRepos();
  const repoLabelMap = new Map(allRepos.map((r) => [r.githubRepo, r.label]));

  // Step 6: Cross-reference PrReview DB for review status
  const allPrReviews = await prisma.prReview.findMany({
    select: { commitSha: true, prNumber: true, repoLabel: true },
  });

  // Build lookup: repoLabel -> prNumber -> Set<commitSha>
  const reviewLookup = new Map<string, Map<number, Set<string>>>();
  for (const r of allPrReviews) {
    let byPr = reviewLookup.get(r.repoLabel);
    if (!byPr) {
      byPr = new Map();
      reviewLookup.set(r.repoLabel, byPr);
    }
    let shas = byPr.get(r.prNumber);
    if (!shas) {
      shas = new Set();
      byPr.set(r.prNumber, shas);
    }
    shas.add(r.commitSha);
  }

  const items: PrInboxItem[] = [];

  for (const [, { message, prNumber, repo, url }] of seen) {
    // Fetch PR metadata via gh CLI
    let prMeta: null | {
      author: { login: string };
      headRefOid: string;
      state: string;
      title: string;
      url: string;
    } = null;

    try {
      const out = execSync(
        `gh pr view ${prNumber} --repo ${repo} --json title,author,headRefOid,state,url`,
        { encoding: 'utf8', timeout: 15_000 },
      );
      prMeta = JSON.parse(out);
    } catch {
      // If gh fails, skip this PR
      continue;
    }

    if (!prMeta) continue;

    const repoLabel = repoLabelMap.get(repo) ?? null;

    // Determine review status
    let reviewStatus: PrInboxItem['reviewStatus'];
    if (prMeta.state === 'CLOSED' || prMeta.state === 'MERGED') {
      reviewStatus = 'closed';
    } else {
      const byPr = repoLabel ? reviewLookup.get(repoLabel) : undefined;
      const shas = byPr?.get(prNumber);
      if (!shas) {
        reviewStatus = 'not-reviewed';
      } else if (shas.has(prMeta.headRefOid)) {
        reviewStatus = 'reviewed';
      } else {
        reviewStatus = 'outdated';
      }
    }

    // Convert Slack TS to ISO date (TS is Unix seconds with microseconds)
    const requestedAt = new Date(
      Number.parseFloat(message.ts) * 1000,
    ).toISOString();

    items.push({
      headSha: prMeta.headRefOid,
      htmlUrl: url,
      prAuthor: prMeta.author.login,
      prNumber,
      prTitle: prMeta.title,
      repo,
      repoLabel,
      requestedAt,
      reviewStatus,
      slackTs: message.ts,
      slackUser: message.userId,
    });
  }

  // Step 7: Sort by requestedAt desc
  items.sort(
    (a, b) =>
      new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
  );

  return {
    channel,
    fetchedAt: new Date().toISOString(),
    items,
  };
});
