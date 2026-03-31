// apps/web/server/utils/claude-runner.config.ts
// ─────────────────────────────────────────────────────────────────────────────
// 所有傳給 Claude 的指令（prompt）與階段定義（phases）都集中在這裡。
// 要調整 Claude 的行為，只需改這個檔案。
// ─────────────────────────────────────────────────────────────────────────────

import type { AnalysisResult } from './task-analyzer';

export interface JiraIssue {
  key: string;
  summary?: string;
  description?: string;
}

/** Maps skill name → SKILL.md body content (no frontmatter) */
export interface SkillContentMap {
  [skillName: string]: string;
}

/** Maps inject target → array of skill names that inject there */
export interface SkillInjectMap {
  [injectTarget: string]: string[];
}

// ─── Phases ──────────────────────────────────────────────────────────────────

export const PHASES_NORMAL = [
  { phase: 1, label: '分析 & 建立分支' },
  { phase: 2, label: '實作修復', pattern: /Edit\b|str_replace|write_file/i },
  {
    phase: 3,
    label: '運行測試',
    pattern: /npm test|yarn test|pnpm test|vitest|jest/i,
  },
  { phase: 4, label: '建立 PR', pattern: /git push|PR READY/i },
] as const;

export const PHASES_SMART = [
  { phase: 1, label: '分析 & 建立分支' },
  { phase: 2, label: '實作修復', pattern: /Edit\b|str_replace|write_file/i },
  {
    phase: 3,
    label: '運行測試',
    pattern: /npm test|yarn test|pnpm test|vitest|jest/i,
  },
  {
    phase: 4,
    label: 'Playwright 驗證',
    pattern: /playwright|browser_navigate|browser_screenshot/i,
  },
  { phase: 5, label: '建立 PR', pattern: /git push|PR READY/i },
] as const;

export type PhaseDefinition = {
  label: string;
  pattern?: RegExp;
  phase: number;
};
export type Phases = PhaseDefinition[] | readonly PhaseDefinition[];

// ─── Skill injection ─────────────────────────────────────────────────────────

function injectSkill(name: string, skills: SkillContentMap): string {
  const content = skills[name];
  if (!content) return '';
  return `=== Skill: ${name} ===\n${content}\n===`;
}

/** Inject all skills mapped to a given target (e.g. 'branch', 'pr') */
function injectSkillsByTarget(
  target: string,
  skills: SkillContentMap,
  injectMap: SkillInjectMap,
): string {
  const names = injectMap[target] ?? [];
  return names
    .map((n) => injectSkill(n, skills))
    .filter(Boolean)
    .join('\n\n');
}

