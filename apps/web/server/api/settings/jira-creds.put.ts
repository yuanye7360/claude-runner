import { setSetting } from '../../utils/app-settings';

export default defineEventHandler(async (event) => {
  const { baseUrl, email, apiToken, labels } = await readBody<{
    apiToken: string;
    baseUrl: string;
    email: string;
    labels?: string[];
  }>(event);

  if (!baseUrl || !email || !apiToken) {
    throw createError({
      statusCode: 400,
      message: 'Missing required fields: baseUrl, email, apiToken',
    });
  }

  await Promise.all([
    setSetting('jira-creds-base-url', baseUrl),
    setSetting('jira-creds-email', email),
    setSetting('jira-creds-api-token', apiToken),
    ...(labels ? [setSetting('jira-creds-labels', labels.join(','))] : []),
  ]);

  return { ok: true };
});
