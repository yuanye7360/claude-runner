---
name: kkday-jira-branch-checkout
description: >
  Create git branches from JIRA ticket numbers following the naming convention
  task/[JIRA_TICKET_NUMBER]-[DESCRIPTION]. Use this skill when: (1) The user asks
  to implement, work on, or fix a JIRA ticket (e.g. "implement KB2CW-419",
  "work on KB2CW-500"), (2) The user mentions a JIRA ticket number and the current
  git branch does not match the expected pattern for that ticket, (3) The user asks
  to create a branch for a JIRA ticket. Trigger keywords: JIRA ticket numbers
  (e.g. KB2CW-XXX, VM-XXX, BIDL-XXX), "implement", "work on", "fix ticket",
  "hotfix", "start working on".
metadata:
  author: KKday IT
  version: 1.1.0
---

# JIRA Branch Checkout

All git operations are handled by `scripts/create-branch.sh`. The agent prepares
three arguments and invokes it.

## Utility scripts

**scripts/create-branch.sh**: Create a `task/<TICKET>-<DESC>` branch from a remote base.

```bash
bash scripts/create-branch.sh <TICKET> <DESCRIPTION> [BASE_BRANCH]
```

| Argument      | Required | Default   | Example                    |
|---------------|----------|-----------|----------------------------|
| `TICKET`      | Yes      | —         | `KB2CW-419`               |
| `DESCRIPTION` | Yes      | —         | `remove-elapsed-time-log`  |
| `BASE_BRANCH` | No       | `develop` | `master`, `rc`             |

The script validates the ticket format, sanitises the description to kebab-case,
handles existing branches, and runs `git fetch` + `git checkout -b`.

## Workflow

### 1. Extract TICKET from user message

e.g. `KB2CW-419`, `VM-1186`, `BIDL-200`.

### 2. Fetch ticket title

```
mcp__claude_ai_Atlassian__getJiraIssue
  cloudId: kkday.atlassian.net
  issueIdOrKey: <TICKET>
```

### 3. Derive DESCRIPTION

Convert the JIRA summary to a **3–6 word** kebab-case English phrase:

1. Translate Chinese/Japanese to English if needed.
2. Drop filler words (the, a, an, for, of, to, in, on, at, with, and, or).
3. Lowercase, hyphens instead of spaces.

| JIRA Summary                           | DESCRIPTION                  |
|----------------------------------------|------------------------------|
| 移除售前客服商品頁導流 AB test 相關邏輯 | remove-presale-ab-test-logic |
| Fix currency check on checkout page    | fix-currency-check-checkout  |
| [JP] DX メインページ改修               | jp-dx-main-page              |
| Session config 調整                     | session-config               |

### 4. Determine BASE_BRANCH

- User says "hotfix" → `master`
- User says "rc fix" → `rc`
- Otherwise → `develop` (do not ask)

### 5. Run the script

```bash
bash "<SKILL_DIR>/scripts/create-branch.sh" "<TICKET>" "<DESCRIPTION>" "<BASE_BRANCH>"
```

Relay the output to the user and proceed with the requested task.
