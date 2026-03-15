import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import matter from 'gray-matter';

import { resolveInjectTarget } from '../../utils/skill-inject';
import { getProjectSkillsDir } from '../../utils/skills-dir';

export type SkillSource = 'external' | 'project';

export interface SkillInfo {
  name: string;
  description: string;
  source: SkillSource;
  inject: string;
}

function scanSkillDir(dir: string, source: SkillSource): SkillInfo[] {
  if (!existsSync(dir)) return [];
  const skills: SkillInfo[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Follow symlinks: isDirectory() is false for symlinks, so stat the resolved path
    const entryPath = join(dir, entry.name);
    if (
      !entry.isDirectory() &&
      !(entry.isSymbolicLink() && statSync(entryPath).isDirectory())
    )
      continue;
    const skillFile = join(dir, entry.name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    try {
      const raw = readFileSync(skillFile, 'utf8');
      const { data } = matter(raw);
      skills.push({
        name: (data.name as string) || entry.name,
        description: (data.description as string) || '',
        source,
        inject: resolveInjectTarget(
          (data.name as string) || entry.name,
          data.inject as string,
        ),
      });
    } catch {
      // skip malformed skills
    }
  }
  return skills;
}

export default defineEventHandler(() => {
  // Project skills: .claude/skills/ under project root
  const projectDir = getProjectSkillsDir();
  // Global skills: ~/.claude/skills/ (shared with Claude Code CLI)
  const externalDir = join(homedir(), '.claude', 'skills');

  const project = scanSkillDir(projectDir, 'project');
  const external = scanSkillDir(externalDir, 'external');

  // Deduplicate: project > external
  const seen = new Set(project.map((s) => s.name));
  const deduped = external.filter((s) => !seen.has(s.name));

  return [...project, ...deduped];
});
