// apps/web/server/utils/__tests__/app-settings.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSetting, setSetting } from '../app-settings';

const mockPrisma = vi.hoisted(() => ({
  appSetting: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock('../prisma', () => ({ default: mockPrisma }));

describe('app-settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSetting', () => {
    it('returns value when setting exists', async () => {
      mockPrisma.appSetting.findUnique.mockResolvedValue({
        key: 'github.org',
        value: 'kkday-it',
      });
      const result = await getSetting('github.org');
      expect(result).toBe('kkday-it');
      expect(mockPrisma.appSetting.findUnique).toHaveBeenCalledWith({
        where: { key: 'github.org' },
      });
    });

    it('returns null when setting does not exist', async () => {
      mockPrisma.appSetting.findUnique.mockResolvedValue(null);
      const result = await getSetting('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('setSetting', () => {
    it('upserts the setting', async () => {
      mockPrisma.appSetting.upsert.mockResolvedValue({
        key: 'github.org',
        value: 'new-org',
      });
      await setSetting('github.org', 'new-org');
      expect(mockPrisma.appSetting.upsert).toHaveBeenCalledWith({
        where: { key: 'github.org' },
        update: { value: 'new-org' },
        create: { key: 'github.org', value: 'new-org' },
      });
    });
  });

  describe('getAllSettings', () => {
    it('returns all settings as a Record', async () => {
      mockPrisma.appSetting.findMany.mockResolvedValue([
        { key: 'github.org', value: 'kkday-it' },
        { key: 'foo', value: 'bar' },
      ]);
      const { getAllSettings } = await import('../app-settings');
      const result = await getAllSettings();
      expect(result).toEqual({ 'github.org': 'kkday-it', foo: 'bar' });
    });
  });
});
