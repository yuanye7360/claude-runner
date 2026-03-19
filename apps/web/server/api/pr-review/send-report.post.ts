import { execSync } from 'node:child_process';
import process from 'node:process';

import { resolveClaudeCliPath } from '../../utils/claude-cli';
import prisma from '../../utils/prisma';
import { getAllRepos } from '../../utils/repo-mapping';

interface SendReportRequest {
  channel: string;
  date?: string;
}

function buildReportMarkdown(
  reviews: Array<{
    blockers: number;
    githubRepo: string;
    majors: number;
    minors: number;
    prNumber: number;
    prTitle: string;
    repoLabel: string;
    suggestions: number;
  }>,
  dateStr: string,
): string {
  if (reviews.length === 0) {
    return `📋 *PR Review — ${dateStr}*\n今天沒有 Review 紀錄`;
  }

  const totalBlockers = reviews.reduce((s, r) => s + r.blockers, 0);
  const totalMajors = reviews.reduce((s, r) => s + r.majors, 0);

  const lines: string[] = [
    `📋 *PR Review — ${dateStr}*  (${reviews.length} PRs)`,
  ];

  if (totalBlockers > 0 || totalMajors > 0) {
    const parts: string[] = [];
    if (totalBlockers > 0) parts.push(`🔴 ${totalBlockers}`);
    if (totalMajors > 0) parts.push(`🟡 ${totalMajors}`);
    lines.push(parts.join(' '));
  }

  // Group by repo
  const byRepo = new Map<string, typeof reviews>();
  for (const r of reviews) {
    const key = r.repoLabel;
    const arr = byRepo.get(key);
    if (arr) {
      arr.push(r);
    } else {
      byRepo.set(key, [r]);
    }
  }

  for (const [repoLabel, repoReviews] of byRepo) {
    lines.push('', `*${repoLabel}*`);
    for (const r of repoReviews) {
      const badges: string[] = [];
      if (r.blockers > 0) badges.push(`🔴${r.blockers}`);
      if (r.majors > 0) badges.push(`🟡${r.majors}`);
      if (r.minors > 0) badges.push(`🟢${r.minors}`);
      if (r.suggestions > 0) badges.push(`💡${r.suggestions}`);
      const badgeStr = badges.length > 0 ? `  ${badges.join(' ')}` : '  ✅';
      const prUrl = `https://github.com/${r.githubRepo}/pull/${r.prNumber}`;
      lines.push(`• <${prUrl}|#${r.prNumber}> ${r.prTitle}${badgeStr}`);
    }
  }

  return lines.join('\n');
}

export default defineEventHandler(async (event) => {
  const body = await readBody<SendReportRequest>(event);
  const { channel, date } = body;

  if (!channel || typeof channel !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'channel is required',
    });
  }

  // Fetch reviews
  const targetDate = date ? new Date(date) : new Date();
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  const reviews = await prisma.prReview.findMany({
    where: { reviewedAt: { gte: startOfDay, lte: endOfDay } },
    orderBy: { reviewedAt: 'asc' },
  });

  // Build repoLabel → githubRepo lookup
  const allRepos = await getAllRepos();
  const repoMap = new Map(allRepos.map((r) => [r.label, r.githubRepo]));

  const enriched = reviews.map((r) => ({
    ...r,
    githubRepo: repoMap.get(r.repoLabel) ?? r.repoLabel,
  }));

  const dateStr = targetDate.toISOString().slice(0, 10);
  const markdown = buildReportMarkdown(enriched, dateStr);

  // Use Claude CLI to send via Slack MCP
  const prompt = `Send the following message to the Slack channel "${channel}". Use the slack_send_message tool. Do NOT modify the message content — send it exactly as provided.

Message:
${markdown}`;

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

  try {
    execSync(
      `${cliPath} --dangerously-skip-permissions -p ${JSON.stringify(prompt)}`,
      {
        encoding: 'utf8',
        timeout: 30_000,
        env,
        cwd: process.cwd(),
      },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw createError({
      statusCode: 500,
      message: `Failed to send Slack message: ${msg}`,
    });
  }

  return { ok: true, channel, reviewCount: reviews.length };
});
