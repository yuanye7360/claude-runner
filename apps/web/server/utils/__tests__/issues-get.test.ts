import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock jira-client
const mockSearchJiraIssues = vi.fn();
vi.mock('../../utils/jira-client', () => ({
  searchJiraIssues: (...args: unknown[]) => mockSearchJiraIssues(...args),
}));

// Mock nitro auto-imports
vi.stubGlobal(
  'defineEventHandler',
  (fn: (...args: unknown[]) => unknown) => fn,
);
vi.stubGlobal('getQuery', vi.fn());
vi.stubGlobal('getHeader', vi.fn());
vi.stubGlobal('createError', (opts: { message: string; statusCode: number }) =>
  Object.assign(new Error(opts.message), { statusCode: opts.statusCode }),
);

function mockEvent(
  headers: Record<string, string> = {},
  query: Record<string, string> = {},
) {
  const getQueryStub = vi.mocked((globalThis as any).getQuery);
  getQueryStub.mockReturnValue(query);
  const getHeaderStub = vi.mocked((globalThis as any).getHeader);
  getHeaderStub.mockImplementation(
    (_event: unknown, name: string) => headers[name] ?? undefined,
  );
  return {} as any;
}

describe('issues.get handler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('uses labels = "claude" in default JQL when no jql param provided', async () => {
    const event = mockEvent({
      'x-jira-base-url': 'https://test.atlassian.net',
      'x-jira-email': 'test@test.com',
      'x-jira-api-token': 'test-token',
    });

    mockSearchJiraIssues.mockResolvedValue({
      issues: [
        { key: 'TEST-1', summary: 'Test', labels: ['claude'], status: 'To Do' },
      ],
      total: 1,
    });

    const mod = await import('../../api/claude-runner/issues.get');
    await mod.default(event);

    expect(mockSearchJiraIssues).toHaveBeenCalledTimes(1);
    const [creds, opts] = mockSearchJiraIssues.mock.calls[0];
    expect(creds.baseUrl).toBe('https://test.atlassian.net');
    expect(opts.jql).toBe(
      'labels = "claude" AND statusCategory != "Done" ORDER BY updated DESC',
    );
  });

  it('returns empty array when no JIRA credentials in headers', async () => {
    const event = mockEvent();

    const mod = await import('../../api/claude-runner/issues.get');
    const result = await mod.default(event);

    expect(result).toEqual([]);
    expect(mockSearchJiraIssues).not.toHaveBeenCalled();
  });
});
