import { getGhUser } from '../../utils/pr-monitor';
import prisma from '../../utils/prisma';

export default defineEventHandler(async () => {
  const ghUser = getGhUser();
  const where = ghUser
    ? { status: 'unread' as const, NOT: { author: ghUser } }
    : { status: 'unread' as const };

  const unreadCount = await prisma.prReviewComment.count({ where });

  const unreadByPr = await prisma.prReviewComment.groupBy({
    by: ['prUrl', 'prNumber', 'repo'],
    where,
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
