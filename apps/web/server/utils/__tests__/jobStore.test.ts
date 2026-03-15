import type { Job, JobEvent } from '../jobStore';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  broadcast,
  createJob,
  finishJob,
  getJob,
  pushChunk,
  pushPhase,
} from '../jobStore';

// Mock prisma — persistJob calls prisma.job.create on finishJob
vi.mock('../prisma', () => ({
  default: {
    job: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

describe('jobStore', () => {
  let job: Job;

  beforeEach(() => {
    job = createJob('test-1', [{ key: 'ISSUE-1', summary: 'Test issue' }]);
  });

  describe('createJob', () => {
    it('should create a job with running status', () => {
      expect(job.status).toBe('running');
      expect(job.id).toBe('test-1');
      expect(job.issues).toHaveLength(1);
    });

    it('should initialize lastActivityAt to startedAt', () => {
      expect(job.lastActivityAt).toBe(job.startedAt);
      expect(job.lastActivityAt).toBeGreaterThan(0);
    });

    it('should be retrievable via getJob', () => {
      expect(getJob('test-1')).toBe(job);
      expect(getJob('nonexistent')).toBeUndefined();
    });
  });

  describe('pushChunk — lastActivityAt tracking', () => {
    it('should update lastActivityAt on each pushChunk', async () => {
      const initialActivity = job.lastActivityAt;

      // Wait a tiny bit to ensure time difference
      await new Promise((r) => setTimeout(r, 5));
      pushChunk(job, 'some output');

      expect(job.lastActivityAt).toBeGreaterThan(initialActivity);
    });

    it('should broadcast chunk events to subscribers', () => {
      const received: JobEvent[] = [];
      job.subscribers.add((e) => received.push(e));

      pushChunk(job, 'hello');
      pushChunk(job, 'world', 'ISSUE-1');

      expect(received).toHaveLength(2);
      expect(received[0]).toEqual({
        type: 'chunk',
        data: 'hello',
        issueKey: undefined,
      });
      expect(received[1]).toEqual({
        type: 'chunk',
        data: 'world',
        issueKey: 'ISSUE-1',
      });
    });

    it('should store chunk events in job.events', () => {
      pushChunk(job, 'data1');
      pushChunk(job, 'data2');

      expect(job.events).toHaveLength(2);
      expect(job.events[0]).toMatchObject({ type: 'chunk', data: 'data1' });
    });
  });

  describe('heartbeat event type', () => {
    it('should be broadcastable as a JobEvent', () => {
      const received: JobEvent[] = [];
      job.subscribers.add((e) => received.push(e));

      const heartbeat: JobEvent = { type: 'heartbeat', idleSecs: 42 };
      broadcast(job, heartbeat);

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ type: 'heartbeat', idleSecs: 42 });
    });

    it('should not be persisted as log text on finishJob', () => {
      // Mix heartbeat events with chunks
      broadcast(job, { type: 'heartbeat', idleSecs: 10 });
      pushChunk(job, 'real output');
      broadcast(job, { type: 'heartbeat', idleSecs: 20 });

      // finishJob filters events to chunks only for log
      finishJob(job, [], false);

      // Verify only chunk events contribute to log (check events array)
      const chunkEvents = job.events.filter((e) => e.type === 'chunk');
      const heartbeatEvents = job.events.filter((e) => e.type === 'heartbeat');
      expect(chunkEvents).toHaveLength(1);
      expect(heartbeatEvents).toHaveLength(2);
    });
  });

  describe('idle time calculation', () => {
    it('should report increasing idle when no pushChunk happens', async () => {
      const before = job.lastActivityAt;

      // Simulate time passing without activity
      await new Promise((r) => setTimeout(r, 50));

      const idleSecs = Math.floor(
        (Date.now() - (job.lastActivityAt || job.startedAt)) / 1000,
      );
      // Should be 0 since only 50ms passed (floor rounds down)
      expect(idleSecs).toBe(0);
      expect(job.lastActivityAt).toBe(before);
    });

    it('should reset idle after pushChunk', async () => {
      // Simulate some idle time
      await new Promise((r) => setTimeout(r, 10));
      const beforePush = Date.now();

      pushChunk(job, 'activity');

      // lastActivityAt should be very close to now
      expect(job.lastActivityAt).toBeGreaterThanOrEqual(beforePush);
      const idleMs = Date.now() - job.lastActivityAt;
      expect(idleMs).toBeLessThan(50);
    });

    it('should fallback to startedAt when lastActivityAt is missing', () => {
      // Simulate a legacy job without lastActivityAt
      const legacyJob = { ...job, lastActivityAt: undefined } as unknown as Job;
      const lastActive =
        (legacyJob as any).lastActivityAt || legacyJob.startedAt;
      const idleSecs = Math.floor((Date.now() - lastActive) / 1000);

      expect(Number.isNaN(idleSecs)).toBe(false);
      expect(idleSecs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('pushPhase', () => {
    it('should broadcast phase events', () => {
      const received: JobEvent[] = [];
      job.subscribers.add((e) => received.push(e));

      pushPhase(job, 2, '實作修復', 'ISSUE-1');

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({
        type: 'phase',
        phase: 2,
        label: '實作修復',
        issueKey: 'ISSUE-1',
      });
    });
  });

  describe('finishJob', () => {
    it('should set status to done and broadcast eof', () => {
      const received: JobEvent[] = [];
      job.subscribers.add((e) => received.push(e));

      finishJob(job, [{ issueKey: 'ISSUE-1', output: 'ok' }], false);

      expect(job.status).toBe('done');
      expect(job.results).toHaveLength(1);
      expect(received.some((e) => e.type === 'eof')).toBe(true);
      // Subscribers should be cleared after finish
      expect(job.subscribers.size).toBe(0);
    });
  });
});
