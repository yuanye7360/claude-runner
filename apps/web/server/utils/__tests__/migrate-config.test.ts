// apps/web/server/utils/__tests__/migrate-config.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { migrateConfigYaml } from '../migrate-config';

const mockExistsSync = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockUnlinkSync = vi.hoisted(() => vi.fn());
vi.mock('node:fs', () => ({
  existsSync: (...args: any[]) => mockExistsSync(...args),
  readFileSync: (...args: any[]) => mockReadFileSync(...args),
  unlinkSync: (...args: any[]) => mockUnlinkSync(...args),
}));

vi.mock('node:os', () => ({
  homedir: () => '/Users/testuser',
}));

const mockPrisma = vi.hoisted(() => ({
  appSetting: { upsert: vi.fn().mockResolvedValue({}) },
  repo: { upsert: vi.fn().mockResolvedValue({}) },
}));
vi.mock('../prisma', () => ({ default: mockPrisma }));

vi.mock('js-yaml', () => ({
  default: {
    load: vi.fn((content: string) => JSON.parse(content)),
  },
}));

const SAMPLE_CONFIG = JSON.stringify({
  github: { org: 'kkday-it' },
  repos: [
    {
      name: 'b2c-web',
      githubRepo: 'kkday-b2c-web',
      label: 'b2c-web',
      path: '~/KKday/kkday-b2c-web',
    },
    {
      name: 'member-ci',
      githubRepo: 'kkday-member-ci',
      label: 'member-ci',
      path: '/absolute/path',
    },
  ],
  claude: { cliPath: 'auto' },
});

describe('migrateConfigYaml', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.appSetting.upsert.mockResolvedValue({});
    mockPrisma.repo.upsert.mockResolvedValue({});
  });

  it('does nothing when config.yaml does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    await migrateConfigYaml('/project');
    expect(mockPrisma.appSetting.upsert).not.toHaveBeenCalled();
  });

  it('migrates config.yaml to DB and deletes it', async () => {
    mockExistsSync.mockImplementation((p: string) => p.endsWith('config.yaml'));
    mockReadFileSync.mockReturnValue(SAMPLE_CONFIG);

    await migrateConfigYaml('/project');

    expect(mockPrisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'github.org' },
        create: { key: 'github.org', value: 'kkday-it' },
      }),
    );

    expect(mockPrisma.repo.upsert).toHaveBeenCalledTimes(2);
    expect(mockPrisma.repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { label: 'b2c-web' },
        create: expect.objectContaining({
          path: '/Users/testuser/KKday/kkday-b2c-web',
        }),
      }),
    );

    expect(mockUnlinkSync).toHaveBeenCalledWith('/project/config.yaml');
  });

  it('merges config.local.yaml overrides before migrating', async () => {
    const localConfig = JSON.stringify({
      github: { org: 'local-org' },
      repos: [
        {
          name: 'b2c-web',
          githubRepo: 'kkday-b2c-web',
          label: 'b2c-web',
          path: '/local/path',
        },
      ],
    });
    mockExistsSync.mockImplementation(
      (p: string) =>
        p.endsWith('config.yaml') || p.endsWith('config.local.yaml'),
    );
    mockReadFileSync.mockImplementation((p: string) =>
      (p as string).endsWith('config.local.yaml') ? localConfig : SAMPLE_CONFIG,
    );

    await migrateConfigYaml('/project');

    expect(mockPrisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { key: 'github.org', value: 'local-org' },
      }),
    );

    expect(mockPrisma.repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { label: 'b2c-web' },
        create: expect.objectContaining({ path: '/local/path' }),
      }),
    );

    expect(mockUnlinkSync).toHaveBeenCalledWith('/project/config.yaml');
    expect(mockUnlinkSync).toHaveBeenCalledWith('/project/config.local.yaml');
  });

  it('does not delete config.yaml if DB write fails', async () => {
    mockExistsSync.mockImplementation((p: string) => p.endsWith('config.yaml'));
    mockReadFileSync.mockReturnValue(SAMPLE_CONFIG);
    mockPrisma.appSetting.upsert.mockRejectedValue(new Error('DB error'));

    await expect(migrateConfigYaml('/project')).rejects.toThrow('DB error');
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });
});
