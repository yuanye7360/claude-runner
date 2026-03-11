// apps/web/server/utils/jobStore.ts
import prisma from './prisma';

export interface RunResult {
  issueKey: string;
  output?: string;
  error?: string;
  prUrl?: string;
}

export type JobEvent =
  | { data: string; type: 'chunk' }
  | { issueKey: string; label: string; phase: number; type: 'phase' }
  | { type: 'eof' };

export interface Job {
  id: string;
  status: 'cancelled' | 'done' | 'error' | 'running';
  startedAt: number;
  issues: { key: string; summary: string }[];
  events: JobEvent[];
  results: RunResult[];
  kill?: () => void;
  subscribers: Set<(event: JobEvent) => void>;
}

const jobs = new Map<string, Job>();

export function createJob(
  id: string,
  issues: { key: string; summary: string }[],
): Job {
  const job: Job = {
    id,
    status: 'running',
    startedAt: Date.now(),
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

function broadcast(job: Job, event: JobEvent) {
  job.events.push(event);
  for (const sub of job.subscribers) sub(event);
}

export function pushChunk(job: Job, data: string) {
  broadcast(job, { type: 'chunk', data });
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
