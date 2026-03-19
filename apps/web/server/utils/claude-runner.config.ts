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

function buildWorkflow(
  issue: JiraIssue,
  skills: SkillContentMap,
  smartMode: boolean,
  injectMap: SkillInjectMap = {},
): string {
  const steps: string[] = [];
  let n = 1;

  // Step: JIRA lifecycle — transition to In Progress
  const lifecycle = injectSkillsByTarget('jira', skills, injectMap);
  if (lifecycle) {
    steps.push(
      `${n}. Manage JIRA ticket lifecycle\n${lifecycle}\nTransition the ticket to "In Progress" before starting work.`,
    );
    n++;
  }

  // Step: branch
  const branch = injectSkillsByTarget('branch', skills, injectMap);
  if (branch) {
    steps.push(
      `${n}. Create a branch for ${issue.key}\n${branch}\nFollow the branch naming instructions above.`,
    );
    n++;
  }

  // Step: implement
  steps.push(`${n}. Implement the fix`);
  n++;

  // Step: Run tests
  steps.push(
    `${n}. **Run tests**
   Run the project's test suite before proceeding (e.g., \`npm test\`, \`yarn test\`, \`pnpm test\`).
   - If tests fail, fix the failing tests before moving on.
   - If the project has linting configured, run that too.
   - Do NOT skip this step even if the change seems trivial.`,
  );
  n++;

  // Step: Playwright (smart mode only)
  if (smartMode) {
    steps.push(
      `${n}. **Playwright verification (smart mode)**
   After implementing, assess whether the change affects any UI or browser-visible behavior.
   - If YES (e.g., changed a Vue component, CSS, page layout, user-facing text, routing):
     1. Use Playwright MCP to open the relevant page and take a screenshot (save to /tmp/playwright-verify-${issue.key}.png)
     2. Visually verify the screenshot matches the expected design
     3. In the PR body's **Screenshots (Test Plan)** section, write a text description of what was verified:
        - What page/component was checked
        - What the screenshot showed (layout, colors, states)
        - Whether it matches the design spec
     4. Do NOT commit screenshots to the repository (no .github/screenshots/).
        If the project has a Storybook preview deployed by CI, reference that URL instead.
   - If NO (e.g., pure API logic, config, types, backend-only change):
     Write "No UI verification needed — backend/config only change" in the Screenshots section.`,
    );
    n++;
  }

  // Step: PR
  const pr = injectSkillsByTarget('pr', skills, injectMap);
  if (pr) {
    steps.push(
      `${n}. Create the PR${smartMode ? ' (include Playwright result if applicable)' : ''}\n${pr}\nFollow the PR convention instructions above.`,
    );
    n++;
  }

  // Step: worklog
  const worklog = injectSkillsByTarget('worklog', skills, injectMap);
  if (worklog) {
    steps.push(
      `${n}. Log work time\n${worklog}\nFollow the worklog instructions above.`,
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
) => buildWorkflow(issue, skills, false, injectMap);

export const PROMPT_SMART = (
  issue: JiraIssue,
  skills: SkillContentMap,
  injectMap: SkillInjectMap = {},
) => buildWorkflow(issue, skills, true, injectMap);

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

function buildMediumPrompt(
  issue: JiraIssue,
  skills: SkillContentMap,
  analysis: AnalysisResult,
  injectMap: SkillInjectMap = {},
): string {
  const branch = injectSkillsByTarget('branch', skills, injectMap);
  const pr = injectSkillsByTarget('pr', skills, injectMap);
  const worklog = injectSkillsByTarget('worklog', skills, injectMap);
  const context = injectContextSkills(skills, injectMap);
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
实现完成后，先运行项目的测试套件（npm test / yarn test / pnpm test）确保所有测试通过，有 lint 也一并运行。测试失败必须修复后才能继续。

${pr ? `建立 PR：\n${pr}\n` : ''}
${worklog ? `记录工时：\n${worklog}\n` : ''}
${context}

IMPORTANT: This is a fully automated pipeline. Do NOT ask the user any questions or wait for confirmation at any step. Make all decisions autonomously and proceed to completion.
When the PR is created, also print the PR URL on its own line prefixed exactly with "PR: ".`.trim();
}

function buildComplexPrompt(
  issue: JiraIssue,
  skills: SkillContentMap,
  analysis: AnalysisResult,
  injectMap: SkillInjectMap = {},
): string {
  const branch = injectSkillsByTarget('branch', skills, injectMap);
  const pr = injectSkillsByTarget('pr', skills, injectMap);
  const worklog = injectSkillsByTarget('worklog', skills, injectMap);
  const context = injectContextSkills(skills, injectMap);
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
${branch || '建立工作分支。'}
Follow the branch naming instructions above.

## 阶段四：逐 Repo 执行
按计划逐个 repo 执行实现。
${analysis.repos
  .map((r) => {
    const name = r.path.split('/').pop() ?? r.path;
    return `完成 ${name} 后输出标记：[CHECKPOINT:repo_done:${name}]`;
  })
  .join('\n')}

## 阶段五：运行测试
运行每个涉及 repo 的测试套件（npm test / yarn test / pnpm test）和 lint，确保所有测试通过。
测试失败必须修复后才能继续。
完成后输出标记：[CHECKPOINT:tests_done]

## 阶段六：收尾
${pr ? `建立 PR：\n${pr}\nFollow the PR convention instructions above.` : '建立 PR。'}
完成后输出标记：[CHECKPOINT:pr_done]
${worklog ? `\n记录工时：\n${worklog}\nFollow the worklog instructions above.` : ''}
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
