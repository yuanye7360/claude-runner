// apps/web/server/api/claude-runner/jobs/[id]/stream.get.ts
import type { JobEvent } from '../../../../utils/jobStore';

import { getJob } from '../../../../utils/jobStore';

async function emitEvent(
  stream: ReturnType<typeof createEventStream>,
  event: JobEvent,
) {
  switch (event.type) {
    case 'chunk': {
      if (event.issueKey) {
        await stream.push({
          data: JSON.stringify({ text: event.data, issueKey: event.issueKey }),
        });
      } else {
        await stream.push({ data: event.data });
      }

      break;
    }
    case 'eof': {
      await stream.push({ event: 'eof', data: '' });
      await stream.close();

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

  if (job.status === 'running') {
    const onEvent = async (e: JobEvent) => {
      await emitEvent(eventStream, e);
    };
    job.subscribers.add(onEvent);
    eventStream.onClosed(() => {
      job.subscribers.delete(onEvent);
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
