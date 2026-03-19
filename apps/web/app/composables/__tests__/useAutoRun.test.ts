import { ref } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock $fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('$fetch', mockFetch);

// Mock useToast
const mockToastAdd = vi.fn();
vi.stubGlobal('useToast', () => ({ add: mockToastAdd }));

let useAutoRun: typeof import('../useAutoRun').useAutoRun;

describe('useAutoRun', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    mockFetch.mockReset();
    mockToastAdd.mockReset();
    const mod = await import('../useAutoRun');
    useAutoRun = mod.useAutoRun;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createAutoRun(overrides?: { jiraConfigured?: boolean }) {
    const jiraConfig = ref({
      baseUrl: 'https://test.atlassian.net',
      email: 'test@test.com',
      apiToken: 'token123',
      labels: ['claude'],
    });
    const jiraHeaders = () => ({
      'x-jira-base-url': 'https://test.atlassian.net',
    });
    const isRunning = ref(false);
    const startJob = vi.fn();

    return useAutoRun({
      jiraConfig,
      jiraHeaders,
      jiraConfigured: ref(overrides?.jiraConfigured ?? true),
      isRunning,
      startJob,
    });
  }

  describe('loadSettings', () => {
    it('loads auto-run settings from API', async () => {
      mockFetch.mockResolvedValueOnce({ enabled: true, interval: 5 });
      const ar = createAutoRun();

      await ar.loadSettings();

      expect(mockFetch).toHaveBeenCalledWith('/api/settings/jira-auto-run');
      expect(ar.enabled.value).toBe(true);
      expect(ar.interval.value).toBe(5);
    });

    it('defaults to disabled on API error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network'));
      const ar = createAutoRun();

      await ar.loadSettings();

      expect(ar.enabled.value).toBe(false);
    });
  });

  describe('toggle', () => {
    it('syncs JIRA creds when enabling', async () => {
      mockFetch.mockResolvedValue({});
      const ar = createAutoRun();

      await ar.toggle(true);

      // First call syncs creds, second call saves setting
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/settings/jira-creds',
        expect.objectContaining({
          method: 'PUT',
        }),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/settings/jira-auto-run',
        expect.objectContaining({
          method: 'PUT',
          body: { enabled: true, interval: 2 },
        }),
      );
      expect(ar.enabled.value).toBe(true);
    });

    it('does not sync creds when disabling', async () => {
      mockFetch.mockResolvedValue({});
      const ar = createAutoRun();
      ar.enabled.value = true;

      await ar.toggle(false);

      // Only the settings call, no creds call
      const credsCalls = mockFetch.mock.calls.filter(
        (c) => c[0] === '/api/settings/jira-creds',
      );
      expect(credsCalls).toHaveLength(0);
      expect(ar.enabled.value).toBe(false);
    });

    it('shows toast on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fail'));
      const ar = createAutoRun();

      await ar.toggle(true);

      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'error' }),
      );
    });

    it('manages loading state', async () => {
      let resolve: (() => void) | undefined;
      mockFetch.mockReturnValue(
        new Promise<void>((r) => {
          resolve = r;
        }),
      );
      const ar = createAutoRun();

      const p = ar.toggle(true);
      expect(ar.loading.value).toBe(true);

      resolve?.();
      await p;
      expect(ar.loading.value).toBe(false);
    });
  });

  describe('checkJobs', () => {
    it('connects to active auto-triggered job', async () => {
      const ar = createAutoRun();
      ar.enabled.value = true;
      const mockJob = {
        id: 'job-1',
        issues: [{ key: 'KB2CW-1', summary: 'test' }],
        startedAt: Date.now(),
        trigger: 'auto',
      };
      mockFetch.mockResolvedValueOnce([mockJob]);

      const result = await ar.checkJobs();

      expect(result).toEqual(mockJob);
    });

    it('returns null when disabled', async () => {
      const ar = createAutoRun();
      ar.enabled.value = false;

      const result = await ar.checkJobs();

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns null when already running', async () => {
      const ar = createAutoRun();
      ar.enabled.value = true;

      // Simulate running state via the isRunning ref passed in
      const jiraConfig = ref({
        baseUrl: 'https://test.atlassian.net',
        email: 'test@test.com',
        apiToken: 'token123',
        labels: ['claude'],
      });
      const isRunning = ref(true);
      const ar2 = useAutoRun({
        jiraConfig,
        jiraHeaders: () => ({}),
        jiraConfigured: ref(true),
        isRunning,
        startJob: vi.fn(),
      });
      ar2.enabled.value = true;

      const result = await ar2.checkJobs();

      expect(result).toBeNull();
    });

    it('returns null when no active jobs', async () => {
      const ar = createAutoRun();
      ar.enabled.value = true;
      mockFetch.mockResolvedValueOnce([]);

      const result = await ar.checkJobs();

      expect(result).toBeNull();
    });
  });

  describe('polling', () => {
    it('starts polling when enabled', async () => {
      const ar = createAutoRun();
      mockFetch.mockResolvedValue([]);

      ar.startPoll();
      expect(ar.isPolling.value).toBe(true);

      ar.stopPoll();
      expect(ar.isPolling.value).toBe(false);
    });

    it('stopPoll clears interval', () => {
      const ar = createAutoRun();
      mockFetch.mockResolvedValue([]);

      ar.startPoll();
      ar.stopPoll();

      // After stop, advancing timers should not trigger fetch
      mockFetch.mockReset();
      vi.advanceTimersByTime(30_000);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
