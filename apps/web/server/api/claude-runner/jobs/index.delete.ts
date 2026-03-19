// apps/web/server/api/claude-runner/jobs/index.delete.ts
import prisma from '../../../utils/prisma';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const type = (query.type as string) || undefined;

  await prisma.job.deleteMany(type ? { where: { type } } : undefined);
  return { ok: true };
});
