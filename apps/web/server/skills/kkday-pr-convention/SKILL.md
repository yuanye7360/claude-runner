---
name: kkday-pr-convention
description: >
  Creates or edits GitHub pull requests following KKday conventions via gh CLI.
  Use when the user asks to create a PR, open a PR, edit a PR description, or
  prepare a pull request in any KKday repository. Trigger keywords: "PR",
  "pull request", "gh pr create", "gh pr edit", "open PR", "發 PR".
metadata:
  author: KKday IT
  version: 1.1.0
---

# KKday PR Convention

## Workflow

### 1. Check for repo PR template

```bash
cat .github/pull_request_template.md
```

If the repo has a template, use its section structure. Otherwise fall back to the
default format in step 4.

### 2. Determine base branch

Auto-detect first:

```bash
gh repo view --json defaultBranchRef -q .defaultBranchRef.name
```

Only ask if auto-detection fails. Do not list options unprompted.

### 3. Build PR title

Format: `[JIRA-KEY] <concise summary>`

| Example |
|---------|
| `[KB2CW-3115] 移除售前客服商品頁導流 AB test 相關邏輯` |
| `[VM-1186] JP DX メインページ改修` |
| `[NO-JIRA] Fix typo in checkout footer` |

If no JIRA key is available, ask for one. Use `[NO-JIRA]` only as a last resort.

### 4. Build PR body

Fill every section — never leave a section as `...` or empty.

```md
## Description
<說明變更內容>

## Changed
<條列技術改動與 side effect>

## Screenshots (Test Plan)
<截圖、錄影或文字描述測試結果；若無則寫明原因>

## Related documents
<列出 JIRA / Confluence / 討論連結>

## QA notes
<QA 測試方法；若不適用則寫 N/A 並說明原因>
```

### 5. Create or edit the PR

**Create:**

```bash
gh pr create \
  --title "[JIRA-KEY] <summary>" \
  --body "$(cat <<'EOB'
## Description
移除售前客服商品頁導流 AB test 相關邏輯，包含 feature flag 與相關元件。

## Changed
- 移除 `PreSaleABTest` 元件及相關 hooks
- 清除 feature flag `presale_ab_test` 判斷邏輯
- Side effect: 售前客服入口將固定顯示，不再走 AB 分流

## Screenshots (Test Plan)
已於 dev 環境驗證商品頁客服入口正常顯示。

## Related documents
JIRA: https://kkday.atlassian.net/browse/KB2CW-3115

## QA notes
確認商品頁客服入口正常顯示即可，無需測試 AB 分流。
EOB
)" \
  --base develop
```

**Edit:**

```bash
gh pr edit <pr-number> \
  --title "[JIRA-KEY] <summary>" \
  --body "$(cat <<'EOB'
...
EOB
)"
```

**View:**

```bash
gh pr view <pr-number> --json title,body
```

## Do / Don't

- Do: include a concrete Test Plan (steps + expected result), even if it's "N/A — config-only change".
- Do: list side effects / risks in Changed.
- Don't: leave any template section blank or with placeholder text.
- Don't: use vague titles like "fix bug" or "update code".
- Don't: paste long chat logs or internal secrets into the description.
