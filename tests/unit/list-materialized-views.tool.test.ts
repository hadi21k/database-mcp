import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ListMaterializedViewsTool } from '../../src/tools/list-materialized-views.tool.js';
import type { IDatabaseDriver } from '../../src/database/interfaces/database-driver.js';

describe('ListMaterializedViewsTool', () => {
  let tool: ListMaterializedViewsTool;
  let mockDriver: IDatabaseDriver;

  beforeEach(() => {
    mockDriver = {
      dialect: 'postgresql',
      executeQuery: vi.fn(),
    } as any;

    const mockConnectionManager = {
      getDriver: vi.fn().mockResolvedValue(mockDriver),
    } as any;

    tool = new ListMaterializedViewsTool(mockConnectionManager);
  });

  describe('Tool Properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('list-materialized-views');
    });

    it('should have descriptive description', () => {
      expect(tool.description).toContain('materialized views');
      expect(tool.description).toContain('PostgreSQL');
    });

    it('should have proper input schema', () => {
      const definition = tool.getDefinition();
      expect(definition.inputSchema.properties).toHaveProperty('profile');
      expect(definition.inputSchema.properties).toHaveProperty('schema');
      expect(definition.inputSchema.required).toContain('profile');
      expect(definition.inputSchema.required).not.toContain('schema');
    });
  });

  describe('execute', () => {
    it('should return materialized views', async () => {
      const mockViews = [
        {
          schema: 'public',
          name: 'mv_user_stats',
          owner: 'postgres',
          isPopulated: true,
          definition: 'SELECT count(*) FROM users',
          size: '16 kB',
          sizeBytes: 16384,
        },
      ];

      vi.mocked(mockDriver.executeQuery).mockResolvedValue({
        rows: mockViews,
        rowCount: 1,
        columns: ['schema', 'name', 'owner', 'isPopulated', 'definition', 'size', 'sizeBytes'],
      });

      const result = await tool.execute({ profile: 'test' });

      expect(result.success).toBe(true);
      expect(result.data.materializedViews).toHaveLength(1);
      expect(result.data.count).toBe(1);
      expect(result.data.materializedViews[0].name).toBe('mv_user_stats');
    });

    it('should filter by schema when provided', async () => {
      vi.mocked(mockDriver.executeQuery).mockResolvedValue({
        rows: [],
        rowCount: 0,
        columns: [],
      });

      await tool.execute({ profile: 'test', schema: 'analytics' });

      const callArgs = vi.mocked(mockDriver.executeQuery).mock.calls[0];
      expect(callArgs[1]).toEqual({ schema: 'analytics' });
    });

    it('should handle empty result', async () => {
      vi.mocked(mockDriver.executeQuery).mockResolvedValue({
        rows: [],
        rowCount: 0,
        columns: [],
      });

      const result = await tool.execute({ profile: 'test' });

      expect(result.success).toBe(true);
      expect(result.data.materializedViews).toHaveLength(0);
      expect(result.data.count).toBe(0);
    });

    it('should reject non-PostgreSQL profiles', async () => {
      (mockDriver as any).dialect = 'sqlserver';

      await expect(
        tool.execute({ profile: 'test' })
      ).rejects.toThrow('only available for PostgreSQL');
    });

    it('should reject missing profile', async () => {
      await expect(tool.execute({})).rejects.toThrow();
    });

    it('should propagate driver errors', async () => {
      vi.mocked(mockDriver.executeQuery).mockRejectedValue(new Error('Query failed'));

      await expect(
        tool.execute({ profile: 'test' })
      ).rejects.toThrow('Query failed');
    });
  });
});
