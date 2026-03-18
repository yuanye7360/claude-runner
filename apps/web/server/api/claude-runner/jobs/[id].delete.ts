import { finishJob, getJob } from '../../../utils/jobStore';

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') ?? '';
  const job = getJob(id);
  if (!job) throw createError({ statusCode: 404, message: 'Job not found' });
  if (job.status !== 'running')
    throw createError({ statusCode: 409, message: 'Job not running' });

  job.kill?.();
  finishJob(job, job.results, true, 'cancelled');
  return { ok: true };
});
