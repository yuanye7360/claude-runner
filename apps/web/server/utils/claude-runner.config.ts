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

// ─── Phases ──────────────────────────────────────────────────────────────────

export const PHASES_NORMAL = [
  { phase: 1, label: '分析 & 建立分支' },
  { phase: 2, label: '實作修復', pattern: /Edit\b|str_replace|write_file/i },
  { phase: 3, label: '建立 PR', pattern: /git push|PR READY/i },
] as const;

export const PHASES_SMART = [
  { phase: 1, label: '分析 & 建立分支' },
  { phase: 2, label: '實作修復', pattern: /Edit\b|str_replace|write_file/i },
  {
    phase: 3,
    label: 'Playwright 驗證',
    pattern: /playwright|browser_navigate|browser_screenshot/i,
  },
  { phase: 4, label: '建立 PR', pattern: /git push|PR READY/i },
] as const;

export type PhaseDefinition = {
  label: string;
  pattern?: RegExp;
  phase: number;
};
export type Phases = PhaseDefinition[] | readonly PhaseDefinition[];

// ─── Skill injection ─────────────────────────────────────────────────────────

/** Skills that are wired into specific workflow steps */
const WORKFLOW_SKILLS = new Set([
  'kkday-jira-branch-checkout',
  'kkday-jira-worklog',
  'kkday-pr-convention',
]);

function injectSkill(name: string, skills: SkillContentMap): string {
  const content = skills[name];
  if (!content) return '';
  return `=== Skill: ${name} ===\n${content}\n===`;
}

