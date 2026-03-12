import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface CreateSkillRequest {
  name: string;
  description: string;
  content: string;
}

export default defineEventHandler(async (event) => {
  const { name, description, content } = await readBody<CreateSkillRequest>(event);

  if (!name || !content) {
    throw createError({ statusCode: 400, message: 'name and content are required' });
  }

  // Sanitize name: lowercase, hyphens only
  const safeName = name.toLowerCase().replaceAll(/[^a-z0-9-]/g, '-').replaceAll(/-+/g, '-').replace(/^-|-$/g, '');
  if (!safeName) {
    throw createError({ statusCode: 400, message: 'Invalid skill name' });
  }

  // Save to project-local server/skills/ (not ~/.claude/skills/)
  const skillsRoot = resolve(new URL('.', import.meta.url).pathname, '../skills');
  const skillDir = join(skillsRoot, safeName);
  const skillFile = join(skillDir, 'SKILL.md');

  if (existsSync(skillFile)) {
    throw createError({ statusCode: 409, message: `Skill "${safeName}" already exists` });
  }

  const markdown = `---
name: ${safeName}
description: ${description || safeName}
---

${content.trim()}
`;

  mkdirSync(skillDir, { recursive: true });
  writeFileSync(skillFile, markdown, 'utf8');

  return { name: safeName, created: true };
});
