import type { ComputedRef, Ref } from 'vue';

import type { HistoryEntry } from './useRunnerJob';

// ── Types ──

export interface DateRange {
  start: number;
  end: number;
}

export interface Kpi {
  totalRuns: number;
  successCount: number;
  failedCount: number;
  cancelledCount: number;
  issuesProcessed: number;
  prCreated: number;
  successRate: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
}

export interface ChartData {
  labels: string[];
  success: number[];
  failed: number[];
  cancelled: number[];
  successRate: number[];
}

export interface DetailRow {
  jobId: string;
  timestamp: number;
  issueKey: string;
  summary: string;
  success: boolean;
  prUrl?: string;
  error?: string;
  durationSecs?: number;
}

export type Granularity = 'daily' | 'weekly';

// ── Pure computation functions (exported for testing) ──

export function filterByDateRange(
  jobs: HistoryEntry[],
  range: DateRange | null,
): HistoryEntry[] {
  if (!range) return jobs;
  return jobs.filter(
    (j) => j.timestamp >= range.start && j.timestamp < range.end,
  );
}

export function computeKpi(jobs: HistoryEntry[]): Kpi {
  const totalRuns = jobs.length;
  const successCount = jobs.filter((j) => j.status === 'done').length;
  const failedCount = jobs.filter((j) => j.status === 'error').length;
  const cancelledCount = jobs.filter((j) => j.status === 'cancelled').length;

  const nonCancelled = jobs.filter((j) => j.status !== 'cancelled');
  const allResults = nonCancelled.flatMap((j) => j.results);
  const issuesProcessed = allResults.length;
  const prCreated = allResults.filter((r) => r.prUrl).length;
  const successResults = allResults.filter((r) => !r.error).length;
  const successRate =
    issuesProcessed > 0 ? (successResults / issuesProcessed) * 100 : 0;

  const durations = jobs
    .map((j) => j.durationSecs)
    .filter((d): d is number => d !== undefined);
  const avgDuration =
    durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;
  const minDuration = durations.length > 0 ? Math.min(...durations) : 0;
  const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;

  return {
    totalRuns,
    successCount,
    failedCount,
    cancelledCount,
    issuesProcessed,
    prCreated,
    successRate,
    avgDuration,
    minDuration,
    maxDuration,
  };
}

function dateKey(ts: number, granularity: Granularity): string {
  const d = new Date(ts);
  if (granularity === 'weekly') {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    return `${monday.getMonth() + 1}/${monday.getDate()}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function computeChartData(
  jobs: HistoryEntry[],
  granularity: Granularity,
): ChartData {
  const groups = new Map<
    string,
    { cancelled: number; failed: number; success: number }
  >();

  const sorted = [...jobs].toSorted((a, b) => a.timestamp - b.timestamp);

  for (const job of sorted) {
    const key = dateKey(job.timestamp, granularity);
    if (!groups.has(key)) {
      groups.set(key, { success: 0, failed: 0, cancelled: 0 });
    }
    const g = groups.get(key) ?? { success: 0, failed: 0, cancelled: 0 };
    switch (job.status) {
      case 'cancelled': {
        g.cancelled++;
        break;
      }
      case 'done': {
        g.success++;
        break;
      }
      case 'error': {
        g.failed++;
        break;
      }
    }
  }

  const labels = [...groups.keys()];
  const success = labels.map((l) => (groups.get(l) ?? { success: 0 }).success);
  const failed = labels.map((l) => (groups.get(l) ?? { failed: 0 }).failed);
  const cancelled = labels.map(
    (l) => (groups.get(l) ?? { cancelled: 0 }).cancelled,
  );
  // Compute result-level success rate per date bucket (consistent with KPI)
  const resultGroups = new Map<
    string,
    { successResults: number; totalResults: number }
  >();
  for (const job of sorted) {
    if (job.status === 'cancelled') continue;
    const key = dateKey(job.timestamp, granularity);
    if (!resultGroups.has(key)) {
      resultGroups.set(key, { successResults: 0, totalResults: 0 });
    }
    const rg = resultGroups.get(key) ?? { successResults: 0, totalResults: 0 };
    for (const r of job.results) {
      rg.totalResults++;
      if (!r.error) rg.successResults++;
    }
  }
  const successRate = labels.map((l) => {
    const rg = resultGroups.get(l);
    if (!rg || rg.totalResults === 0) return 0;
    return (rg.successResults / rg.totalResults) * 100;
  });

  return { labels, success, failed, cancelled, successRate };
}

export function computeDetailRows(jobs: HistoryEntry[]): DetailRow[] {
  const rows: DetailRow[] = [];
  for (const job of jobs) {
    for (const result of job.results) {
      const issue = job.issues.find((i) => i.key === result.issueKey);
      rows.push({
        jobId: job.id,
        timestamp: job.timestamp,
        issueKey: result.issueKey,
        summary: issue?.summary ?? '',
        success: !result.error,
        prUrl: result.prUrl,
        error: result.error,
        durationSecs: job.durationSecs,
      });
    }
  }
  return rows;
}

// ── Composable ──

export type PresetRange = 'all' | 'month' | 'today' | 'week';

function getPresetRange(preset: PresetRange): DateRange | null {
  if (preset === 'all') return null;
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (preset === 'today') {
    return { start: start.getTime(), end: now.getTime() + 1 };
  }
  if (preset === 'week') {
    const day = start.getDay();
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
    return { start: start.getTime(), end: now.getTime() + 1 };
  }
  if (preset === 'month') {
    start.setDate(1);
    return { start: start.getTime(), end: now.getTime() + 1 };
  }
  return null;
}

export function useDashboard(jobs: Ref<HistoryEntry[]>) {
  const preset = ref<PresetRange>('all');
  const customRange = ref<DateRange | null>(null);

  const dateRange: ComputedRef<DateRange | null> = computed(
    () => customRange.value ?? getPresetRange(preset.value),
  );

  const filtered = computed(() =>
    filterByDateRange(jobs.value, dateRange.value),
  );

  const kpi = computed(() => computeKpi(filtered.value));

  const granularity = computed<Granularity>(() => {
    const range = dateRange.value;
    if (!range) return 'weekly';
    const days = (range.end - range.start) / 86_400_000;
    return days <= 30 ? 'daily' : 'weekly';
  });

  const chartData = computed(() =>
    computeChartData(filtered.value, granularity.value),
  );

  const detailRows = computed(() => computeDetailRows(filtered.value));

  function setPreset(p: PresetRange) {
    preset.value = p;
    customRange.value = null;
  }

  function setCustomRange(start: number, end: number) {
    customRange.value = { start, end };
  }

  return {
    preset,
    customRange,
    dateRange,
    filtered,
    kpi,
    granularity,
    chartData,
    detailRows,
    setPreset,
    setCustomRange,
  };
}
