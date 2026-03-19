import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('$fetch', mockFetch);

const mockToastAdd = vi.fn();
vi.stubGlobal('useToast', () => ({ add: mockToastAdd }));

let useTransitionDialog: typeof import('../useTransitionDialog').useTransitionDialog;

describe('useTransitionDialog', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockFetch.mockReset();
    mockToastAdd.mockReset();
    const mod = await import('../useTransitionDialog');
    useTransitionDialog = mod.useTransitionDialog;
  });

  function createDialog() {
    const jiraHeaders = () => ({
      'x-jira-base-url': 'https://test.atlassian.net',
    });
    return useTransitionDialog({ jiraHeaders });
  }

  describe('handleCancel', () => {
    it('shows dialog when cancelling auto-triggered job', async () => {
      const td = createDialog();
      const cancelJob = vi.fn().mockResolvedValue(undefined);

      await td.handleCancel(
        {
          trigger: 'auto',
          issues: [{ key: 'KB2CW-1@repo' }, { key: 'KB2CW-2' }],
        },
        cancelJob,
      );

      expect(cancelJob).toHaveBeenCalled();
      expect(td.showDialog.value).toBe(true);
      // Strips @repo suffix and deduplicates
      expect(td.cancelledIssueKeys.value).toEqual(['KB2CW-1', 'KB2CW-2']);
    });

    it('does not show dialog for manually triggered jobs', async () => {
      const td = createDialog();
      const cancelJob = vi.fn().mockResolvedValue(undefined);

      await td.handleCancel(
        { trigger: 'manual', issues: [{ key: 'KB2CW-1' }] },
        cancelJob,
      );

      expect(cancelJob).toHaveBeenCalled();
      expect(td.showDialog.value).toBe(false);
    });

    it('does not show dialog when no issues', async () => {
      const td = createDialog();
      const cancelJob = vi.fn().mockResolvedValue(undefined);

      await td.handleCancel({ trigger: 'auto', issues: [] }, cancelJob);

      expect(td.showDialog.value).toBe(false);
    });
  });

  describe('transitionToOpen', () => {
    it('transitions issues and shows success toast', async () => {
      mockFetch.mockResolvedValueOnce({
        results: [{ issueKey: 'KB2CW-1', ok: true }],
      });
      const td = createDialog();
      td.cancelledIssueKeys.value = ['KB2CW-1'];
      td.showDialog.value = true;

      await td.transitionToOpen();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/claude-runner/transition',
        expect.objectContaining({
          method: 'POST',
          body: { issueKeys: ['KB2CW-1'], targetStatus: 'Open' },
        }),
      );
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'success' }),
      );
      expect(td.showDialog.value).toBe(false);
      expect(td.cancelledIssueKeys.value).toEqual([]);
    });

    it('shows warning toast on partial failure', async () => {
      mockFetch.mockResolvedValueOnce({
        results: [
          { issueKey: 'KB2CW-1', ok: true },
          { issueKey: 'KB2CW-2', ok: false, error: 'no transition' },
        ],
      });
      const td = createDialog();
      td.cancelledIssueKeys.value = ['KB2CW-1', 'KB2CW-2'];
      td.showDialog.value = true;

      await td.transitionToOpen();

      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'warning' }),
      );
    });

    it('shows error toast on full failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network'));
      const td = createDialog();
      td.cancelledIssueKeys.value = ['KB2CW-1'];
      td.showDialog.value = true;

      await td.transitionToOpen();

      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'error' }),
      );
      // Should still close dialog
      expect(td.showDialog.value).toBe(false);
    });

    it('manages transitioning state', async () => {
      let resolve: ((v: unknown) => void) | undefined;
      mockFetch.mockReturnValue(
        new Promise((r) => {
          resolve = r;
        }),
      );
      const td = createDialog();
      td.cancelledIssueKeys.value = ['KB2CW-1'];

      const p = td.transitionToOpen();
      expect(td.transitioning.value).toBe(true);

      resolve?.({ results: [{ issueKey: 'KB2CW-1', ok: true }] });
      await p;
      expect(td.transitioning.value).toBe(false);
    });
  });

  describe('dismiss', () => {
    it('clears state', () => {
      const td = createDialog();
      td.showDialog.value = true;
      td.cancelledIssueKeys.value = ['KB2CW-1'];

      td.dismiss();

      expect(td.showDialog.value).toBe(false);
      expect(td.cancelledIssueKeys.value).toEqual([]);
    });
  });
});
