// apps/web/server/api/claude-runner/jobs/[id]/stream.get.ts
import type { JobEvent } from '../../../../utils/jobStore';

import { getJob } from '../../../../utils/jobStore';

async function emitEvent(
  stream: ReturnType<typeof createEventStream>,
  event: JobEvent,
) {
  switch (event.type) {
    case 'chunk': {
      await (event.issueKey
        ? stream.push({
            data: JSON.stringify({
              text: event.data,
              issueKey: event.issueKey,
            }),
          })
        : stream.push({ data: event.data }));

      break;
    }
    case 'eof': {
      await stream.push({ event: 'eof', data: '' });
      await stream.close();

      break;
    }
    case 'heartbeat': {
      await stream.push({
        event: 'heartbeat',
        data: JSON.stringify({ idleSecs: event.idleSecs }),
      });

      break;
    }
    case 'phase': {
      await stream.push({
        event: 'phase',
        data: JSON.stringify({
          phase: event.phase,
          label: event.label,
          issueKey: event.issueKey,
        }),
      });

      break;
    }
    // No default
  }
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? '';
  const job = getJob(id);
  if (!job) throw createError({ statusCode: 404, message: 'Job not found' });

  const eventStream = createEventStream(event);

  // Snapshot events BEFORE subscribing to avoid duplicates during replay
  const snapshot = [...job.events];

  let heartbeatTimer: null | ReturnType<typeof setInterval> = null;

  if (job.status === 'running') {
    const onEvent = async (e: JobEvent) => {
      await emitEvent(eventStream, e);
    };
    job.subscribers.add(onEvent);

    // Send heartbeat every 5 seconds with idle duration
    heartbeatTimer = setInterval(() => {
      if (job.status !== 'running') {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        return;
      }
      const lastActive = job.lastActivityAt || job.startedAt;
      const idleSecs = Math.floor((Date.now() - lastActive) / 1000);
      emitEvent(eventStream, { type: 'heartbeat', idleSecs }).catch(() => {
        // Client disconnected — clean up timer
        if (heartbeatTimer) clearInterval(heartbeatTimer);
      });
    }, 5000);

    eventStream.onClosed(() => {
      job.subscribers.delete(onEvent);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    });
  }

  // MUST call send() BEFORE push() — H3 drops events pushed before send()
  const sendPromise = eventStream.send();

  // Replay stored events after the stream is open
  for (const e of snapshot) {
    await emitEvent(eventStream, e);
  }

  return sendPromise;
});