/** Collect context skills (inject=context or unmapped) */
function injectContextSkills(
  skills: SkillContentMap,
  injectMap: SkillInjectMap,
): string {
  // All skills that are mapped to a non-context target
  const mapped = new Set(
    Object.entries(injectMap)
      .filter(([target]) => target !== 'context')
      .flatMap(([, names]) => names),
  );
  const entries = Object.entries(skills).filter(([name]) => !mapped.has(name));
  if (entries.length === 0) return '';
  const blocks = entries.map(
    ([name, content]) => `=== Skill: ${name} ===\n${content}\n===`,
  );
  return `\n\n--- Additional Guidelines ---\nFollow these additional skills/guidelines during implementation:\n\n${blocks.join('\n\n')}`;
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

/**
 * Build prompt from skills — skills drive the behavior, this function only
 * provides the skeleton. If no skills are enabled, uses minimal fallback steps.
 */
function buildWorkflow(
  issue: JiraIssue,
  skills: SkillContentMap,
  _smartMode: boolean,
  injectMap: SkillInjectMap = {},
  slackChannel = '',
): string {
  // Ordered injection targets — each becomes a step if skills are mapped to it
  const STEP_ORDER: { fallback: string; target: string }[] = [
    { target: 'jira', fallback: '' },
    { target: 'branch', fallback: '' },
    { target: 'implement', fallback: 'Implement the fix for this issue.' },
    {
      target: 'test',
      fallback:
        'Run the project test suite and linting. Fix failures before proceeding.',
    },
    { target: 'pr', fallback: '' },
    { target: 'worklog', fallback: '' },
  ];

  const steps: string[] = [];
  let n = 1;

  for (const { target, fallback } of STEP_ORDER) {
    const injected = injectSkillsByTarget(target, skills, injectMap);
    if (injected) {
      steps.push(`${n}. ${injected}`);
      n++;
    } else if (fallback) {
      steps.push(`${n}. ${fallback}`);
      n++;
    }
  }

  // Slack notification (not a skill — config-driven)
  if (slackChannel) {
    steps.push(
      `${n}. Send a NEW Slack message to channel ${slackChannel} using slack_send_message MCP tool.
   Format: 📋 PR 請求 #<PR_NUMBER> [${issue.key}] <PR_TITLE> • 變更摘要 • 影響範圍 — 請幫忙 review 🙏
   If MCP tools are not available, skip silently.`,
    );
  }

  const context = injectContextSkills(skills, injectMap);

  return `Fix the Jira issue below. Follow the full workflow end-to-end:

${steps.join('\n\n')}

Jira Issue: ${issue.key}
Summary: ${issue.summary ?? ''}
Description: ${issue.description ?? ''}
${context}

IMPORTANT: This is a fully automated pipeline. Do NOT ask the user any questions or wait for confirmation at any step. Make all decisions autonomously (estimates, branch names, PR descriptions, worklog time, etc.) and proceed to completion.
When the PR is created, also print the PR URL on its own line prefixed exactly with "PR: ".`.trim();
}

export const PROMPT_NORMAL = (
  issue: JiraIssue,
  skills: SkillContentMap,
  injectMap: SkillInjectMap = {},
  slackChannel = '',
) => buildWorkflow(issue, skills, false, injectMap, slackChannel);

export const PROMPT_SMART = (
  issue: JiraIssue,
  skills: SkillContentMap,
  injectMap: SkillInjectMap = {},
  slackChannel = '',
) => buildWorkflow(issue, skills, true, injectMap, slackChannel);

// ─── Dynamic Prompt Builders (based on Task Analyzer result) ────────────────

export function buildDynamicPrompt(
  issue: JiraIssue,
  skills: SkillContentMap,
  analysis: AnalysisResult,
  injectMap: SkillInjectMap = {},
): string {
  switch (analysis.suggestedWorkflow) {
    case 'auto': {
      return buildWorkflow(issue, skills, false, injectMap);
    }
    case 'superpowers-full': {
      return buildComplexPrompt(issue, skills, analysis, injectMap);
    }
    case 'superpowers-light': {
      return buildMediumPrompt(issue, skills, analysis, injectMap);
    }
  }
}

/** Medium complexity — analysis summary + skill-driven steps */
function buildMediumPrompt(
  issue: JiraIssue,
  skills: SkillContentMap,
  analysis: AnalysisResult,
  injectMap: SkillInjectMap = {},
): string {
  const context = injectContextSkills(skills, injectMap);
  const repoList = analysis.repos.map((r) => r.path).join(', ');

  // Collect all skill-injected steps
  const skillSteps = ['jira', 'branch', 'implement', 'test', 'pr', 'worklog']
    .map((target) => injectSkillsByTarget(target, skills, injectMap))
    .filter(Boolean);

  return `Implement the following JIRA ticket:

Jira Issue: ${issue.key}
Summary: ${issue.summary ?? ''}
Description: ${issue.description ?? ''}
Repos: ${repoList}
Analysis: ${analysis.summary}

Analyze the core goal in 2-3 sentences, list implementation steps (max 5), then execute.

${skillSteps.length > 0 ? `Follow these skill guidelines:\n\n${skillSteps.join('\n\n')}` : ''}
${context}

IMPORTANT: This is a fully automated pipeline. Do NOT ask the user any questions or wait for confirmation at any step. Make all decisions autonomously and proceed to completion.
When the PR is created, also print the PR URL on its own line prefixed exactly with "PR: ".`.trim();
}

/** Complex multi-repo — checkpoint-driven with skill-injected steps */
function buildComplexPrompt(
  issue: JiraIssue,
  skills: SkillContentMap,
  analysis: AnalysisResult,
  injectMap: SkillInjectMap = {},
): string {
  const jira = injectSkillsByTarget('jira', skills, injectMap);
  const branch = injectSkillsByTarget('branch', skills, injectMap);
  const pr = injectSkillsByTarget('pr', skills, injectMap);
  const worklog = injectSkillsByTarget('worklog', skills, injectMap);
  const context = injectContextSkills(skills, injectMap);
  const repoList = analysis.repos.map((r) => r.path).join(', ');

  return `Implement the following complex JIRA ticket:

Jira Issue: ${issue.key}
Summary: ${issue.summary ?? ''}
Description: ${issue.description ?? ''}
Repos: ${repoList}
Analysis: ${analysis.summary}

Execute strictly in phases:

## Phase 1: Analysis
Analyze requirements, edge cases, impact scope, risks.
[CHECKPOINT:analysis_done]

## Phase 2: Plan
Create detailed implementation plan for each repo.
[CHECKPOINT:plan_done]

## Phase 3: Branch
${branch || 'Create working branch.'}

## Phase 4: Implementation
Implement per repo:
${analysis.repos
  .map((r) => {
    const name = r.path.split('/').pop() ?? r.path;
    return `[CHECKPOINT:repo_done:${name}]`;
  })
  .join('\n')}

## Phase 5: Test
Run all test suites and linting. Fix failures.
[CHECKPOINT:tests_done]

## Phase 6: Finalize
${jira || ''}
${pr || 'Create PR.'}
[CHECKPOINT:pr_done]
${worklog || ''}
${context}

IMPORTANT: This is a fully automated pipeline. Do NOT ask the user any questions or wait for confirmation at any step. Make all decisions autonomously and proceed to completion.
When the PR is created, also print the PR URL on its own line prefixed exactly with "PR: ".`.trim();
}

// ─── Dynamic Phase Generation ───────────────────────────────────────────────

export function generateDynamicPhases(
  analysis: AnalysisResult,
): PhaseDefinition[] {
  const phases: PhaseDefinition[] = [];
  let n = 1;

  if (analysis.suggestedWorkflow === 'superpowers-full') {
    phases.push(
      {
        phase: n++,
        label: '需求分析',
        pattern: /\[CHECKPOINT:analysis_done\]/i,
      },
      {
        phase: n++,
        label: '制定计划',
        pattern: /\[CHECKPOINT:plan_done\]/i,
      },
      { phase: n++, label: '建立分支' },
    );
  } else {
    phases.push({ phase: n++, label: '分析 & 建立分支' });
  }

  // Per-repo phases
  for (const repo of analysis.repos) {
    const repoName = repo.path.split('/').pop() ?? repo.path;
    phases.push({
      phase: n++,
      label: `${repoName} 实现`,
      pattern: new RegExp(
        String.raw`\[CHECKPOINT:repo_done:${repoName}\]`,
        'i',
      ),
    });
  }

  phases.push(
    {
      phase: n++,
      label: '运行测试',
      pattern: /\[CHECKPOINT:tests_done\]|npm test|yarn test|pnpm test/i,
    },
    {
      phase: n++,
      label: '建立 PR',
      pattern: /git push|PR READY|\[CHECKPOINT:pr_done/i,
    },
  );

  return phases;
}
