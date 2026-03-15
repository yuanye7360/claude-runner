import prisma from '../../utils/prisma';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const prNumber = query.prNumber ? Number(query.prNumber) : undefined;
  const repo = query.repo as string | undefined;
  const status = query.status as string | undefined;

  const where: Record<string, unknown> = {};
  if (prNumber) where.prNumber = prNumber;
  if (repo) where.repo = repo;
  if (status) where.status = status;

  return prisma.prReviewComment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
});
