import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock prisma
const mockCount = vi.fn();
const mockGroupBy = vi.fn();
vi.mock('../../utils/prisma', () => ({
  default: {
    prReviewComment: {
      count: (...args: unknown[]) => mockCount(...args),
      groupBy: (...args: unknown[]) => mockGroupBy(...args),
    },
  },
}));

// Mock pr-monitor's getGhUser via a shared module mock
const mockGetGhUser = vi.fn().mockReturnValue('yuanye7360');
vi.mock('../../utils/pr-monitor', () => ({
  getGhUser: () => mockGetGhUser(),
}));

// Mock nitro auto-imports
vi.stubGlobal(
  'defineEventHandler',
  (fn: (...args: unknown[]) => unknown) => fn,
);

describe('notifications.get handler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    mockGetGhUser.mockReturnValue('yuanye7360');
    mockCount.mockResolvedValue(0);
    mockGroupBy.mockResolvedValue([]);
  });

  it('excludes current user own comments from notification count', async () => {
    mockCount.mockResolvedValue(5);
    mockGroupBy.mockResolvedValue([
      {
        prUrl: 'https://github.com/org/repo/pull/1',
        prNumber: 1,
        repo: 'org/repo',
        _count: 5,
      },
    ]);

    const mod = await import('../../api/pr-runner/notifications.get');
    await mod.default({} as any);

    // The Prisma count query should filter out the current user's comments
    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: expect.objectContaining({ author: 'yuanye7360' }),
        }),
      }),
    );
  });

  it('excludes current user from groupBy query as well', async () => {
    mockCount.mockResolvedValue(0);
    mockGroupBy.mockResolvedValue([]);

    const mod = await import('../../api/pr-runner/notifications.get');
    await mod.default({} as any);

    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: expect.objectContaining({ author: 'yuanye7360' }),
        }),
      }),
    );
  });
});
