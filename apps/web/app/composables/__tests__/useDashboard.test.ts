import type { HistoryEntry } from '../useRunnerJob';

import { describe, expect, it } from 'vitest';

import {
  computeChartData,
  computeDetailRows,
  computeKpi,
  filterByDateRange,
} from '../useDashboard';

const makeJob = (
  overrides: Partial<HistoryEntry> & { id: string },
): HistoryEntry => ({
  status: 'done',
  timestamp: Date.now(),
  durationSecs: 60,
  issues: [{ key: 'TEST-1', summary: 'Test issue' }],
  results: [{ issueKey: 'TEST-1' }],
  ...overrides,
});

describe('filterByDateRange', () => {
  it('filters jobs within date range', () => {
    const now = Date.now();
    const jobs = [
      makeJob({ id: '1', timestamp: now }),
      makeJob({ id: '2', timestamp: now - 7 * 86_400_000 }),
      makeJob({ id: '3', timestamp: now - 60 * 86_400_000 }),
    ];
    const result = filterByDateRange(jobs, {
      start: now - 30 * 86_400_000,
      end: now + 1,
    });
    expect(result).toHaveLength(2);
    expect(result.map((j) => j.id)).toEqual(['1', '2']);
  });

  it('returns all jobs when range is null', () => {
    const jobs = [makeJob({ id: '1' }), makeJob({ id: '2' })];
    expect(filterByDateRange(jobs, null)).toHaveLength(2);
  });
});

describe('computeKpi', () => {
  it('computes correct KPI from mixed results', () => {
    const jobs = [
      makeJob({
        id: '1',
        status: 'done',
        durationSecs: 120,
        results: [
          { issueKey: 'A-1', prUrl: 'https://github.com/org/repo/pull/1' },
          { issueKey: 'A-2', prUrl: 'https://github.com/org/repo/pull/2' },
        ],
      }),
      makeJob({
        id: '2',
        status: 'error',
        durationSecs: 30,
        results: [{ issueKey: 'B-1', error: 'failed' }],
      }),
      makeJob({
        id: '3',
        status: 'cancelled',
        durationSecs: undefined,
        results: [],
      }),
    ];
    const kpi = computeKpi(jobs);
    expect(kpi.totalRuns).toBe(3);
    expect(kpi.successCount).toBe(1);
    expect(kpi.failedCount).toBe(1);
    expect(kpi.cancelledCount).toBe(1);
    expect(kpi.issuesProcessed).toBe(3);
    expect(kpi.prCreated).toBe(2);
    expect(kpi.successRate).toBeCloseTo(66.67, 0);
    expect(kpi.avgDuration).toBe(75);
    expect(kpi.minDuration).toBe(30);
    expect(kpi.maxDuration).toBe(120);
  });

  it('handles empty jobs array', () => {
    const kpi = computeKpi([]);
    expect(kpi.totalRuns).toBe(0);
    expect(kpi.successRate).toBe(0);
    expect(kpi.avgDuration).toBe(0);
  });
});

describe('computeChartData', () => {
  it('groups jobs by date for daily granularity', () => {
    const base = new Date('2026-03-15T10:00:00').getTime();
    const jobs = [
      makeJob({ id: '1', status: 'done', timestamp: base }),
      makeJob({ id: '2', status: 'error', timestamp: base }),
      makeJob({
        id: '3',
        status: 'done',
        timestamp: base + 86_400_000,
      }),
    ];
    const chart = computeChartData(jobs, 'daily');
    expect(chart.labels).toHaveLength(2);
    expect(chart.success[0]).toBe(1);
    expect(chart.failed[0]).toBe(1);
    expect(chart.success[1]).toBe(1);
  });
});

describe('computeDetailRows', () => {
  it('flattens jobs into per-result rows', () => {
    const jobs = [
      makeJob({
        id: '1',
        timestamp: 1000,
        durationSecs: 60,
        issues: [
          { key: 'A-1', summary: 'Fix bug' },
          { key: 'A-2', summary: 'Add feature' },
        ],
        results: [
          { issueKey: 'A-1', prUrl: 'https://pr/1' },
          { issueKey: 'A-2', error: 'compile error' },
        ],
      }),
    ];
    const rows = computeDetailRows(jobs);
    expect(rows).toHaveLength(2);
    expect(rows[0].issueKey).toBe('A-1');
    expect(rows[0].summary).toBe('Fix bug');
    expect(rows[0].success).toBe(true);
    expect(rows[1].issueKey).toBe('A-2');
    expect(rows[1].success).toBe(false);
    expect(rows[1].error).toBe('compile error');
  });
});
