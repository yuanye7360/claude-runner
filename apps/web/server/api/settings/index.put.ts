import { setSetting } from '../../utils/app-settings';

export default defineEventHandler(async (event) => {
  const { key, value } = await readBody<{ key: string; value: string }>(event);

  if (!key || typeof value !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'Missing required fields: key, value',
    });
  }

  await setSetting(key, value);
  return { key, value };
});
