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

// ─── Phases ──────────────────────────────────────────────────────────────────
// 用來追蹤執行進度。phase 數字越大代表越後面的階段；
// pattern 是從 Claude 輸出中偵測「已進入此階段」的正則。

export const PHASES_NORMAL = [
  { phase: 1, label: '分析 & 建立分支' },
  { phase: 2, label: '實作修復', pattern: /Edit\b|str_replace|write_file/i },
  { phase: 3, label: '建立 PR', pattern: /git push|PR READY/i },
] as const;

/** 智能模式比普通模式多一個「Playwright 驗證」階段 */
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

// ─── Prompts ─────────────────────────────────────────────────────────────────

/**
 * 普通模式：
 *   1. 建立分支
 *   2. 實作修復
 *   3. 建立 PR
 *   4. 記工時
 */
export const PROMPT_NORMAL = (issue: JiraIssue) =>
  `
Fix the Jira issue below. Follow the full workflow end-to-end:
1. Use the Skill tool to invoke "kkday-jira-branch-checkout" to create a branch for ${issue.key}
2. Implement the fix
3. Use the Skill tool to invoke "kkday-pr-convention" to create the PR
4. Use the Skill tool to invoke "kkday-jira-worklog" to log work time

Jira Issue: ${issue.key}
Summary: ${issue.summary ?? ''}
Description: ${issue.description ?? ''}

When the PR is created, also print the PR URL on its own line prefixed exactly with "PR: ".
`.trim();

/**
 * 智能模式：普通流程 + 實作後自行判斷是否需要 Playwright 佐證
 *
 *   判斷標準：
 *   - 若改動涉及 UI / 瀏覽器可見行為（Vue 元件、CSS、頁面佈局、使用者文字）
 *     → 用 Playwright MCP 開啟相關頁面、截圖並在 PR 描述中附上截圖結果
 *   - 若為純後端 / API / 型別 / 設定改動
 *     → 跳過 Playwright，並在 PR 描述寫 "No UI verification needed."
 */
export const PROMPT_SMART = (issue: JiraIssue) =>
  `
Fix the Jira issue below. Follow the full workflow end-to-end:
1. Use the Skill tool to invoke "kkday-jira-branch-checkout" to create a branch for ${issue.key}
2. Implement the fix
3. **Playwright verification (smart mode)**
   After implementing, assess whether the change affects any UI or browser-visible behavior.
   - If YES (e.g., changed a Vue component, CSS, page layout, user-facing text, routing):
     Use the Playwright MCP tool to open the relevant page, interact as needed,
     and take a screenshot to verify the fix looks correct.
     You must include the verification result/screenshot in the PR description.
   - If NO (e.g., pure API logic, config, types, backend-only change):
     Skip Playwright and note "No UI verification needed." in the PR description.
4. Use the Skill tool to invoke "kkday-pr-convention" to create the PR (include Playwright result if applicable)
5. Use the Skill tool to invoke "kkday-jira-worklog" to log work time

Jira Issue: ${issue.key}
Summary: ${issue.summary ?? ''}
Description: ${issue.description ?? ''}

When the PR is created, also print the PR URL on its own line prefixed exactly with "PR: ".
`.trim();
