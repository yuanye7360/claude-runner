import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import matter from 'gray-matter';

export interface SkillInfo {
  name: string;
  description: string;
  source: 'external' | 'internal';
}

function scanSkillDir(
  dir: string,
  source: 'external' | 'internal',
): SkillInfo[] {
  if (!existsSync(dir)) return [];
  const skills: SkillInfo[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
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
  const internalDir = resolve(
    new URL('.', import.meta.url).pathname,
    '../skills',
  );
  const externalDir = join(homedir(), '.claude', 'skills');

  const internal = scanSkillDir(internalDir, 'internal');
  const external = scanSkillDir(externalDir, 'external');

  // Deduplicate: internal wins over external with same name
  const seen = new Set(internal.map((s) => s.name));
  const merged = [...internal, ...external.filter((s) => !seen.has(s.name))];

  return merged;
});
