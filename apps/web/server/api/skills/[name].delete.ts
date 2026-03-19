import { existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { getProjectSkillsDir } from '../../utils/skills-dir';

export default defineEventHandler((event) => {
  const name = getRouterParam(event, 'name');
  if (!name) {
    throw createError({ statusCode: 400, message: 'Skill name is required' });
  }

  const projectDir = getProjectSkillsDir();
  const externalDir = join(homedir(), '.claude', 'skills');

  // Find skill — only allow deleting project skills
  const customPath = join(projectDir, name);
  const externalPath = join(externalDir, name);

  if (existsSync(join(customPath, 'SKILL.md'))) {
    rmSync(customPath, { recursive: true });
    return { name, deleted: true };
  }

  if (existsSync(join(externalPath, 'SKILL.md'))) {
    throw createError({
      statusCode: 403,
      message: `Cannot delete external skill "${name}". Remove it from ~/.claude/skills/ manually.`,
    });
  }

  throw createError({ statusCode: 404, message: `Skill "${name}" not found` });
});
