import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ListEnumsTool } from '../../src/tools/list-enums.tool.js';
import type { IDatabaseDriver } from '../../src/database/interfaces/database-driver.js';

describe('ListEnumsTool', () => {
  let tool: ListEnumsTool;
  let mockDriver: IDatabaseDriver;

  beforeEach(() => {
    mockDriver = {
      dialect: 'postgresql',
      executeQuery: vi.fn(),
    } as any;

    const mockConnectionManager = {
      getDriver: vi.fn().mockResolvedValue(mockDriver),
    } as any;

    tool = new ListEnumsTool(mockConnectionManager);
  });

  describe('Tool Properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('list-enums');
    });

    it('should have descriptive description', () => {
      expect(tool.description).toContain('enum');
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
    it('should return enums with their values', async () => {
      const mockEnums = [
        { schema: 'public', name: 'status', values: ['active', 'inactive', 'pending'] },
        { schema: 'public', name: 'priority', values: ['low', 'medium', 'high'] },
      ];

      vi.mocked(mockDriver.executeQuery).mockResolvedValue({
        rows: mockEnums,
        rowCount: 2,
        columns: ['schema', 'name', 'values'],
      });

      const result = await tool.execute({ profile: 'test' });

      expect(result.success).toBe(true);
      expect(result.data.enums).toHaveLength(2);
      expect(result.data.count).toBe(2);
      expect(result.data.enums[0].values).toEqual(['active', 'inactive', 'pending']);
    });

    it('should filter by schema when provided', async () => {
      vi.mocked(mockDriver.executeQuery).mockResolvedValue({
        rows: [],
        rowCount: 0,
        columns: [],
      });

      await tool.execute({ profile: 'test', schema: 'custom' });

      const callArgs = vi.mocked(mockDriver.executeQuery).mock.calls[0];
      expect(callArgs[1]).toEqual({ schema: 'custom' });
    });

    it('should handle empty result', async () => {
      vi.mocked(mockDriver.executeQuery).mockResolvedValue({
        rows: [],
        rowCount: 0,
        columns: [],
      });

      const result = await tool.execute({ profile: 'test' });

      expect(result.success).toBe(true);
      expect(result.data.enums).toHaveLength(0);
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
      vi.mocked(mockDriver.executeQuery).mockRejectedValue(new Error('Table not found'));

      await expect(
        tool.execute({ profile: 'test' })
      ).rejects.toThrow('Table not found');
    });
  });
});
