import prisma from '../../utils/prisma';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string;

  const repo = await prisma.repo.findUnique({ where: { id } });
  if (!repo) {
    throw createError({ statusCode: 404, message: 'Repo not found' });
  }

  await prisma.repo.delete({ where: { id } });
  return { success: true };
});
