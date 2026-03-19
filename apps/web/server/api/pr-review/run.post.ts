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

interface PrMeta {
  number: number;
  title: string;
  author: string;
  headSha: string;
}

interface RunRequest {
  repoLabel: string;
  prNumbers: number[];
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

function fetchPrMeta(
  prNumber: number,
  ghRepo: string,
): PrMeta {
  let title: string;
  let author: string;
  let headSha: string;

  try {
    const raw = execSync(
      `gh pr view ${prNumber} --repo ${ghRepo} --json title,author,headRefOid`,
      { encoding: 'utf8', timeout: 10_000 },
    );
    const meta = JSON.parse(raw) as {
      author: { login: string };
      headRefOid: string;
      title: string;
    };
    title = meta.title;
    author = meta.author.login;
    headSha = meta.headRefOid;
  } catch {
    title = `PR #${prNumber}`;
    author = 'unknown';
    headSha = '';
  }

  return { number: prNumber, title, author, headSha };
}

export default defineEventHandler(async (event) => {
  const body = await readBody<RunRequest>(event);
  const { repoLabel } = body;
  const prNumbers = body.prNumbers;

  if (!repoLabel || !Array.isArray(prNumbers) || prNumbers.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'repoLabel and prNumbers (non-empty array) are required',
    });
  }

  for (const n of prNumbers) {
    if (!Number.isInteger(n) || n <= 0) {
      throw createError({
        statusCode: 400,
        message: `Invalid PR number: ${n}`,
      });
    }
  }

  const repo = await getRepoByLabel(repoLabel);
  if (!repo) {
    throw createError({
      statusCode: 404,
      message: `Repo "${repoLabel}" not found`,
    });
  }

  // Fetch metadata for all PRs upfront
  const prMetas = prNumbers.map((n) => fetchPrMeta(n, repo.githubRepo));

  // Filter out already-reviewed PRs
  const toReview: PrMeta[] = [];
  const skipped: string[] = [];
  for (const pr of prMetas) {
    if (!pr.headSha) {
      toReview.push(pr); // can't check dedup without SHA, let it run
      continue;
    }
    const existing = await prisma.prReview.findUnique({
      where: {
        repoLabel_prNumber_commitSha: {
          repoLabel,
          prNumber: pr.number,
          commitSha: pr.headSha,
        },
      },
    });
    if (existing) {
      skipped.push(`#${pr.number}`);
    } else {
      toReview.push(pr);
    }
  }

  if (toReview.length === 0) {
    return {
      skipped: true,
      message: `All PRs already reviewed: ${skipped.join(', ')}`,
    };
  }

  const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const job = createJob(
    jobId,
    toReview.map((pr) => ({
      key: `#${pr.number}`,
      summary: `${repo.githubRepo} — ${pr.title}`,
    })),
    'pr-review',
  );

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
    const results: RunResult[] = [];

    for (const pr of toReview) {
      if (job.status === 'cancelled') break;

      const issueKey = `#${pr.number}`;

      try {
        let currentPhase = 1;
        pushPhase(job, 1, PHASES[0]?.label ?? '分析 PR', issueKey);

        const prompt = buildPrompt(repo.githubRepo, pr.number);

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
              const msg =
                error instanceof Error ? error.message : String(error);
              pushChunk(job, `❌ spawn failed: ${msg}\n`);
              resolve({ ok: false, text: `spawn failed: ${msg}` });
              return;
            }

            job.kill = () => child.kill();
            pushChunk(
              job,
              `▶ Claude 已啟動，開始 Review PR #${pr.number}...\n`,
            );

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
              pushChunk(job, text, issueKey);
              const next = detectPhaseTransition(text, currentPhase);
              if (next > currentPhase) {
                currentPhase = next;
                const phaseInfo = PHASES.find((q) => q.phase === next);
                if (phaseInfo)
                  pushPhase(job, next, phaseInfo.label, issueKey);
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
        if (resultMatch?.[1] && pr.headSha) {
          try {
            await prisma.prReview.create({
              data: {
                jobId,
                repoLabel,
                prNumber: pr.number,
                prTitle: pr.title,
                prAuthor: pr.author,
                commitSha: pr.headSha,
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

        if (job.status !== 'cancelled') {
          results.push({
            issueKey,
            ...(output.ok ? { output: output.text } : { error: output.text }),
          });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(
          `[pr-review] Error reviewing PR #${pr.number}:`,
          msg,
        );
        pushChunk(job, `\n❌ PR #${pr.number} Review 失敗: ${msg}\n`);
        results.push({ issueKey, error: msg });
      }
    }

    if (job.status !== 'cancelled') finishJob(job, results);
  })();

  return { jobId, skipped: skipped.length > 0 ? skipped : undefined };
});
