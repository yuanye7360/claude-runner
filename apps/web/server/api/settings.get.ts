import prisma from '../utils/prisma';

export default defineEventHandler(async () => {
  const rows = await prisma.appSetting.findMany();
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
});
