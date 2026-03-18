# Dashboard Report Design

## Goal

Add a `/dashboard` page to ClaudeRunner that provides execution statistics, trend charts, and issue history — serving both personal tracking and team reporting needs.

## Approach

Pure frontend computation. Fetch all job history from the existing `/api/claude-runner/jobs` endpoint, compute aggregates in a `useDashboard` composable, render with Chart.js. No new API endpoints or DB schema changes.

## Prerequisites

### HistoryEntry type needs `status` field

The existing `HistoryEntry` interface in `useRunnerJob.ts` is missing the `status` field. The API already returns it, but the type doesn't declare it. Add `status: 'done' | 'error' | 'cancelled'` to `HistoryEntry`. This is required for KPI breakdown and table status badges.

### API limit increase

The jobs API in `jobs/index.get.ts` hard-caps `limit` at 200. Change to 500 so the dashboard can fetch sufficient history:

```ts
const limit = Math.min(Number(query.limit) || 50, 500);
```

### Chart.js SSR handling

`chart.js` and `vue-chartjs` use browser Canvas APIs. `DashboardCharts.vue` must be wrapped in `<ClientOnly>` to prevent SSR errors. Install both packages:

```bash
pnpm add chart.js vue-chartjs --filter web
```

## Page Structure

Route: `/dashboard`, accessible from top navigation (same level as Skills).

Layout top-to-bottom:

1. **Time filter bar** — Quick toggle buttons (today / this week / this month / all) + custom date range picker. "This week" = Monday–Sunday in local timezone. "This month" = 1st to today.
2. **KPI summary cards** — 4 cards in a row
3. **Trend charts** — 2 charts side by side
4. **Issue detail table** — Searchable, sortable history list

## KPI Summary Cards

4 cards computed from filtered time range:

| Card | Value | Sub-info |
|------|-------|----------|
| Total Runs | Job count | Success / Failed / Cancelled breakdown |
| Issues Processed | Count of `results` entries across non-cancelled jobs | Number where `prUrl` is set |
| Success Rate | `results without error / total results` % | Delta vs previous equal-length period (up/down indicator) |
| Avg Duration | Mean of `durationSecs` (exclude jobs where undefined) | Fastest / Slowest |

## Trend Charts

Two charts side by side, powered by Chart.js. Wrapped in `<ClientOnly>`.

**Left: Execution Volume (Stacked Bar)**
- X-axis: Date. Daily granularity for ranges ≤ 30 days, weekly for longer ranges
- Y-axis: Job count
- Stacked bars: Success (green) / Failed (red) / Cancelled (gray)
- Job status derived from `status` field: `done` = success, `error` = failed, `cancelled` = cancelled

**Right: Success Rate (Line)**
- X-axis: Same date axis as left chart
- Y-axis: 0-100%
- Single line with data points, hover tooltip with exact values

## Issue Detail Table

**Row model: one row per result** — each `RunResult` in each job becomes a row. This allows each row to have a single JIRA link and a clear success/failure status.

| Column | Description |
|--------|-------------|
| Time | Job's execution timestamp, default sort newest first |
| Issue Key | Clickable link to JIRA (`{baseUrl}/browse/{key}`) |
| Summary | Issue title from `job.issues` matched by key, truncated if long |
| Status | Success (no error) / Failed (has error) badge |
| PR | PR link on success, error summary on failure |
| Duration | Parent job's `durationSecs` |

Features:
- **Search** — Input field, fuzzy match on Issue Key and Summary
- **Sort** — Click column header to toggle asc/desc (Time, Status, Duration)
- **Pagination** — 20 rows per page with page controls

## Data Flow

```
/api/claude-runner/jobs?limit=500
        |
  composable: useDashboard(jobs, dateRange)
        |
  Frontend compute: filter by time -> aggregate KPI / chart data / detail list
        |
  Page render
```

- `useDashboard(jobs, dateRange)` — single composable handling all computation, returns computed KPI, chart series, and filtered detail list
- Single fetch on page load, no polling

## File Structure

- `apps/web/app/pages/dashboard.vue` — Page component
- `apps/web/app/composables/useDashboard.ts` — All computation logic
- `apps/web/app/components/DashboardKpiCards.vue` — KPI cards row
- `apps/web/app/components/DashboardCharts.vue` — Chart.js charts (client-only)
- `apps/web/app/components/DashboardTable.vue` — Issue detail table

## Dependencies

- `chart.js` + `vue-chartjs` — Chart rendering (client-only)
- No new API endpoints
- No DB schema changes

## Non-Goals

- Export (CSV/PDF) — not needed for now
- Real-time updates / polling — page load fetch is sufficient
- Backend aggregation — frontend computation is adequate for expected data volume (< 500 jobs)
