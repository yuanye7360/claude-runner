// apps/web/server/api/claude-runner/jobs/index.delete.ts
import prisma from '../../../utils/prisma';

export default defineEventHandler(async () => {
  await prisma.job.deleteMany();
  return { ok: true };
});
