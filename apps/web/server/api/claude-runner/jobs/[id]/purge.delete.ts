import prisma from '../../../../utils/prisma';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, message: 'Job ID is required' });
  }

  try {
    await prisma.job.delete({ where: { id } });
  } catch {
    throw createError({ statusCode: 404, message: 'Job not found' });
  }

  return { ok: true };
});
