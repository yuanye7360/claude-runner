import type { RunResult } from '../../utils/jobStore';

import process from 'node:process';

import pty from 'node-pty';

import { resolveClaudeCliPath } from '../../utils/claude-cli';
import { getGitHubOrg } from '../../utils/config-loader';
import {
  createJob,
  finishJob,
  pushChunk,
  pushPhase,
} from '../../utils/jobStore';
import { getAllRepos } from '../../utils/repo-mapping';

interface PRItem {
  number: number;
  title: string;
  repo: string; // "owner/repo"
  branch: string; // head ref
  html_url: string;
}

interface RunRequest {
  prs: PRItem[];
  repoConfig?: { cwd: string };
}

const PHASES = [
  { phase: 1, label: '拉取分支 & 分析 Review' },
  { phase: 2, label: '實作修復', pattern: /Edit\b|str_replace|write_file/i },
  { phase: 3, label: 'Push commits', pattern: /git push/i },
];

function detectPhaseTransition(text: string, currentPhase: number): number {
  for (const p of PHASES) {
    if (p.phase > currentPhase && 'pattern' in p && p.pattern?.test(text)) {
      return p.phase;
    }
  }
  return currentPhase;
}

function buildPrompt(pr: PRItem, reviewComments: string): string {
  return `Use the /pr-review-fixer skill to handle the following PR review comments.

## PR Info
Repo: ${pr.repo}
PR #${pr.number}: ${pr.title}
Branch: ${pr.branch}

## Review comments
${reviewComments}

完成后打印 "PR_FIXED: #${pr.number}"`.trim();
}

async function resolveBranch(pr: PRItem): Promise<string> {
  if (pr.branch) return pr.branch;
  const { execSync } = await import('node:child_process');
  try {
    return execSync(
      `gh pr view ${pr.number} --repo ${pr.repo} --json headRefName -q .headRefName`,
      { encoding: 'utf8', timeout: 10_000 },
    ).trim();
  } catch {
    return '';
  }
}

async function fetchReviewComments(pr: PRItem): Promise<string> {
  const { execSync } = await import('node:child_process');
  const parts: string[] = [];

  // Review comments (inline)
  try {
    const raw = execSync(
      String.raw`gh api "/repos/${pr.repo}/pulls/${pr.number}/comments" --jq '.[] | "review_comment_id:\(.id) | \(.user.login) on \(.path):\(.line // "?"):\n\(.body)"'`,
      { encoding: 'utf8', timeout: 15_000 },
    );
    if (raw.trim()) parts.push(`--- Inline Review Comments ---\n${raw.trim()}`);
  } catch {
    /* skip */
  }

  // Issue comments (general)
  try {
    const raw = execSync(
      String.raw`gh api "/repos/${pr.repo}/issues/${pr.number}/comments" --jq '.[] | "issue_comment_id:\(.id) | \(.user.login):\n\(.body)"'`,
      { encoding: 'utf8', timeout: 15_000 },
    );
    if (raw.trim()) parts.push(`--- General Comments ---\n${raw.trim()}`);
  } catch {
    /* skip */
  }

  return parts.join('\n\n') || '（無 review 留言）';
}

export default defineEventHandler(async (event) => {
  const { prs, repoConfig } = await readBody<RunRequest>(event);

  if (!Array.isArray(prs) || prs.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'prs must be a non-empty array',
    });
  }

  // Validate inputs to prevent shell injection
  for (const pr of prs) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(pr.repo)) {
      throw createError({
        statusCode: 400,
        message: `Invalid repo format: ${pr.repo}`,
      });
    }
    if (!Number.isInteger(pr.number) || pr.number <= 0) {
      throw createError({
        statusCode: 400,
        message: `Invalid PR number: ${pr.number}`,
      });
    }
  }

  // Resolve repoCwd from PR's repo field via config.yaml
  const firstPr = prs[0];
  const allRepos = await getAllRepos();
  const matchedRepo = allRepos.find(
    (r) => `${getGitHubOrg()}/${r.githubRepo}` === firstPr.repo,
  );
  const repoCwd = repoConfig?.cwd ?? matchedRepo?.cwd;
  if (!repoCwd) {
    throw new Error(
      `No repo matched for "${firstPr.repo}". Ensure it is configured in config.yaml.`,
    );
  }

  const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const job = createJob(
    jobId,
    prs.map((p) => ({
      key: `#${p.number}`,
      summary: `${p.repo} — ${p.title}`,
    })),
    'pr-runner',
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

    for (const pr of prs) {
      if (job.status === 'cancelled') break;

      let currentPhase = 1;
      pushPhase(
        job,
        1,
        PHASES[0]?.label ?? '拉取分支 & 分析 Review',
        `#${pr.number}`,
      );

      pr.branch = await resolveBranch(pr);
      const reviewComments = await fetchReviewComments(pr);
      const prompt = buildPrompt(pr, reviewComments);

      const output = await new Promise<{ ok: boolean; text: string }>(
        (resolve) => {
          const allText: string[] = [];
          let child: ReturnType<typeof pty.spawn>;

          try {
            child = pty.spawn(
              resolveClaudeCliPath(),
              [
                '--dangerously-skip-permissions',
                '--output-format',
                'stream-json',
                '--verbose',
                '-p',
                prompt,
              ],
              {
                cwd: repoCwd,
                env: cleanEnv,
                cols: 220,
                rows: 50,
                name: 'xterm-color',
              },
            );
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            pushChunk(job, `❌ pty.spawn failed: ${msg}\n`);
            resolve({ ok: false, text: `pty.spawn failed: ${msg}` });
            return;
          }

          job.kill = () => child.kill();
          pushChunk(job, `▶ Claude 已啟動，等待輸出...\n`);

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
                  // Skip — result text duplicates the last assistant message
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
                // No default
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
              if (phaseInfo)
                pushPhase(job, next, phaseInfo.label, `#${pr.number}`);
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

      if (job.status !== 'cancelled') {
        results.push({
          issueKey: `#${pr.number}`,
          prUrl: pr.html_url,
          ...(output.ok ? { output: output.text } : { error: output.text }),
        });
      }
    }

    if (job.status !== 'cancelled') finishJob(job, results);
  })();

  return { jobId };
});
