// apps/web/server/api/claude-runner/jobs/index.delete.ts
import prisma from '../../../utils/prisma';

export default defineEventHandler(async (event) => {
  const body = await readBody<{ ids?: string[] }>(event).catch(
    () => ({}) as { ids?: string[] },
  );

  // Bulk delete by IDs
  if (body.ids?.length) {
    const result = await prisma.job.deleteMany({
      where: { id: { in: body.ids } },
    });
    return { ok: true, deleted: result.count };
  }

  // Legacy: delete by type query param
  const query = getQuery(event);
  const type = (query.type as string) || undefined;

  await prisma.job.deleteMany(type ? { where: { type } } : undefined);
  return { ok: true };
});
