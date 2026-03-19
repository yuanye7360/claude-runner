import { listActiveJobs } from '../../../utils/jobStore';

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const trigger = (query.trigger as string) || undefined;

  const jobs = listActiveJobs({
    type: 'claude-runner',
    trigger: trigger as 'auto' | 'manual' | undefined,
  });

  return jobs.map((job) => ({
    id: job.id,
    trigger: job.trigger,
    status: job.status,
    startedAt: job.startedAt,
    issues: job.issues,
  }));
});
