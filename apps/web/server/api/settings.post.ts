import { setSetting } from '../utils/workspaceConfig';

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, string>>(event);
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, message: 'Body must be an object' });
  }

  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') {
      await setSetting(key, value);
    }
  }

  return { ok: true };
});
