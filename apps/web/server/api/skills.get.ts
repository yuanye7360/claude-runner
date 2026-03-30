import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import matter from 'gray-matter';

export type SkillSource = 'custom' | 'external' | 'project';

export interface SkillInfo {
  name: string;
  description: string;
  source: SkillSource;
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
      });
    } catch {
      // skip malformed skills
    }
  }
  return skills;
}

export default defineEventHandler(() => {
  // Custom skills: project-local (created via UI)
  const customDir = resolve(
    new URL('.', import.meta.url).pathname,
    '../skills',
  );
  // Project skills: .claude/skills/ (project-level, including Polaris symlinks)
  // Traverse up from server/api/ to find the project root with .claude/skills/
  let projectDir = '';
  let searchDir = resolve(new URL('.', import.meta.url).pathname);
  for (let i = 0; i < 10; i++) {
    const candidate = join(searchDir, '.claude', 'skills');
    if (existsSync(candidate)) {
      projectDir = candidate;
      break;
    }
    const parent = resolve(searchDir, '..');
    if (parent === searchDir) break;
    searchDir = parent;
  }
  // External skills: global ~/.claude/skills/ (shared with Claude Code CLI)
  const externalDir = join(homedir(), '.claude', 'skills');

  const custom = scanSkillDir(customDir, 'custom');
  const project = projectDir ? scanSkillDir(projectDir, 'project') : [];
  const external = scanSkillDir(externalDir, 'external');

  // Deduplicate: custom > project > external (same name)
  const seen = new Set(custom.map((s) => s.name));
  const projectFiltered = project.filter((s) => {
    if (seen.has(s.name)) return false;
    seen.add(s.name);
    return true;
  });
  const merged = [
    ...custom,
    ...projectFiltered,
    ...external.filter((s) => !seen.has(s.name)),
  ];

  return merged;
});
