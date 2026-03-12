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

function injectSkill(name: string, skills: SkillContentMap): string {
  const content = skills[name];
  if (!content) return `(Skill "${name}" not available — skip this step)`;
  return `=== Skill: ${name} ===\n${content}\n===`;
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

export const PROMPT_NORMAL = (issue: JiraIssue, skills: SkillContentMap) =>
  `
Fix the Jira issue below. Follow the full workflow end-to-end:

1. Create a branch for ${issue.key}
${injectSkill('kkday-jira-branch-checkout', skills)}
Follow the "kkday-jira-branch-checkout" instructions above.

2. Implement the fix

3. Create the PR
${injectSkill('kkday-pr-convention', skills)}
Follow the "kkday-pr-convention" instructions above.

4. Log work time
${injectSkill('kkday-jira-worklog', skills)}
Follow the "kkday-jira-worklog" instructions above.

Jira Issue: ${issue.key}
Summary: ${issue.summary ?? ''}
Description: ${issue.description ?? ''}

When the PR is created, also print the PR URL on its own line prefixed exactly with "PR: ".
`.trim();

export const PROMPT_SMART = (issue: JiraIssue, skills: SkillContentMap) =>
  `
Fix the Jira issue below. Follow the full workflow end-to-end:

1. Create a branch for ${issue.key}
${injectSkill('kkday-jira-branch-checkout', skills)}
Follow the "kkday-jira-branch-checkout" instructions above.

2. Implement the fix

3. **Playwright verification (smart mode)**
   After implementing, assess whether the change affects any UI or browser-visible behavior.
   - If YES (e.g., changed a Vue component, CSS, page layout, user-facing text, routing):
     Use the Playwright MCP tool to open the relevant page, interact as needed,
     and take a screenshot to verify the fix looks correct.
     You must include the verification result/screenshot in the PR description.
   - If NO (e.g., pure API logic, config, types, backend-only change):
     Skip Playwright and note "No UI verification needed." in the PR description.

4. Create the PR (include Playwright result if applicable)
${injectSkill('kkday-pr-convention', skills)}
Follow the "kkday-pr-convention" instructions above.

5. Log work time
${injectSkill('kkday-jira-worklog', skills)}
Follow the "kkday-jira-worklog" instructions above.

Jira Issue: ${issue.key}
Summary: ${issue.summary ?? ''}
Description: ${issue.description ?? ''}

When the PR is created, also print the PR URL on its own line prefixed exactly with "PR: ".
`.trim();
