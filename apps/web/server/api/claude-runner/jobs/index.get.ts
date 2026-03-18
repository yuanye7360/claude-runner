// apps/web/server/api/claude-runner/jobs/index.get.ts
import prisma from '../../../utils/prisma';

const PR_URL_RE = /PR:\s*(https:\/\/github\.com\/\S+\/pull\/\d+)/i;

function extractPrUrl(result: {
  error: null | string;
  output: null | string;
  prUrl: null | string;
}) {
  if (result.prUrl) return result.prUrl;
  const match = PR_URL_RE.exec(result.output ?? '');
  return match ? match[1] : null;
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const limit = Math.min(Number(query.limit) || 50, 500);
  const type = (query.type as string) || undefined;

  const jobs = await prisma.job.findMany({
    where: type ? { type } : undefined,
    orderBy: { startedAt: 'desc' },
    take: limit,
    include: { issues: true, results: true },
  });

  return jobs.map((job) => ({
    id: job.id,
    type: job.type,
    trigger: job.trigger,
    status: job.status,
    timestamp: Number(job.startedAt),
    durationSecs:
      job.finishedAt === null
        ? undefined
        : Math.floor((Number(job.finishedAt) - Number(job.startedAt)) / 1000),
    issues: job.issues.map((i) => ({ key: i.key, summary: i.summary })),
    results: job.results.map((r) => {
      const prUrl = extractPrUrl(r);
      return {
        issueKey: r.issueKey,
        ...(r.output === null ? {} : { output: r.output }),
        ...(r.error === null ? {} : { error: r.error }),
        ...(prUrl === null ? {} : { prUrl }),
      };
    }),
    log: job.log || undefined,
  }));
});
