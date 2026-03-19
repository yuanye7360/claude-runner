import type { RunResult } from '../../utils/jobStore';

import { execSync } from 'node:child_process';
import process from 'node:process';

import { resolveClaudeCliPath } from '../../utils/claude-cli';
import { spawnClaude } from '../../utils/claude-spawn';
import {
  createJob,
  finishJob,
  pushChunk,
  pushPhase,
} from '../../utils/jobStore';
import prisma from '../../utils/prisma';
import { getRepoByLabel } from '../../utils/repo-mapping';

interface RunRequest {
  repoLabel: string;
  prNumber: number;
}

const PHASES = [
  { phase: 1, label: '分析 PR' },
  {
    phase: 2,
    label: 'Review 中',
    pattern: /gh pr comment|gh pr review|gh api.*pulls.*comments/i,
  },
  { phase: 3, label: '完成', pattern: /REVIEW_RESULT:/i },
];

function detectPhaseTransition(text: string, currentPhase: number): number {
  for (const p of PHASES) {
    if (p.phase > currentPhase && 'pattern' in p && p.pattern?.test(text)) {
      return p.phase;
    }
  }
  return currentPhase;
}

function buildPrompt(repo: string, prNumber: number): string {
  return `Use the /pr-reviewer skill to review the following PR.

## PR Info
Repo: ${repo}
PR #${prNumber}

Review the PR code and leave your findings as inline comments and a summary comment on GitHub.`.trim();
}

