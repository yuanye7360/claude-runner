import prisma from '../../utils/prisma';

export default defineEventHandler(async () => {
  const stats = await prisma.skillUsage.findMany({
    orderBy: { triggerCount: 'desc' },
  });
  return stats;
});
