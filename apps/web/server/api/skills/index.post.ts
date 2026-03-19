import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { getProjectSkillsDir } from '../../utils/skills-dir';

interface CreateSkillRequest {
  name: string;
  description: string;
  content: string;
  inject?: string;
}

export default defineEventHandler(async (event) => {
  const { name, description, content, inject } =
    await readBody<CreateSkillRequest>(event);

  if (!name || !content) {
    throw createError({
      statusCode: 400,
      message: 'name and content are required',
    });
  }

  // Sanitize name: lowercase, hyphens only
  const safeName = name
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '');
  if (!safeName) {
    throw createError({ statusCode: 400, message: 'Invalid skill name' });
  }

  // Save to project-local .claude/skills/
  const skillsRoot = getProjectSkillsDir();
  const skillDir = join(skillsRoot, safeName);
  const skillFile = join(skillDir, 'SKILL.md');

  if (existsSync(skillFile)) {
    throw createError({
      statusCode: 409,
      message: `Skill "${safeName}" already exists`,
    });
  }

  const markdown = `---
name: ${safeName}
description: ${description || safeName}
inject: ${inject || 'context'}
---

${content.trim()}
`;

  mkdirSync(skillDir, { recursive: true });
  writeFileSync(skillFile, markdown, 'utf8');

  return { name: safeName, created: true };
});
