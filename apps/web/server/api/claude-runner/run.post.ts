import type { Phases, SkillContentMap } from '../../utils/claude-runner.config';
import type { RunResult } from '../../utils/jobStore';
import type { AnalysisResult } from '../../utils/task-analyzer';

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

import matter from 'gray-matter';
import pty from 'node-pty';

import {
  buildDynamicPrompt,
  generateDynamicPhases,
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
import { resolveReposFromLabels } from '../../utils/repo-mapping';

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
  analysisResult?: AnalysisResult;
  repoCwds?: string[];
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
  // KKday repos use git-flow: develop is the base branch for feature work
  try {
    const hasDevlop = execSync('git rev-parse --verify origin/develop', {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (hasDevlop) return 'develop';
  } catch {
    // no develop branch
  }
  try {
    const ref = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    return ref.split('/').pop() || 'main';
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
  repoLabel?: string,
): Promise<{ ok: boolean; text: string }> {
  return new Promise((resolve) => {
    const allText: string[] = [];
    let currentPhase = 1;
    const tag = repoLabel ? `${issue.key}@${repoLabel}` : issue.key;

    pushPhase(job, 1, phases[0]?.label ?? '分析 & 建立分支', tag);

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
      pushChunk(
        job,
        `❌ [${tag}] pty.spawn failed: ${msg}\n`,
        repoLabel ? tag : undefined,
      );
      resolve({ ok: false, text: `pty.spawn failed: ${msg}` });
      return;
    }

    killFns.push(() => child.kill());
    pushChunk(
      job,
      `▶ [${tag}] Claude 已啟動...\n`,
      repoLabel ? tag : undefined,
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
      pushChunk(job, text, repoLabel ? tag : undefined);
      const next = detectPhaseTransition(text, currentPhase, phases);
      if (next > currentPhase) {
        currentPhase = next;
        const phaseInfo = phases.find((p) => p.phase === next);
        if (phaseInfo) pushPhase(job, next, phaseInfo.label, tag);
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
    analysisResult,
    repoCwds: _repoCwds,
  } = await readBody<RunRequest>(event);

  // Resolve repos from JIRA labels
  const allLabels = issues.flatMap((i: any) => i.labels ?? []);
  const mappedRepos = resolveReposFromLabels(allLabels);

  // Determine repo list: mapped repos → manual repoConfig → env fallback
  const repoCwds =
    mappedRepos.length > 0
      ? mappedRepos.map((r) => r.cwd)
      : ([repoConfig?.cwd || process.env.CLAUDE_RUNNER_CWD].filter(
          Boolean,
        ) as string[]);
  if (repoCwds.length === 0) throw new Error('Missing env: CLAUDE_RUNNER_CWD');

  const skills = loadSkillContent(enabledSkills ?? DEFAULT_SKILLS);

  const fallbackPhases = mode === 'smart' ? PHASES_SMART : PHASES_NORMAL;
  const phases = analysisResult
    ? generateDynamicPhases(analysisResult)
    : fallbackPhases;

  const fallbackPrompt =
    mode === 'smart'
      ? (i: JiraIssue) => PROMPT_SMART(i, skills)
      : (i: JiraIssue) => PROMPT_NORMAL(i, skills);
  const buildPrompt = analysisResult
    ? (i: JiraIssue) => buildDynamicPrompt(i, skills, analysisResult)
    : fallbackPrompt;

  // When multiple repos, expand issues per repo so frontend can display them separately
  const isMultiRepo = repoCwds.length > 1;
  const jobIssues = isMultiRepo
    ? repoCwds.flatMap((cwd) => {
        const repoName = cwd.split('/').pop() ?? cwd;
        return issues.map((i) => ({
          key: `${i.key ?? ''}@${repoName}`,
          summary: `[${repoName}] ${i.summary ?? ''}`,
        }));
      })
    : issues.map((i) => ({ key: i.key ?? '', summary: i.summary ?? '' }));

  const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const job = createJob(jobId, jobIssues, 'claude-runner');

  if (analysisResult) {
    job.analysisResult = analysisResult;
  }

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
    const results: RunResult[] = [];

    // Execute repos in parallel
    await Promise.all(
      repoCwds.map(async (repoCwd) => {
        if (job.status === 'cancelled') return;

        const repoName = repoCwd.split('/').pop() ?? repoCwd;
        pushChunk(job, `\n📂 开始处理 repo: ${repoName}\n`);

        // Fetch latest and get base branch for this repo
        const mainBranch = getMainBranch(repoCwd);
        try {
          execSync(`git fetch origin ${mainBranch}`, {
            cwd: repoCwd,
            timeout: 30_000,
          });
        } catch {
          // non-fatal
        }

        for (const issue of issues) {
          if (job.status === 'cancelled') break;

          const safeKey = (issue.key ?? 'issue').replaceAll(/[^a-z0-9]/gi, '-');
          const worktreePath = `/tmp/cr-${jobId}-${safeKey}-${repoName}`;

          try {
            execSync(
              `git worktree add "${worktreePath}" "origin/${mainBranch}"`,
              { cwd: repoCwd, timeout: 15_000 },
            );
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            pushChunk(
              job,
              `❌ [${issue.key}@${repoName}] Failed to create worktree: ${msg}\n`,
            );
            const issueTag = isMultiRepo
              ? `${issue.key}@${repoName}`
              : (issue.key ?? '');
            results.push({ issueKey: issueTag, error: msg });
            continue;
          }

          try {
            const issueTag = isMultiRepo
              ? `${issue.key}@${repoName}`
              : (issue.key ?? '');
            const output = await runIssue(
              issue,
              worktreePath,
              job,
              phases,
              buildPrompt,
              env,
              killFns,
              isMultiRepo ? repoName : undefined,
            );
            if (job.status !== 'cancelled') {
              const prMatch =
                /PR:\s*(https:\/\/github\.com\/\S+\/pull\/\d+)/i.exec(
                  output.text,
                );
              results.push({
                issueKey: issueTag,
                ...(output.ok
                  ? { output: output.text }
                  : { error: output.text }),
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
        }
      }),
    );

    if (job.status !== 'cancelled') finishJob(job, results);
  })();

  return { jobId, jobIssues };
});
