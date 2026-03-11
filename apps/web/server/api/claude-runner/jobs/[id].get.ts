import { getJob } from '../../../utils/jobStore';
// apps/web/server/api/claude-runner/jobs/[id].get.ts
import prisma from '../../../utils/prisma';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? '';
  const job = getJob(id);

  if (job) {
    return {
      id: job.id,
      status: job.status,
      startedAt: job.startedAt,
      issues: job.issues,
      output: job.events
        .filter((e): e is { data: string; type: 'chunk' } => e.type === 'chunk')
        .map((e) => e.data)
        .join(''),
      results: job.results,
    };
  }

  // Fall back to DB for completed jobs (e.g. after server restart)
  const dbJob = await prisma.job.findUnique({
    where: { id },
    include: { issues: true, results: true },
  });
  if (!dbJob) throw createError({ statusCode: 404, message: 'Job not found' });

  return {
    id: dbJob.id,
    status: dbJob.status,
    startedAt: Number(dbJob.startedAt),
    issues: dbJob.issues.map((i) => ({ key: i.key, summary: i.summary })),
    output: dbJob.log,
    results: dbJob.results.map((r) => ({
      issueKey: r.issueKey,
      ...(r.output === null ? {} : { output: r.output }),
      ...(r.error === null ? {} : { error: r.error }),
      ...(r.prUrl === null ? {} : { prUrl: r.prUrl }),
    })),
  };
});
