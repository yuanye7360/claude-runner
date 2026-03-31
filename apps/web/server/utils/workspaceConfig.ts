import prisma from './prisma';

/** Get a setting from the AppSetting table */
async function getSetting(key: string): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value || '';
}

/** Set a setting in the AppSetting table */
export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

/** Get the Slack channel ID for AI notifications */
export async function getSlackNotificationChannel(): Promise<string> {
  return getSetting('slack.ai_notifications');
}

