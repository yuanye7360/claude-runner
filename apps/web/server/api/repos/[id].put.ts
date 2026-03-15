import prisma from '../../utils/prisma';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string;
  const body = await readBody(event);

  const repo = await prisma.repo.update({
    where: { id },
    data: {
      ...(body.name && { name: body.name }),
      ...(body.githubRepo && { githubRepo: body.githubRepo }),
      ...(body.label && { label: body.label }),
      ...(body.path && { path: body.path }),
    },
  });

  return repo;
});
