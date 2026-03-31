import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import matter from 'gray-matter';

import { getProjectSkillsDir } from './skills-dir';

/**
 * Load a single skill's SKILL.md content by name.
 * Searches project-local skills first, then global ~/.claude/skills/.
 * Returns the markdown body (without frontmatter), or null if not found.
 */
export function loadSkill(name: string): null | string {
  const dirs = [getProjectSkillsDir(), join(homedir(), '.claude', 'skills')];
  for (const dir of dirs) {
    const file = join(dir, name, 'SKILL.md');
    if (existsSync(file)) {
      const { content } = matter(readFileSync(file, 'utf8'));
      return content.trim();
    }
  }
  return null;
}
