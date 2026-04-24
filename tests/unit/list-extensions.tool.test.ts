import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ListExtensionsTool } from '../../src/tools/list-extensions.tool.js';
import type { IDatabaseDriver } from '../../src/database/interfaces/database-driver.js';

describe('ListExtensionsTool', () => {
  let tool: ListExtensionsTool;
  let mockDriver: IDatabaseDriver;

  beforeEach(() => {
    mockDriver = {
      dialect: 'postgresql',
      executeQuery: vi.fn(),
    } as any;

    const mockConnectionManager = {
      getDriver: vi.fn().mockResolvedValue(mockDriver),
    } as any;

    tool = new ListExtensionsTool(mockConnectionManager);
  });

  describe('Tool Properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('list-extensions');
    });

    it('should have descriptive description', () => {
      expect(tool.description).toContain('extensions');
      expect(tool.description).toContain('PostgreSQL');
    });

    it('should have proper input schema', () => {
      const definition = tool.getDefinition();
      expect(definition.inputSchema.properties).toHaveProperty('profile');
      expect(definition.inputSchema.properties).toHaveProperty('installedOnly');
      expect(definition.inputSchema.required).toContain('profile');
      expect(definition.inputSchema.required).not.toContain('installedOnly');
    });
  });

  describe('execute', () => {
    it('should return both installed and available extensions by default', async () => {
      const mockExtensions = [
        { name: 'plpgsql', defaultVersion: '1.0', installedVersion: '1.0', schema: 'pg_catalog', isInstalled: true, comment: 'PL/pgSQL' },
        { name: 'uuid-ossp', defaultVersion: '1.1', installedVersion: '1.1', schema: 'public', isInstalled: true, comment: 'UUID functions' },
        { name: 'postgis', defaultVersion: '3.3.2', installedVersion: null, schema: '', isInstalled: false, comment: 'PostGIS' },
      ];

      vi.mocked(mockDriver.executeQuery).mockResolvedValue({
        rows: mockExtensions,
        rowCount: 3,
        columns: ['name', 'defaultVersion', 'installedVersion', 'schema', 'isInstalled', 'comment'],
      });

      const result = await tool.execute({ profile: 'test' });

      expect(result.success).toBe(true);
      expect(result.data.extensions).toHaveLength(3);
      expect(result.data.summary.installed).toBe(2);
      expect(result.data.summary.available).toBe(1);
      expect(result.data.summary.total).toBe(3);
    });

    it('should filter to installed only when requested', async () => {
      vi.mocked(mockDriver.executeQuery).mockResolvedValue({
        rows: [{ name: 'plpgsql', installedVersion: '1.0', schema: 'pg_catalog', isInstalled: true, comment: 'PL/pgSQL' }],
        rowCount: 1,
        columns: ['name', 'installedVersion', 'schema', 'isInstalled', 'comment'],
      });

      const result = await tool.execute({ profile: 'test', installedOnly: true });

      expect(result.success).toBe(true);
      const callArgs = vi.mocked(mockDriver.executeQuery).mock.calls[0];
      expect(callArgs[0]).toContain('pg_extension');
      expect(callArgs[0]).not.toContain('pg_available_extensions');
    });

    it('should handle empty result', async () => {
      vi.mocked(mockDriver.executeQuery).mockResolvedValue({
        rows: [],
        rowCount: 0,
        columns: [],
      });

      const result = await tool.execute({ profile: 'test' });

      expect(result.success).toBe(true);
      expect(result.data.extensions).toHaveLength(0);
      expect(result.data.summary.installed).toBe(0);
      expect(result.data.summary.available).toBe(0);
    });

    it('should reject non-PostgreSQL profiles', async () => {
      (mockDriver as any).dialect = 'sqlserver';

      await expect(
        tool.execute({ profile: 'test' })
      ).rejects.toThrow('only available for PostgreSQL');
    });

    it('should propagate driver errors', async () => {
      vi.mocked(mockDriver.executeQuery).mockRejectedValue(new Error('No permission'));

      await expect(
        tool.execute({ profile: 'test' })
      ).rejects.toThrow('No permission');
    });
  });
});
