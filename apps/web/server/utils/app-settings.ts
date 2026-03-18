// apps/web/server/utils/app-settings.ts
import prisma from './prisma';

export async function getSetting(key: string): Promise<string | null> {
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

export async function getGitHubOrg(): Promise<string> {
  const org = await getSetting('github.org');
  if (!org) {
    throw new Error('GitHub Org 尚未設定。請到 Settings 面板設定 GitHub Org。');
  }
  return org;
}
