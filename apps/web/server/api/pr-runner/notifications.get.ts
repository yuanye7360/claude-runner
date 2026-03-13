import prisma from '../../utils/prisma';

export default defineEventHandler(async () => {
  const unreadCount = await prisma.prReviewComment.count({
    where: { status: 'unread' },
  });

  const unreadByPr = await prisma.prReviewComment.groupBy({
    by: ['prUrl', 'prNumber', 'repo'],
    where: { status: 'unread' },
    _count: true,
  });

  return {
    total: unreadCount,
    byPr: unreadByPr.map((g) => ({
      prUrl: g.prUrl,
      prNumber: g.prNumber,
      repo: g.repo,
      count: g._count,
    })),
  };
});
