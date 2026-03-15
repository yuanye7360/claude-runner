import prisma from '../../utils/prisma';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { name, githubRepo, label, path } = body;

  if (!name || !githubRepo || !label || !path) {
    throw createError({
      statusCode: 400,
      message: 'Missing required fields: name, githubRepo, label, path',
    });
  }

  const repo = await prisma.repo.create({
    data: { name, githubRepo, label, path, isCustom: true },
  });

  return repo;
});