export default defineEventHandler(async (event) => {
  const { repoLabel, prNumber } = await readBody<RunRequest>(event);

  if (!repoLabel || !prNumber) {
    throw createError({
      statusCode: 400,
      message: 'repoLabel and prNumber are required',
    });
  }
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw createError({
      statusCode: 400,
      message: `Invalid PR number: ${prNumber}`,
    });
  }

  const repo = await getRepoByLabel(repoLabel);
  if (!repo) {
    throw createError({
      statusCode: 404,
      message: `Repo "${repoLabel}" not found`,
    });
  }

  // Get latest commit SHA
  let headSha: string;
  try {
    headSha = execSync(
      `gh pr view ${prNumber} --repo ${repo.githubRepo} --json headRefOid -q .headRefOid`,
      { encoding: 'utf8', timeout: 10_000 },
    ).trim();
  } catch {
    throw createError({
      statusCode: 502,
      message: 'Failed to fetch PR head SHA',
    });
  }

  // Check for duplicate review
  const existing = await prisma.prReview.findUnique({
    where: {
      repoLabel_prNumber_commitSha: {
        repoLabel,
        prNumber,
        commitSha: headSha,
      },
    },
  });
  if (existing) {
    return {
      skipped: true,
      message: `PR #${prNumber} at commit ${headSha.slice(0, 7)} already reviewed`,
    };
  }

  // Get PR metadata
  let prTitle: string;
  let prAuthor: string;
  try {
    const meta = JSON.parse(
      execSync(
        `gh pr view ${prNumber} --repo ${repo.githubRepo} --json title,author`,
        { encoding: 'utf8', timeout: 10_000 },
      ),
    ) as { author: { login: string }; title: string };
    prTitle = meta.title;
    prAuthor = meta.author.login;
  } catch {
    prTitle = `PR #${prNumber}`;
    prAuthor = 'unknown';
  }

  const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const issueKey = `#${prNumber}`;
  const job = createJob(
    jobId,
    [{ key: issueKey, summary: `${repo.githubRepo} — ${prTitle}` }],
    'pr-review',
  );

  const prompt = buildPrompt(repo.githubRepo, prNumber);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
  };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;

  const cleanEnv: Record<string, string> = Object.fromEntries(
    Object.entries(env).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  );

  /* eslint-disable no-control-regex */
  const ANSI_RE =
    /\u001B\[[\d;?]*[a-z]|\u001B[a-z]|\u001B\][^\u0007]*(?:\u0007|\u001B\\)/gi;
  /* eslint-enable no-control-regex */

  void (async () => {
    try {
      let currentPhase = 1;
      pushPhase(job, 1, PHASES[0]?.label ?? '分析 PR', issueKey);

      const output = await new Promise<{ ok: boolean; text: string }>(
        (resolve) => {
          const allText: string[] = [];
          let child: ReturnType<typeof spawnClaude>;

          try {
            child = spawnClaude(resolveClaudeCliPath(), {
              args: [
                '--dangerously-skip-permissions',
                '--output-format',
                'stream-json',
                '--verbose',
                '-p',
                prompt,
              ],
              cwd: repo.cwd,
              env: cleanEnv,
            });
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            pushChunk(job, `❌ spawn failed: ${msg}\n`);
            resolve({ ok: false, text: `spawn failed: ${msg}` });
            return;
          }

          job.kill = () => child.kill();
          pushChunk(job, `▶ Claude 已啟動，開始 Review PR #${prNumber}...\n`);

          let lineBuffer = '';

          function processLine(line: string) {
            const trimmed = line.trim();
            if (!trimmed) return;
            let text = '';
            try {
              const ev = JSON.parse(trimmed) as Record<string, unknown>;
              switch (ev.type) {
                case 'assistant': {
                  const content = (
                    ev.message as {
                      content: Array<{ text?: string; type: string }>;
                    }
                  )?.content;
                  text =
                    content
                      ?.filter((c) => c.type === 'text')
                      .map((c) => c.text ?? '')
                      .join('') ?? '';
                  if (text && !text.endsWith('\n')) text += '\n';
                  break;
                }
                case 'result': {
                  break;
                }
                case 'tool_result': {
                  const content = ev.content as
                    | Array<{ text?: string; type: string }>
                    | string;
                  text = Array.isArray(content)
                    ? `${content
                        .filter((c) => c.type === 'text')
                        .map((c) => c.text ?? '')
                        .join('')}\n`
                    : `${content as string}\n`;
                  break;
                }
                case 'tool_use': {
                  const name = ev.name as string;
                  const input = ev.input as Record<string, unknown>;
                  const detail =
                    name === 'Bash'
                      ? (input.command as string)
                      : JSON.stringify(input).slice(0, 120);
                  text = `\n▶ ${name}: ${detail}\n`;
                  break;
                }
              }
            } catch {
              text = `${trimmed}\n`;
            }
            if (!text) return;
            allText.push(text);
            pushChunk(job, text);
            const next = detectPhaseTransition(text, currentPhase);
            if (next > currentPhase) {
              currentPhase = next;
              const phaseInfo = PHASES.find((q) => q.phase === next);
              if (phaseInfo) pushPhase(job, next, phaseInfo.label, issueKey);
            }
          }

          child.onData((data: string) => {
            const clean = data
              .replaceAll(ANSI_RE, '')
              .replaceAll('\r\n', '\n')
              .replaceAll('\r', '\n');
            lineBuffer += clean;
            const lines = lineBuffer.split('\n');
            lineBuffer = lines.pop() ?? '';
            for (const line of lines) processLine(line);
          });

          child.onExit(({ exitCode }) => {
            if (lineBuffer.trim()) processLine(lineBuffer);
            resolve({ text: allText.join(''), ok: exitCode === 0 });
          });
        },
      );

      // Parse REVIEW_RESULT from output
      let blockers = 0;
      let majors = 0;
      let minors = 0;
      let suggestions = 0;
      let summaryComment: null | string = null;
      const resultMatch = /REVIEW_RESULT:(\{.*\})/i.exec(output.text);
      if (resultMatch?.[1]) {
        try {
          const parsed = JSON.parse(resultMatch[1]) as {
            blockers?: number;
            majors?: number;
            minors?: number;
            suggestions?: number;
            summaryComment?: string;
          };
          blockers = parsed.blockers ?? 0;
          majors = parsed.majors ?? 0;
          minors = parsed.minors ?? 0;
          suggestions = parsed.suggestions ?? 0;
          summaryComment = parsed.summaryComment ?? null;
        } catch {
          /* ignore parse error */
        }
      }

      // Save PrReview record only when review completed successfully
      if (resultMatch?.[1]) {
        try {
          await prisma.prReview.create({
            data: {
              jobId,
              repoLabel,
              prNumber,
              prTitle,
              prAuthor,
              commitSha: headSha,
              blockers,
              majors,
              minors,
              suggestions,
              summaryComment,
            },
          });
        } catch (dbError) {
          console.error('[pr-review] Failed to save PrReview:', dbError);
        }
      }

      const results: RunResult[] = [
        {
          issueKey,
          ...(output.ok ? { output: output.text } : { error: output.text }),
        },
      ];

      if (job.status !== 'cancelled') finishJob(job, results);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[pr-review] Error reviewing PR #${prNumber}:`, msg);
      pushChunk(job, `\n❌ PR #${prNumber} Review 失敗: ${msg}\n`);
      finishJob(job, [{ issueKey, error: msg }], true, 'error');
    }
  })();

  return { jobId };
});
