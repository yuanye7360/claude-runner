import { setSetting } from '../../utils/app-settings';

const ALLOWED_KEYS = new Set<string>([
  'jira-auto-run-enabled',
  'jira-auto-run-interval',
  'jira-creds-api-token',
  'jira-creds-base-url',
  'jira-creds-email',
  'jira-creds-labels',
]);

export default defineEventHandler(async (event) => {
  const { key, value } = await readBody<{ key: string; value: string }>(event);

  if (!key || typeof value !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'Missing required fields: key, value',
    });
  }

  if (!ALLOWED_KEYS.has(key)) {
    throw createError({
      statusCode: 400,
      message: `Unknown setting key: ${key}`,
    });
  }

  await setSetting(key, value);
  return { key, value };
});
