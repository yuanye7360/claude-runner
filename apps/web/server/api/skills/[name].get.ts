import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import matter from 'gray-matter';

import { resolveInjectTarget } from '../../utils/skill-inject';
import { getProjectSkillsDir } from '../../utils/skills-dir';

export default defineEventHandler((event) => {
  const name = getRouterParam(event, 'name');
  if (!name) {
    throw createError({ statusCode: 400, message: 'Skill name is required' });
  }

  const projectDir = getProjectSkillsDir();
  const externalDir = join(homedir(), '.claude', 'skills');

  const allDirs: Array<{
    dir: string;
    source: 'external' | 'project';
  }> = [
    { dir: projectDir, source: 'project' },
    { dir: externalDir, source: 'external' },
  ];
  for (const { dir, source } of allDirs) {
    const file = join(dir, name, 'SKILL.md');
    if (existsSync(file)) {
      const raw = readFileSync(file, 'utf8');
      const { data, content } = matter(raw);
      return {
        name: (data.name as string) || name,
        description: (data.description as string) || '',
        content: content.trim(),
        source,
        inject: resolveInjectTarget(name, data.inject as string),
      };
    }
  }

  throw createError({ statusCode: 404, message: `Skill "${name}" not found` });
});
