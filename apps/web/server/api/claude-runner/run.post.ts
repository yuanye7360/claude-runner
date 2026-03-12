import type { Phases, SkillContentMap } from '../../utils/claude-runner.config';
import type { RunResult } from '../../utils/jobStore';

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

import matter from 'gray-matter';
import pty from 'node-pty';

import {
  PHASES_NORMAL,
  PHASES_SMART,
  PROMPT_NORMAL,
  PROMPT_SMART,
} from '../../utils/claude-runner.config';
import {
  createJob,
  finishJob,
  pushChunk,
  pushPhase,
} from '../../utils/jobStore';

interface JiraIssue {
  key: string;
  summary?: string;
  description?: string;
}

interface RunRequest {
  issues: JiraIssue[];
  repoConfig?: { cwd: string };
  mode?: 'normal' | 'smart';
  enabledSkills?: string[];
}

const DEFAULT_SKILLS = [
  'kkday-jira-branch-checkout',
  'kkday-pr-convention',
  'kkday-jira-worklog',
];

function loadSkillContent(enabledSkills: string[]): SkillContentMap {
  const map: SkillContentMap = {};
  const dirs = [
    resolve(new URL('.', import.meta.url).pathname, '../../skills'),
    join(homedir(), '.claude', 'skills'),
  ];
  for (const name of enabledSkills) {
    for (const dir of dirs) {
      const file = join(dir, name, 'SKILL.md');
      if (existsSync(file)) {
        const { content } = matter(readFileSync(file, 'utf8'));
        map[name] = content.trim();
        break; // internal (first dir) wins
      }
    }
  }
  return map;
}

function detectPhaseTransition(
  text: string,
  currentPhase: number,
  phases: Phases,
): number {
  for (const p of phases) {
    if (p.phase > currentPhase && 'pattern' in p && p.pattern?.test(text)) {
      return p.phase;
    }
  }
  return currentPhase;
}

/* eslint-disable no-control-regex -- intentional: matching ESC/BEL control chars */
const ANSI_RE =
  /\u001B\[[\d;?]*[a-z]|\u001B[a-z]|\u001B\][^\u0007]*(?:\u0007|\u001B\\)/gi;
/* eslint-enable no-control-regex */

function getMainBranch(cwd: string): string {
  try {
    const branch = execSync(
      `git remote show origin | grep 'HEAD branch' | awk '{print $NF}'`,
      { cwd, encoding: 'utf8', timeout: 10_000 },
    ).trim();
    return branch || 'main';
  } catch {
    return 'main';
  }
}

function runIssue(
  issue: JiraIssue,
  worktreePath: string,
  job: ReturnType<typeof createJob>,
  phases: Phases,
  buildPrompt: (i: JiraIssue) => string,
  env: NodeJS.ProcessEnv,
  killFns: (() => void)[],
): Promise<{ ok: boolean; text: string }> {
  return new Promise((resolve) => {
    const allText: string[] = [];
    let currentPhase = 1;

    pushPhase(job, 1, phases[0]?.label ?? '分析 & 建立分支', issue.key);

    const cleanEnv: Record<string, string> = Object.fromEntries(
      Object.entries(env).filter(
        (e): e is [string, string] => e[1] !== undefined,
      ),
    );

    let child: ReturnType<typeof pty.spawn>;
    try {
      child = pty.spawn(
        '/opt/homebrew/bin/claude',
        [
          '--dangerously-skip-permissions',
          '--output-format',
          'stream-json',
          '--verbose',
          '-p',
          buildPrompt(issue),
        ],
        {
          cwd: worktreePath,
          env: cleanEnv,
          cols: 220,
          rows: 50,
          name: 'xterm-color',
        },
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      pushChunk(job, `❌ [${issue.key}] pty.spawn failed: ${msg}\n`);
      resolve({ ok: false, text: `pty.spawn failed: ${msg}` });
      return;
    }

    killFns.push(() => child.kill());
    pushChunk(job, `▶ [${issue.key}] Claude 已啟動...\n`);

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
            if (Array.isArray(content)) {
              text = `${content
                .filter((c) => c.type === 'text')
                .map((c) => c.text ?? '')
                .join('')}\n`;
            } else if (typeof content === 'string') {
              text = `${content}\n`;
            }
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
      const next = detectPhaseTransition(text, currentPhase, phases);
      if (next > currentPhase) {
        currentPhase = next;
        const phaseInfo = phases.find((p) => p.phase === next);
        if (phaseInfo) pushPhase(job, next, phaseInfo.label, issue.key);
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
  });
}

export default defineEventHandler(async (event) => {
  const {
    issues,
    repoConfig,
    mode = 'normal',
    enabledSkills,
  } = await readBody<RunRequest>(event);

  const repoCwd = repoConfig?.cwd || process.env.CLAUDE_RUNNER_CWD;
  if (!repoCwd) throw new Error('Missing env: CLAUDE_RUNNER_CWD');

  const phases = mode === 'smart' ? PHASES_SMART : PHASES_NORMAL;
  const skills = loadSkillContent(enabledSkills ?? DEFAULT_SKILLS);
  const buildPrompt =
    mode === 'smart'
      ? (i: JiraIssue) => PROMPT_SMART(i, skills)
      : (i: JiraIssue) => PROMPT_NORMAL(i, skills);

  const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const job = createJob(
    jobId,
    issues.map((i) => ({ key: i.key ?? '', summary: i.summary ?? '' })),
    'claude-runner',
  );

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
  };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;

  const killFns: (() => void)[] = [];
  job.kill = () => {
    for (const fn of killFns) fn();
  };

  void (async () => {
    // Fetch latest and get main branch before spawning any worktrees
    const mainBranch = getMainBranch(repoCwd);
    try {
      execSync(`git fetch origin ${mainBranch}`, {
        cwd: repoCwd,
        timeout: 30_000,
      });
    } catch {
      // non-fatal
    }

    const results: RunResult[] = [];

    await Promise.all(
      issues.map(async (issue) => {
        if (job.status === 'cancelled') return;

        const safeKey = (issue.key ?? 'issue').replaceAll(/[^a-z0-9]/gi, '-');
        const worktreePath = `/tmp/cr-${jobId}-${safeKey}`;

        try {
          execSync(
            `git worktree add "${worktreePath}" "origin/${mainBranch}"`,
            { cwd: repoCwd, timeout: 15_000 },
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          pushChunk(
            job,
            `❌ [${issue.key}] Failed to create worktree: ${msg}\n`,
          );
          results.push({ issueKey: issue.key ?? '', error: msg });
          return;
        }

        try {
          const output = await runIssue(
            issue,
            worktreePath,
            job,
            phases,
            buildPrompt,
            env,
            killFns,
          );
          if (job.status !== 'cancelled') {
            const prMatch =
              /PR:\s*(https:\/\/github\.com\/\S+\/pull\/\d+)/i.exec(
                output.text,
              );
            results.push({
              issueKey: issue.key ?? '',
              ...(output.ok ? { output: output.text } : { error: output.text }),
              ...(prMatch ? { prUrl: prMatch[1] } : {}),
            });
          }
        } finally {
          try {
            execSync(`git worktree remove "${worktreePath}" --force`, {
              cwd: repoCwd,
              timeout: 15_000,
            });
          } catch {
            // non-fatal
          }
        }
      }),
    );

    if (job.status !== 'cancelled') finishJob(job, results);
  })();

  return { jobId };
});
