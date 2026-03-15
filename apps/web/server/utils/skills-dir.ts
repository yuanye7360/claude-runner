import { resolve } from 'node:path';

/**
 * Returns the path to project-local skills directory: <project-root>/.claude/skills/
 * This file is at apps/web/server/utils/ — project root is 4 levels up.
 */
export function getProjectSkillsDir(): string {
  return resolve(
    new URL('.', import.meta.url).pathname,
    '../../../..',
    '.claude',
    'skills',
  );
}
