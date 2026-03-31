import prisma from './prisma';

/**
 * Record skill usage after a job completes.
 * Call this from finishJob() with the list of enabled skill names.
 */
export async function recordSkillUsage(skillNames: string[], success: boolean) {
  const now = new Date();
  for (const name of skillNames) {
    await prisma.skillUsage.upsert({
      where: { name },
      create: {
        name,
        triggerCount: 1,
        successCount: success ? 1 : 0,
        lastUsedAt: now,
      },
      update: {
        triggerCount: { increment: 1 },
        successCount: success ? { increment: 1 } : undefined,
        lastUsedAt: now,
      },
    });
  }
}
