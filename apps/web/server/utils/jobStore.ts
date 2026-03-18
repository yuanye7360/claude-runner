// apps/web/server/utils/jobStore.ts
import prisma from './prisma';

export interface RunResult {
  issueKey: string;
  output?: string;
  error?: string;
  prUrl?: string;
}

export type JobEvent =
  | { data: string; issueKey?: string; type: 'chunk' }
  | { idleSecs: number; type: 'heartbeat' }
  | { issueKey: string; label: string; phase: number; type: 'phase' }
  | { type: 'eof' };

export type JobType = 'claude-runner' | 'pr-runner';

export interface Job {
  id: string;
  type: JobType;
  status:
    | 'analysing'
    | 'awaiting_input'
    | 'cancelled'
    | 'done'
    | 'error'
    | 'executing'
    | 'fallback_executing'
    | 'planning'
    | 'running';
  startedAt: number;
  lastActivityAt: number;
  issues: { key: string; summary: string }[];
  events: JobEvent[];
  results: RunResult[];
  analysisResult?: unknown;
  kill?: () => void;
  subscribers: Set<(event: JobEvent) => void>;
}

const jobs = new Map<string, Job>();

export function createJob(
  id: string,
  issues: { key: string; summary: string }[],
  type: JobType = 'claude-runner',
): Job {
  const now = Date.now();
  const job: Job = {
    id,
    type,
    status: 'running',
    startedAt: now,
    lastActivityAt: now,
    issues,
    events: [],
    results: [],
    subscribers: new Set(),
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function broadcast(job: Job, event: JobEvent) {
  job.events.push(event);
  for (const sub of job.subscribers) sub(event);
}

export function setJobStatus(job: Job, status: Job['status']) {
  job.status = status;
  broadcast(job, { type: 'status', status } as unknown as JobEvent);
}

export function pushChunk(job: Job, data: string, issueKey?: string) {
  job.lastActivityAt = Date.now();
  broadcast(job, { type: 'chunk', data, issueKey });
}

export function pushPhase(
  job: Job,
  phase: number,
  label: string,
  issueKey: string,
) {
  broadcast(job, { type: 'phase', phase, label, issueKey });
}

export function finishJob(job: Job, results: RunResult[], persist = true) {
  job.status = 'done';
  job.results = results;
  job.kill = undefined;
  broadcast(job, { type: 'eof' });
  job.subscribers.clear();
  if (persist) {
    persistJob(job).catch((error_) =>
      console.error('[jobStore] Failed to persist job to DB:', error_),
    );
  }
}

async function persistJob(job: Job) {
  const log = job.events
    .filter((e): e is { data: string; type: 'chunk' } => e.type === 'chunk')
    .map((e) => e.data)
    .join('');
  await prisma.job.create({
    data: {
      id: job.id,
      type: job.type,
      status: job.status,
      startedAt: job.startedAt,
      finishedAt: BigInt(Date.now()),
      log,
      issues: { create: job.issues },
      results: {
        create: job.results.map((r) => ({
          issueKey: r.issueKey,
          output: r.output,
          error: r.error,
          prUrl: r.prUrl,
        })),
      },
    },
  });
}
