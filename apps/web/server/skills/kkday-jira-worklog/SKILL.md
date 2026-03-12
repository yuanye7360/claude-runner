---
name: kkday-jira-worklog
description: >
  Logs work time to JIRA after completing a ticket implementation. Triggers
  automatically after PR creation for a JIRA ticket, or when the user explicitly
  asks to log work time. Trigger keywords: "worklog", "log time", "time tracking",
  or after invoking kkday-pr-convention for a JIRA-related PR.
metadata:
  author: KKday IT
  version: 1.1.0
---

# JIRA Worklog

## Workflow

### 1. Identify the JIRA ticket

Extract the ticket key from (in priority order):
1. Current branch name: `task/KB2CW-419-*` → `KB2CW-419`
2. Conversation context (ticket mentioned earlier)
3. Ask the user

### 2. Estimate time spent

| Scope                                  | Estimate   |
|----------------------------------------|------------|
| Simple code removal / config change    | 10–15m     |
| Small feature / bug fix (1–3 files)    | 15–30m     |
| Medium feature (3–10 files)            | 30m–1h     |
| Large feature (10+ files, multi-step)  | 1h–2h      |

Round to the nearest 5 minutes. Format: `Xh Ym` (e.g. `15m`, `1h`, `1h 30m`).

Present the estimate to the user for confirmation before logging.

### 3. Log the worklog

```
mcp__claude_ai_Atlassian__addWorklogToJiraIssue
  cloudId: kkday.atlassian.net
  issueIdOrKey: <TICKET>
  timeSpent: <TIME>
```

### 4. Confirm

> Logged **\<TIME>** to \<TICKET>.
