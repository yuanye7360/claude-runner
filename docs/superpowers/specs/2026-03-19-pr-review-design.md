# PR Review Feature Design

> Automated code review for others' PRs using Claude CLI, with daily review summaries.

## Overview

New feature in ClaudeRunner that reviews other people's PRs automatically. Claude CLI analyzes PR code, leaves inline comments and a summary comment on GitHub, and tracks all reviews for daily reporting.

## Key Decisions

- **Deduplication:** Based on `prNumber + repoLabel + commitSha`. Same SHA = already reviewed. New push = can review again.
- **Execution model:** Claude CLI spawn (same as PR Runner), fully automated — results posted directly to GitHub.
- **PR source:** Manual selection from UI (list open PRs per repo).
- **Review output:** Inline comments on specific lines + one summary comment on the PR.
- **UI placement:** Third tab on index page alongside JIRA Runner and PR Runner.
- **Review scope:** Claude decides how much context to read.

## Data Model

### PrReview Table (Prisma)

```prisma
model PrReview {
  id             Int      @id @default(autoincrement())
  jobId          String
  job            Job      @relation(fields: [jobId], references: [jobId])
  repoLabel      String
  prNumber       Int
  prTitle        String
  prAuthor       String
  commitSha      String
  blockers       Int      @default(0)
  majors         Int      @default(0)
  minors         Int      @default(0)
  suggestions    Int      @default(0)
  summaryComment String?
  reviewedAt     DateTime @default(now())

  @@unique([repoLabel, prNumber, commitSha])
}
```

Unique constraint on `repoLabel + prNumber + commitSha` enforces deduplication at the DB level.

Job type: `"pr-review"` (new value for existing Job.type field).

## Backend API

### `GET /api/pr-review/prs`

- **Params:** `repoLabel`
- **Action:** Run `gh pr list` for the repo, fetch open PRs
- **Response:** Array of `{ number, title, author, headSha, updatedAt, reviewStatus }` where `reviewStatus` is one of:
  - `not-reviewed` — no PrReview record exists
  - `reviewed` — record exists with matching commitSha
  - `outdated` — record exists but with older commitSha

### `POST /api/pr-review/run`

- **Params:** `repoLabel`, `prNumber`
- **Flow:**
  1. Get latest commit SHA via `gh pr view`
  2. Check PrReview table for existing record with same SHA → return early if exists
  3. Create Job (type: `"pr-review"`)
  4. `spawnClaude()` in repo directory with `pr-reviewer` skill injected
  5. Claude checks out PR branch, reads code, produces review
  6. Claude leaves inline comments via `gh pr review` and summary via `gh pr comment`
  7. Phase detection: Phase 1 (analyzing) → Phase 2 (commenting) → Phase 3 (done)
  8. Parse Claude's JSON output, write PrReview record

### `GET /api/pr-review/history`

- **Params:** `date` (optional, defaults to today), `repoLabel` (optional)
- **Response:** PrReview records for the given date, optionally filtered by repo

### `GET /api/pr-review/daily-report`

- **Params:** `date` (optional, defaults to today)
- **Response:** Markdown daily report

**Daily report format:**

```markdown
# PR Review Daily Report — 2026-03-19

## Summary
- Total PRs reviewed: 5
- 🔴 Blockers: 3 | 🟡 Majors: 7 | 🟢 Minors: 12 | 💡 Suggestions: 4

## Reviews

### 1. kkday-web#142 — Add payment retry logic
- **Author:** @john
- **Commit:** abc1234
- **Findings:** 🔴 1 | 🟡 2 | 🟢 3 | 💡 1
- **Key Issues:** SQL injection in retry query, missing timeout handling

### 2. kkday-api#88 — Update user profile endpoint
- **Author:** @jane
- **Commit:** def5678
- **Findings:** 🔴 0 | 🟡 1 | 🟢 2 | 💡 0
- **Key Issues:** Missing input validation on email field
```

Key Issues are extracted from the summaryComment (🔴 and 🟡 titles only).

## PR Reviewer Skill

New skill at `/Users/yeyuan/.claude/skills/pr-reviewer/`.

### Responsibilities

1. Receive PR info (repo, PR number)
2. Checkout PR branch, read diff and related files as needed
3. Review following `code-review-quality` principles:
   - Priority levels: 🔴 Blocker → 🟡 Major → 🟢 Minor → 💡 Suggestion
   - Focus: logic correctness, security, testability, maintainability, performance
   - Skip: formatting (linter's job), style preferences
4. Leave inline comments via `gh pr review`
5. Leave summary comment via `gh pr comment` with findings table
6. Output structured JSON for backend parsing:

```json
{
  "blockers": 1,
  "majors": 2,
  "minors": 3,
  "suggestions": 1,
  "summaryComment": "full markdown summary"
}
```

### Phase Detection

| Phase | Keywords |
|-------|----------|
| 1 — Analyzing PR | `git checkout`, `gh pr diff` |
| 2 — Reviewing | `gh pr comment`, `gh pr review` |
| 3 — Complete | JSON output detected |

## Frontend UI

### PR Review Tab (third tab on index.vue)

**Upper section — PR selection & execution:**

- Repo dropdown (reuses existing repo config)
- PR list table:
  - PR number + title
  - Author
  - Review status badge: `未 review` (gray) / `已 review` (green) / `有更新` (orange)
  - "Review" action button
- On click Review: show real-time progress (reuse job progress pattern — phase indicator + streaming log)

**Lower section — Today's review summary:**

- Card list of today's reviewed PRs, each showing:
  - PR title + author + repo
  - Findings badges (🔴 1 🟡 2 🟢 3 💡 1)
  - Review time
- Bottom stats bar: total PRs reviewed, total blockers/majors/minors/suggestions
- "Export Report" button → calls `/api/pr-review/daily-report`, copies markdown to clipboard

### New Composables

- `usePrReview()` — manage PR list, trigger review, poll job status
- `usePrReviewHistory()` — fetch review history, daily report

## File Changes Summary

### New Files

- `apps/web/prisma/migrations/xxx_add_pr_review/migration.sql`
- `apps/web/server/api/pr-review/prs.get.ts`
- `apps/web/server/api/pr-review/run.post.ts`
- `apps/web/server/api/pr-review/history.get.ts`
- `apps/web/server/api/pr-review/daily-report.get.ts`
- `apps/web/app/components/PrReviewTab.vue`
- `apps/web/app/composables/usePrReview.ts`
- `apps/web/app/composables/usePrReviewHistory.ts`
- `~/.claude/skills/pr-reviewer/skill.md`

### Modified Files

- `apps/web/prisma/schema.prisma` — add PrReview model + Job relation
- `apps/web/app/pages/index.vue` — add third tab
- `apps/web/server/utils/skill-inject.ts` — add pr-reviewer skill mapping
