import { execSync } from 'node:child_process';
import process from 'node:process';

import { resolveClaudeCliPath } from '../../utils/claude-cli';
import prisma from '../../utils/prisma';

interface SendReportRequest {
  channel: string;
  date?: string;
}

function buildReportMarkdown(
  reviews: Array<{
    blockers: number;
    commitSha: string;
    majors: number;
    minors: number;
    prAuthor: string;
    prNumber: number;
    prTitle: string;
    repoLabel: string;
    suggestions: number;
    summaryComment: null | string;
  }>,
  dateStr: string,
): string {
  if (reviews.length === 0) {
    return `# PR Review Daily Report — ${dateStr}\n\nNo PRs reviewed today.`;
  }

  const totalBlockers = reviews.reduce((s, r) => s + r.blockers, 0);
  const totalMajors = reviews.reduce((s, r) => s + r.majors, 0);
  const totalMinors = reviews.reduce((s, r) => s + r.minors, 0);
  const totalSuggestions = reviews.reduce((s, r) => s + r.suggestions, 0);

  const lines: string[] = [
    `# PR Review Daily Report — ${dateStr}`,
    '',
    '## Summary',
    `- Total PRs reviewed: ${reviews.length}`,
    `- 🔴 Blockers: ${totalBlockers} | 🟡 Majors: ${totalMajors} | 🟢 Minors: ${totalMinors} | 💡 Suggestions: ${totalSuggestions}`,
    '',
    '## Reviews',
  ];

  for (const [i, r] of reviews.entries()) {
    lines.push(
      '',
      `### ${i + 1}. ${r.repoLabel}#${r.prNumber} — ${r.prTitle}`,
      `- **Author:** @${r.prAuthor}`,
      `- **Commit:** ${r.commitSha.slice(0, 7)}`,
      `- **Findings:** 🔴 ${r.blockers} | 🟡 ${r.majors} | 🟢 ${r.minors} | 💡 ${r.suggestions}`,
    );
    if (r.summaryComment) {
      lines.push(`- **Key Issues:** ${r.summaryComment}`);
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

  const dateStr = targetDate.toISOString().slice(0, 10);
  const markdown = buildReportMarkdown(reviews, dateStr);

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
