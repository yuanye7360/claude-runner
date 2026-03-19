import prisma from '../../utils/prisma';

export default defineEventHandler(async (event) => {
  const { date, repoLabel } = getQuery(event) as {
    date?: string;
    repoLabel?: string;
  };

  // Default to today
  const targetDate = date ? new Date(date) : new Date();
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  const where: Record<string, unknown> = {
    reviewedAt: { gte: startOfDay, lte: endOfDay },
  };
  if (repoLabel) where.repoLabel = repoLabel;

  const reviews = await prisma.prReview.findMany({
    where,
    orderBy: { reviewedAt: 'desc' },
  });

  return reviews;
});
