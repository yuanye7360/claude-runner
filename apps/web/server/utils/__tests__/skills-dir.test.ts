import { describe, expect, it } from 'vitest';

describe('getProjectSkillsDir', () => {
  it('returns path ending with .claude/skills', async () => {
    const { getProjectSkillsDir } = await import('../skills-dir');
    const dir = getProjectSkillsDir();
    expect(dir).toMatch(/\.claude\/skills$/);
  });

  it('does not contain server/skills', async () => {
    const { getProjectSkillsDir } = await import('../skills-dir');
    const dir = getProjectSkillsDir();
    expect(dir).not.toContain('server/skills');
  });
});
