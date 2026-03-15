import type { HistoryEntry } from '~/composables/useRunnerJob';
import type { AnalysisResult } from '~/composables/useTaskAnalyzer';

import type { Ref } from 'vue';

import { useRunnerJob } from '~/composables/useRunnerJob';
import { useTaskAnalyzer } from '~/composables/useTaskAnalyzer';

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  description?: string;
  url?: string;
  labels?: string[];
}

export const STATUS_COLOR: Record<string, 'info' | 'neutral' | 'success'> = {
  'To Do': 'neutral',
  'In Progress': 'info',
  Done: 'success',
};

export function useJiraRunner(options: {
  enabledSkillNames: Ref<string[]>;
  jiraHeaders: () => Record<string, string>;
  mode: Ref<'normal' | 'smart'>;
  onPrCreated?: (prUrls: string[]) => void;
}) {
  const history = ref<HistoryEntry[]>([]);
  const rowExpanded = ref(false);

  // PRs created by last Claude Runner run (for auto-chain)
  const createdPrUrls = ref<string[]>([]);

  // Per-feature right panel tab
  const rightTab = ref<'history' | 'progress'>('progress');

  const analyzer = useTaskAnalyzer();

  const cr = useRunnerJob({
    storageKey: 'cr-active-jobId',
    apiBase: '/api/claude-runner',
    onComplete: (_jobId, job) => {
      loadHistory();
      // Extract PR URLs from results for auto-chain
      const prUrls = job.results
        .map((r) => r.prUrl)
        .filter((u): u is string => !!u);
      if (prUrls.length > 0) {
        createdPrUrls.value = prUrls;
        options.onPrCreated?.(prUrls);
      }
    },
  });

  async function loadHistory() {
    try {
      history.value = await $fetch<HistoryEntry[]>(
        '/api/claude-runner/jobs?type=claude-runner',
      );
    } catch (error) {
      console.error('Failed to load CR history:', error);
    }
  }

  async function clearHistory() {
    await $fetch('/api/claude-runner/jobs?type=claude-runner', {
      method: 'DELETE',
    });
    history.value = [];
  }

  // ── Jira Issues ──
  const issues = ref<JiraIssue[]>([]);
  const selected = ref<Set<string>>(new Set());
  const loading = ref(true);
  const loadError = ref('');

  const starting = ref(false);
  const selectedCount = computed(() => selected.value.size);
  const allChecked = computed(
    () =>
      issues.value.length > 0 && selected.value.size === issues.value.length,
  );
  const indeterminate = computed(
    () => selected.value.size > 0 && selected.value.size < issues.value.length,
  );

  async function loadIssues() {
    const headers = options.jiraHeaders();
    if (!headers['x-jira-base-url']) {
      issues.value = [];
      loading.value = false;
      return;
    }
    loading.value = true;
    loadError.value = '';
    try {
      const data = await $fetch<JiraIssue[]>('/api/claude-runner/issues', {
        headers,
      });
      issues.value = Array.isArray(data) ? data : [];
    } catch (error) {
      loadError.value = (error as Error).message;
    } finally {
      loading.value = false;
    }
  }

  function toggleIssue(key: string) {
    if (cr.isRunning.value) return;
    const next = new Set(selected.value);
    next.has(key) ? next.delete(key) : next.add(key);
    selected.value = next;
  }

  function toggleAllIssues() {
    if (cr.isRunning.value) return;
    selected.value =
      selected.value.size === issues.value.length
        ? new Set()
        : new Set(issues.value.map((i) => i.key));
  }

  async function analyzeThenRun() {
    const picked = issues.value.filter((i) => selected.value.has(i.key));
    if (picked.length === 0 || cr.isRunning.value || starting.value) return;

    starting.value = true;
    try {
      // Analyze first issue as representative
      const first = picked[0];
      if (!first) return;
      const result = await analyzer.analyze(first, options.mode.value);

      if (!result || analyzer.analysisFailed.value) {
        // Fallback: run directly
        await runClaude();
        return;
      }

      if (analyzer.needsInput.value) {
        // Show questions UI, don't execute yet
        return;
      }

      // Auto-proceed
      await runClaudeWithAnalysis(picked, result);
    } finally {
      starting.value = false;
    }
  }

  async function runClaudeWithAnalysis(
    picked: JiraIssue[],
    analysis: AnalysisResult,
  ) {
    if (picked.length === 0 || cr.isRunning.value) return;
    rightTab.value = 'progress';
    try {
      const { jobId, jobIssues } = await $fetch<{
        jobId: string;
        jobIssues: { key: string; summary: string }[];
      }>('/api/claude-runner/run', {
        method: 'POST',
        headers: options.jiraHeaders(),
        body: {
          issues: picked,
          mode: options.mode.value,
          enabledSkills: options.enabledSkillNames.value,
          analysisResult: analysis,
        },
      });
      rowExpanded.value = true;
      // Generate phase labels from analysis
      const phaseLabels =
        analysis.repos.length > 0
          ? [
              ...(analysis.suggestedWorkflow === 'superpowers-full'
                ? [
                    { label: '需求分析' },
                    { label: '制定计划' },
                    { label: '建立分支' },
                  ]
                : [{ label: '分析 & 建立分支' }]),
              ...analysis.repos.map((r) => ({
                label: `${r.path.split('/').pop()} 实现`,
              })),
              { label: '建立 PR' },
            ]
          : undefined;

      cr.startJob(jobId, jobIssues, phaseLabels);
      analyzer.reset();
    } catch (error) {
      console.error('Failed to start Claude Runner:', error);
    }
  }

  async function runClaude() {
    const picked = issues.value.filter((i) => selected.value.has(i.key));
    if (picked.length === 0 || cr.isRunning.value) return;
    rightTab.value = 'progress';
    try {
      const { jobId, jobIssues } = await $fetch<{
        jobId: string;
        jobIssues: { key: string; summary: string }[];
      }>('/api/claude-runner/run', {
        method: 'POST',
        headers: options.jiraHeaders(),
        body: {
          issues: picked,
          mode: options.mode.value,
          enabledSkills: options.enabledSkillNames.value,
        },
      });
      rowExpanded.value = true;
      cr.startJob(jobId, jobIssues);
    } catch (error) {
      console.error('Failed to start Claude Runner:', error);
    }
  }

  function jiraUrl(key: string): null | string {
    const found = issues.value.find((i) => i.key === key);
    return found?.url ?? null;
  }

  return {
    issues,
    selected,
    loading,
    loadError,
    starting,
    history,
    rowExpanded,
    createdPrUrls,
    rightTab,
    selectedCount,
    allChecked,
    indeterminate,
    loadIssues,
    toggleIssue,
    toggleAllIssues,
    analyzeThenRun,
    runClaude,
    runClaudeWithAnalysis,
    loadHistory,
    clearHistory,
    jiraUrl,
    cr,
    analyzer,
  };
}
