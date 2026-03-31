import { isSlackFetching, refreshSlackCache } from '../../utils/pr-inbox-cache';

export default defineEventHandler(async () => {
  if (isSlackFetching()) {
    return { ok: true, message: 'Already fetching, please wait' };
  }

  const cache = await refreshSlackCache();
  if (!cache) {
    throw createError({
      statusCode: 400,
      message:
        'PR Inbox Slack channel not configured. Go to Settings → Integrations.',
    });
  }

  return {
    ok: true,
    channel: cache.channel,
    messageCount: cache.messages.length,
    fetchedAt: cache.fetchedAt,
  };
});
