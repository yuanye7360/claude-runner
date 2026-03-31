# PR Inbox — Design Spec

## Overview

A new `/pr-inbox` page that fetches PR review requests from a Slack channel, displays them in a unified list, and allows triggering AI code review on selected PRs.

## Problem

Team members post PR review requests in the `#b2c-web-pr` Slack channel in various formats. Currently there's no single dashboard to see all pending review requests — you have to scroll through Slack manually. The existing `/pr-review` page fetches PRs from GitHub API (all open PRs per repo), which doesn't reflect what the team actually needs reviewed.

## Solution

A lightweight, manual-refresh inbox:

1. User opens `/pr-inbox` or presses refresh
2. Server reads the Slack channel via Claude CLI + Slack MCP, parses PR URLs with regex
3. Server enriches with GitHub metadata (`gh pr view`) and cross-references `PrReview` DB for review status
4. Frontend displays a filterable list; user selects PRs and triggers AI review via existing `POST /api/pr-review/run`

## Non-Goals

- No server-side background polling (avoids token cost)
- No auto-review mode
- No new database tables (reuse existing `PrReview` for status)
- No replacement of `/pr-review` page (coexists)

---

## Architecture

### Data Flow

```
User opens /pr-inbox
  → Frontend calls POST /api/pr-inbox/fetch
    → Server spawns Claude CLI with minimal prompt
      → Claude calls slack_read_channel MCP (oldest = 2 days ago)
      → Returns raw messages
    → Server parses PR URLs via regex
    → Server calls gh pr view for each PR (title, author, state, headSha)
    → Server queries PrReview DB for review status
    → Returns enriched PR list to frontend
  → Frontend renders list

User selects PRs → clicks Review
  → Frontend calls POST /api/pr-review/run (existing endpoint)
  → Same review execution flow as /pr-review page
```

### API

#### `POST /api/pr-inbox/fetch`

**Request:** (none — reads channel from Settings)

**Response:**
```ts
interface PrInboxResponse {
  items: PrInboxItem[];
  fetchedAt: string; // ISO timestamp
  channel: string;   // channel ID used
}

interface PrInboxItem {
  repo: string;           // "kkday-it/kkday-member-ci"
  prNumber: number;
  prTitle: string;
  prAuthor: string;       // GitHub author
  htmlUrl: string;        // full GitHub PR URL
  headSha: string;
  slackUser: string;      // Slack display name of requester
  slackTs: string;        // message timestamp
  requestedAt: string;    // ISO timestamp of Slack message
  reviewStatus: 'closed' | 'not-reviewed' | 'outdated' | 'reviewed';
  // repoLabel matched from Repo config (for triggering review)
  repoLabel: string | null;
}
```

**Server logic:**

1. Read `pr_inbox.slack_channel` from `AppSetting`
2. Spawn Claude CLI with minimal prompt:
   ```
   Read Slack channel {channelId} messages from the last 2 days using slack_read_channel
   with oldest={unixTimestamp}. Print the full raw output exactly as returned. Do not
   summarize, filter, or reformat.
   ```
   Use `--dangerously-skip-permissions -p` flags (same pattern as `send-report.post.ts`).
3. Parse Claude CLI stdout — extract raw message text
4. For each message, apply exclusion rules:
   - Skip messages containing `PR Review Status` (status reports)
   - Skip bot reminder messages (`subtype: bot_message` + no GitHub PR URL)
   - Keep Claude-generated review requests (`Sent using Claude`)
5. Extract all GitHub PR URLs via regex: `/https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/g`
6. Deduplicate by `repo + prNumber` (keep earliest message)
7. For each unique PR, call `gh pr view` for metadata + state
8. Cross-reference `PrReview` DB:
   - Has review with matching commitSha → `reviewed`
   - Has review but different commitSha → `outdated`
   - No review record → `not-reviewed`
   - PR state is merged/closed → `closed`
9. Match repo against `Repo` config to resolve `repoLabel`
10. Return sorted by `requestedAt` desc

### Settings

One new setting in the Integrations tab:

| Key | Default | Description |
|-----|---------|-------------|
| `pr_inbox.slack_channel` | `""` | Slack channel ID to fetch PR requests from |

Configured alongside existing `slack.ai_notifications` in the Settings Integrations UI.

---

## Frontend

### Page: `/pr-inbox`

New file: `apps/web/app/pages/pr-inbox.vue`

### Composable: `usePrInbox`

```ts
// State
items: Ref<PrInboxItem[]>
loading: Ref<boolean>
fetchedAt: Ref<string | null>
selected: Ref<Set<string>>  // "repo#prNumber"

// Actions
fetch(): Promise<void>       // POST /api/pr-inbox/fetch
runReview(): Promise<void>   // trigger review for selected items
```

Internally calls `useRunnerJob` (same as `usePrReviewer`) for review execution tracking.

### Layout (two-panel, consistent with `/pr-review`)

**Left panel — PR list:**
- Header: "PR Inbox" + count badge + Refresh button (with loading spinner)
- "上次更新：N 分鐘前" timestamp
- Status filter tabs: `全部 / 待 review / 有更新 / 已 review`
- PR list grouped by Slack requester, sorted by time desc
- Each row: checkbox, PR number (link to GitHub), title, author avatar/name, repo badge, status badge, requested time
- Bottom bar: "Review (N)" button

**Right panel — execution:**
- Reuse `RunnerStatusRow` + `RunnerJobProgress` + `RunnerJobHistory`
- Same tabs: "執行過程" / "執行紀錄"

### Sidebar

Add to `AppSidebar.vue`:
```
/pr-inbox — i-lucide-inbox — PR Inbox
```
Position: below "Code Review" (`/pr-review`).

---

## Exclusion Rules

Messages from the Slack channel are filtered before parsing:

| Rule | Pattern | Reason |
|------|---------|--------|
| Status report | Message contains `PR Review Status` | Scott's daily status summary, not a review request |
| Bot reminder | `subtype: bot_message` AND no GitHub PR URL | Scheduled reminders like "該 code review 囉" |

Messages containing `Sent using Claude` are **kept** — these are human-initiated review requests posted via Claude.

All other messages containing at least one GitHub PR URL are treated as review requests.

---

## Review Trigger Flow

When user clicks "Review (N)":

1. Group selected `PrInboxItem` by `repoLabel`
2. For each group, call `POST /api/pr-review/run` with `{ repoLabel, prNumbers }`
3. Track execution via `useRunnerJob` (SSE streaming, phase timeline)
4. On completion, next refresh will show updated status (`reviewed`)

Items without a matching `repoLabel` (repo not configured in Settings) show a warning badge and cannot be selected for review.

---

## File Changes Summary

| Type | Path | Description |
|------|------|-------------|
| New page | `apps/web/app/pages/pr-inbox.vue` | Page wrapper |
| New component | `apps/web/app/components/PrInboxTab.vue` | Main UI component |
| New composable | `apps/web/app/composables/usePrInbox.ts` | State + actions |
| New API | `apps/web/server/api/pr-inbox/fetch.post.ts` | Slack fetch + parse + enrich |
| Edit | `apps/web/app/components/AppSidebar.vue` | Add nav item |
| Edit | `apps/web/app/components/SettingsIntegrationsTab.vue` | Add PR Inbox channel config |
