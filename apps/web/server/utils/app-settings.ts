// apps/web/server/utils/app-settings.ts
import prisma from './prisma';

export async function getSetting(key: string): Promise<null | string> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await prisma.appSetting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
