// apps/web/server/utils/claude-runner.config.ts
// ─────────────────────────────────────────────────────────────────────────────
// 所有傳給 Claude 的指令（prompt）與階段定義（phases）都集中在這裡。
// 要調整 Claude 的行為，只需改這個檔案。
// ─────────────────────────────────────────────────────────────────────────────

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

export type Phases = typeof PHASES_NORMAL | typeof PHASES_SMART;

// ─── Skill injection ─────────────────────────────────────────────────────────

/** Skills that are wired into specific workflow steps */
const WORKFLOW_SKILLS = new Set([
  'kkday-jira-branch-checkout',
  'kkday-pr-convention',
  'kkday-jira-worklog',
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