/** Collect non-workflow skills as additional context/guidelines */
function injectContextSkills(skills: SkillContentMap): string {
  const entries = Object.entries(skills).filter(
    ([name]) => !WORKFLOW_SKILLS.has(name),
  );
  if (entries.length === 0) return '';
  const blocks = entries.map(
    ([name, content]) => `=== Skill: ${name} ===\n${content}\n===`,
  );
  return `\n\n--- Additional Guidelines ---\nFollow these additional skills/guidelines during implementation:\n\n${blocks.join('\n\n')}`;
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

function buildWorkflow(
  issue: JiraIssue,
  skills: SkillContentMap,
  smartMode: boolean,
): string {
  const steps: string[] = [];
  let n = 1;

  // Step: branch
  const branch = injectSkill('kkday-jira-branch-checkout', skills);
  if (branch) {
    steps.push(
      `${n}. Create a branch for ${issue.key}\n${branch}\nFollow the "kkday-jira-branch-checkout" instructions above.`,
    );
    n++;
  }

  // Step: implement
  steps.push(`${n}. Implement the fix`);
  n++;

  // Step: Playwright (smart mode only)
  if (smartMode) {
    steps.push(
      `${n}. **Playwright verification (smart mode)**
   After implementing, assess whether the change affects any UI or browser-visible behavior.
   - If YES (e.g., changed a Vue component, CSS, page layout, user-facing text, routing):
     Use the Playwright MCP tool to open the relevant page, interact as needed,
     and take a screenshot to verify the fix looks correct.
     You must include the verification result/screenshot in the PR description.
   - If NO (e.g., pure API logic, config, types, backend-only change):
     Skip Playwright and note "No UI verification needed." in the PR description.`,
    );
    n++;
  }

  // Step: PR
  const pr = injectSkill('kkday-pr-convention', skills);
  if (pr) {
    steps.push(
      `${n}. Create the PR${smartMode ? ' (include Playwright result if applicable)' : ''}\n${pr}\nFollow the "kkday-pr-convention" instructions above.`,
    );
    n++;
  }

  // Step: worklog
  const worklog = injectSkill('kkday-jira-worklog', skills);
  if (worklog) {
    steps.push(
      `${n}. Log work time\n${worklog}\nFollow the "kkday-jira-worklog" instructions above.`,
    );
  }

  const context = injectContextSkills(skills);

  return `Fix the Jira issue below. Follow the full workflow end-to-end:

${steps.join('\n\n')}

Jira Issue: ${issue.key}
Summary: ${issue.summary ?? ''}
Description: ${issue.description ?? ''}
${context}
When the PR is created, also print the PR URL on its own line prefixed exactly with "PR: ".`.trim();
}

export const PROMPT_NORMAL = (issue: JiraIssue, skills: SkillContentMap) =>
  buildWorkflow(issue, skills, false);

export const PROMPT_SMART = (issue: JiraIssue, skills: SkillContentMap) =>
  buildWorkflow(issue, skills, true);

// ─── Dynamic Prompt Builders (based on Task Analyzer result) ────────────────

export function buildDynamicPrompt(
  issue: JiraIssue,
  skills: SkillContentMap,
  analysis: AnalysisResult,
): string {
  switch (analysis.suggestedWorkflow) {
    case 'auto': {
      return buildWorkflow(issue, skills, false);
    }
    case 'superpowers-full': {
      return buildComplexPrompt(issue, skills, analysis);
    }
    case 'superpowers-light': {
      return buildMediumPrompt(issue, skills, analysis);
    }
  }
}

function buildMediumPrompt(
  issue: JiraIssue,
  skills: SkillContentMap,
  analysis: AnalysisResult,
): string {
  const branch = injectSkill('kkday-jira-branch-checkout', skills);
  const pr = injectSkill('kkday-pr-convention', skills);
  const worklog = injectSkill('kkday-jira-worklog', skills);
  const context = injectContextSkills(skills);
  const repoList = analysis.repos.map((r) => r.path).join(', ');

  return `你正在实现以下 JIRA ticket：
Jira Issue: ${issue.key}
Summary: ${issue.summary ?? ''}
Description: ${issue.description ?? ''}
涉及 repo：${repoList}
分析摘要：${analysis.summary}

请先用 2-3 句话分析这个需求的核心目标和注意事项，
然后列出实现步骤（不超过 5 步），
最后按步骤执行。

${branch ? `建立分支：\n${branch}\n` : ''}
实现完成后：
${pr ? `建立 PR：\n${pr}\n` : ''}
${worklog ? `记录工时：\n${worklog}\n` : ''}
${context}
When the PR is created, also print the PR URL on its own line prefixed exactly with "PR: ".`.trim();
}

function buildComplexPrompt(
  issue: JiraIssue,
  skills: SkillContentMap,
  analysis: AnalysisResult,
): string {
  const branch = injectSkill('kkday-jira-branch-checkout', skills);
  const pr = injectSkill('kkday-pr-convention', skills);
  const worklog = injectSkill('kkday-jira-worklog', skills);
  const context = injectContextSkills(skills);
  const repoList = analysis.repos.map((r) => r.path).join(', ');

  return `你正在实现以下 JIRA ticket：
Jira Issue: ${issue.key}
Summary: ${issue.summary ?? ''}
Description: ${issue.description ?? ''}
涉及 repo：${repoList}
分析摘要：${analysis.summary}

这是一个复杂任务，请严格按以下流程执行：

## 阶段一：需求分析
深入分析需求，考虑边界情况、影响范围、风险点。输出分析报告。
完成后输出标记：[CHECKPOINT:analysis_done]

## 阶段二：实现计划
制定详细实现计划，包含每个 repo 的改动内容、依赖顺序、测试策略。
完成后输出标记：[CHECKPOINT:plan_done]

## 阶段三：建立分支
${branch ?? '建立工作分支。'}
Follow the "kkday-jira-branch-checkout" instructions above.

## 阶段四：逐 Repo 执行
按计划逐个 repo 执行实现。
${analysis.repos
  .map((r) => {
    const name = r.path.split('/').pop() ?? r.path;
    return `完成 ${name} 后输出标记：[CHECKPOINT:repo_done:${name}]`;
  })
  .join('\n')}

## 阶段五：收尾
${pr ? `建立 PR：\n${pr}\nFollow the "kkday-pr-convention" instructions above.` : '建立 PR。'}
完成后输出标记：[CHECKPOINT:pr_done]
${worklog ? `\n记录工时：\n${worklog}\nFollow the "kkday-jira-worklog" instructions above.` : ''}
${context}
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

  phases.push({
    phase: n++,
    label: '建立 PR',
    pattern: /git push|PR READY|\[CHECKPOINT:pr_done/i,
  });

  return phases;
}
