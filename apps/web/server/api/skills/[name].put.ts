import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import matter from 'gray-matter';

import { getProjectSkillsDir } from '../../utils/skills-dir';

interface UpdateSkillRequest {
  description?: string;
  content?: string;
  inject?: string;
}

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name');
  if (!name) {
    throw createError({ statusCode: 400, message: 'Skill name is required' });
  }

  const body = await readBody<UpdateSkillRequest>(event);
  if (!body.content && !body.description && !body.inject) {
    throw createError({
      statusCode: 400,
      message: 'At least one of content, description, or inject is required',
    });
  }

  const projectDir = getProjectSkillsDir();
  const externalDir = join(homedir(), '.claude', 'skills');

  // Find the skill file — project > external
  let skillDir: null | string = null;
  let source: 'external' | 'project' = 'project';

  for (const [dir, src] of [
    [projectDir, 'project'],
    [externalDir, 'external'],
  ] as const) {
    if (existsSync(join(dir, name, 'SKILL.md'))) {
      skillDir = join(dir, name);
      source = src;
      break;
    }
  }

  // If skill doesn't exist yet, create in project dir
  if (!skillDir) {
    skillDir = join(projectDir, name);
    source = 'project';
  }

  // Read existing frontmatter if file exists
  const skillFile = join(skillDir, 'SKILL.md');
  let existingDescription = name;
  let existingContent = '';
  let existingInject = 'context';

  if (existsSync(skillFile)) {
    const raw = readFileSync(skillFile, 'utf8');
    const parsed = matter(raw);
    existingDescription = (parsed.data.description as string) || name;
    existingContent = parsed.content.trim();
    existingInject = (parsed.data.inject as string) || 'context';
  }

  const finalDescription = body.description ?? existingDescription;
  const finalContent = body.content ?? existingContent;
  const finalInject = body.inject ?? existingInject;

  const markdown = `---
name: ${name}
description: ${finalDescription}
inject: ${finalInject}
---

${finalContent.trim()}
`;

  mkdirSync(skillDir, { recursive: true });
  writeFileSync(skillFile, markdown, 'utf8');

  return { name, source, updated: true };
});
