export interface RunResult {
  issueKey: string;
  output?: string;
  error?: string;
  prUrl?: string;
}

export interface PhaseInfo {
  phase: number;
  label: string;
  status: 'done' | 'pending' | 'running';
}

export interface ActiveJob {
  id: string;
  status: 'cancelled' | 'done' | 'error' | 'running';
  startedAt: number;
  durationSecs?: number;
  issues: { key: string; summary: string }[];
  output: string;
  results: RunResult[];
  phases: PhaseInfo[];
  currentIssueKey: string;
}

export interface JobApiResponse {
  id: string;
  status: 'cancelled' | 'done' | 'error' | 'running';
  startedAt: number;
  issues: { key: string; summary: string }[];
  output: string;
  results: RunResult[];
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  durationSecs?: number;
  issues: Array<{ key: string; summary: string }>;
  results: RunResult[];
  log?: string;
}

interface UseRunnerJobOptions {
  onComplete?: (jobId: string, job: ActiveJob) => void;
  phases?: { label: string }[];
  storageKey?: string;
}

export function useRunnerJob(options: UseRunnerJobOptions = {}) {
  const storageKey = options.storageKey ?? 'cr-active-jobId';

  const activeJob = ref<ActiveJob | null>(null);
  const elapsed = ref('');

  let sseSource: EventSource | null = null;
  let elapsedTimer: null | ReturnType<typeof setInterval> = null;

  const isRunning = computed(() => activeJob.value?.status === 'running');
  const successCount = computed(
    () => activeJob.value?.results.filter((r) => !r.error).length ?? 0,
  );
  const errorCount = computed(
    () => activeJob.value?.results.filter((r) => r.error).length ?? 0,
  );

  function startElapsedTimer(startedAt: number) {
    stopElapsedTimer();
    elapsedTimer = setInterval(() => {
      const secs = Math.floor((Date.now() - startedAt) / 1000);
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      elapsed.value = `${m}:${String(s).padStart(2, '0')}`;
    }, 1000);
  }

  function stopElapsedTimer() {
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedTimer = null;
  }

  function buildPhaseList(): PhaseInfo[] {
    const phaseLabels = options.phases ?? [
      { label: '分析 & 建立分支' },
      { label: '實作修復' },
      { label: '建立 PR' },
    ];
    return phaseLabels.map(({ label }, i) => ({
      phase: i + 1,
      label,
      status: (i === 0 ? 'running' : 'pending') as PhaseInfo['status'],
    }));
  }

  function applyPhase(phases: PhaseInfo[], phase: number) {
    for (const p of phases) {
      if (p.phase < phase) p.status = 'done';
      else if (p.phase === phase) p.status = 'running';
      else p.status = 'pending';
    }
  }

  function handleStreamEnd(jobId: string) {
    sseSource?.close();
    sseSource = null;
    stopElapsedTimer();
    if (activeJob.value?.status === 'cancelled') return;
    if (activeJob.value) {
      activeJob.value.durationSecs = Math.floor(
        (Date.now() - activeJob.value.startedAt) / 1000,
      );
    }
    $fetch<JobApiResponse>(`/api/claude-runner/jobs/${jobId}`)
      .then((data) => {
        if (activeJob.value) {
          activeJob.value.status = data.status;
          activeJob.value.output = data.output || activeJob.value.output;
          activeJob.value.results = data.results.map((r) => {
            const prMatch =
              /PR:\s*(https:\/\/github\.com\/\S+\/pull\/\d+)/i.exec(
                r.output ?? '',
              );
            return prMatch ? { ...r, prUrl: prMatch[1] } : r;
          });
          for (const p of activeJob.value.phases) p.status = 'done';
          options.onComplete?.(jobId, activeJob.value);
        }
        localStorage.removeItem(storageKey);
      })
      .catch(() => {
        if (activeJob.value) activeJob.value.status = 'error';
        localStorage.removeItem(storageKey);
      });
  }

  function connectSSE(jobId: string) {
    if (sseSource) sseSource.close();
    sseSource = new EventSource(`/api/claude-runner/jobs/${jobId}/stream`);

    sseSource.addEventListener('message', (e) => {
      if (activeJob.value) activeJob.value.output += `${e.data}\n`;
    });

    sseSource.addEventListener('phase', (e) => {
      if (!activeJob.value) return;
      const { phase, label, issueKey } = JSON.parse(e.data) as {
        issueKey: string;
        label: string;
        phase: number;
      };
      activeJob.value.currentIssueKey = issueKey;
      applyPhase(activeJob.value.phases, phase);
      const p = activeJob.value.phases.find((ph) => ph.phase === phase);
      if (p) p.label = label;
    });

    sseSource.addEventListener('eof', () => {
      handleStreamEnd(jobId);
    });

    sseSource.addEventListener('error', () => {
      sseSource?.close();
      sseSource = null;
    });
  }

  async function cancelJob() {
    if (!activeJob.value || activeJob.value.status !== 'running') return;
    try {
      await $fetch(`/api/claude-runner/jobs/${activeJob.value.id}`, {
        // @ts-expect-error: DELETE method not in generated nitro types for this route
        method: 'DELETE' as const,
      });
    } finally {
      sseSource?.close();
      sseSource = null;
      stopElapsedTimer();
      if (activeJob.value) activeJob.value.status = 'cancelled';
      localStorage.removeItem(storageKey);
    }
  }

  function startJob(jobId: string, issues: { key: string; summary: string }[]) {
    activeJob.value = {
      id: jobId,
      status: 'running',
      startedAt: Date.now(),
      issues,
      output: '',
      results: [],
      phases: buildPhaseList(),
      currentIssueKey: issues[0]?.key ?? '',
    };
    localStorage.setItem(storageKey, jobId);
    startElapsedTimer(activeJob.value.startedAt);
    connectSSE(jobId);
  }

  async function restoreJob(jobId: string) {
    try {
      const data = await $fetch<ActiveJob>(`/api/claude-runner/jobs/${jobId}`);
      activeJob.value = {
        id: data.id,
        status: data.status,
        startedAt: data.startedAt,
        issues: data.issues,
        output: data.output,
        results: data.results,
        phases: buildPhaseList(),
        currentIssueKey: data.issues[0]?.key ?? '',
      };
      if (data.status === 'running') {
        startElapsedTimer(data.startedAt);
        connectSSE(jobId);
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      localStorage.removeItem(storageKey);
    }
  }

  function cleanup() {
    sseSource?.close();
    stopElapsedTimer();
  }

  return {
    activeJob,
    elapsed,
    isRunning,
    successCount,
    errorCount,
    startJob,
    restoreJob,
    cancelJob,
    cleanup,
    storageKey,
  };
}
