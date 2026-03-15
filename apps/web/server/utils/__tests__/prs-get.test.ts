import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock child_process
const mockExecSync = vi.fn();
vi.mock('node:child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

// Mock nitro auto-imports
vi.stubGlobal(
  'defineEventHandler',
  (fn: (...args: unknown[]) => unknown) => fn,
);
vi.stubGlobal('createError', (opts: { message: string; statusCode: number }) =>
  Object.assign(new Error(opts.message), { statusCode: opts.statusCode }),
);

describe('prs.get handler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Need to re-import to reset module state
    vi.resetModules();
  });

  it('total PR count across all groups equals input items count', async () => {
    const mockPRs = [
      {
        createdAt: '2026-03-13T07:53:42Z',
        isDraft: false,
        number: 641,
        repository: { name: 'repo-a', nameWithOwner: 'org/repo-a' },
        title: 'PR 1',
        url: 'https://github.com/org/repo-a/pull/641',
      },
      {
        createdAt: '2026-03-13T06:08:33Z',
        isDraft: false,
        number: 10_377,
        repository: { name: 'repo-b', nameWithOwner: 'org/repo-b' },
        title: 'PR 2',
        url: 'https://github.com/org/repo-b/pull/10377',
      },
      {
        createdAt: '2026-03-13T06:07:54Z',
        isDraft: false,
        number: 12_146,
        repository: { name: 'repo-b', nameWithOwner: 'org/repo-b' },
        title: 'PR 3',
        url: 'https://github.com/org/repo-b/pull/12146',
      },
      {
        createdAt: '2026-03-13T03:14:24Z',
        isDraft: true,
        number: 100,
        repository: { name: 'repo-a', nameWithOwner: 'org/repo-a' },
        title: 'PR 4',
        url: 'https://github.com/org/repo-a/pull/100',
      },
    ];

    mockExecSync.mockReturnValue(JSON.stringify(mockPRs));

    const mod = await import('../../api/pr-runner/prs.get');
    const result = (await mod.default()) as Array<{
      prs: unknown[];
      repo: string;
    }>;

    // Total count across all groups should equal input count
    const totalCount = result.reduce((a, g) => a + g.prs.length, 0);
    expect(totalCount).toBe(mockPRs.length);

    // Verify grouping: org/repo-a should have 2, org/repo-b should have 2
    const repoA = result.find((g) => g.repo === 'org/repo-a');
    const repoB = result.find((g) => g.repo === 'org/repo-b');
    expect(repoA?.prs.length).toBe(2);
    expect(repoB?.prs.length).toBe(2);
  });

  it('gh command includes --author=@me flag', async () => {
    mockExecSync.mockReturnValue('[]');

    const mod = await import('../../api/pr-runner/prs.get');
    await mod.default();

    const command = mockExecSync.mock.calls[0][0] as string;
    expect(command).toContain('--author=@me');
  });
});
