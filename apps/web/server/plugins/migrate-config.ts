import { dirname, resolve } from 'node:path';
import { cwd } from 'node:process';
import { fileURLToPath } from 'node:url';

import { migrateConfigYaml } from '../utils/migrate-config';

export default defineNitroPlugin(async () => {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = thisDir.includes('.output')
    ? resolve(cwd())
    : resolve(thisDir, '../../../');

  try {
    await migrateConfigYaml(projectRoot);
  } catch (error) {
    console.error('[migrate-config] Migration failed:', error);
    throw error;
  }
});
