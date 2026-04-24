import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ListTablesTool } from '../../src/tools/list-tables.tool.js';
import type { IDatabaseDriver } from '../../src/database/interfaces/database-driver.js';

describe('ListTablesTool', () => {
  let tool: ListTablesTool;
  let mockDriver: IDatabaseDriver;

  beforeEach(() => {
    mockDriver = {
      dialect: 'sqlserver',
      listTables: vi.fn(),
    } as any;

    const mockConnectionManager = {
      getDriver: vi.fn().mockResolvedValue(mockDriver),
    } as any;

    tool = new ListTablesTool(mockConnectionManager);
  });

  describe('Tool Properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('list-tables');
    });

    it('should have descriptive description', () => {
      expect(tool.description).toContain('tables');
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
    describe('with valid input', () => {
      it('should return tables with summary', async () => {
        const mockTables = [
          { schema: 'dbo', table: 'Users', rowCount: 100, type: 'USER_TABLE' },
          { schema: 'dbo', table: 'Orders', rowCount: 500, type: 'USER_TABLE' },
          { schema: 'sales', table: 'Products', rowCount: 50, type: 'USER_TABLE' },
        ];

        vi.mocked(mockDriver.listTables).mockResolvedValue(mockTables);

        const result = await tool.execute({
          profile: 'test',
        });

        expect(result.success).toBe(true);
        expect(result.data.tables).toHaveLength(3);
        expect(result.data.summary.totalTables).toBe(3);
        expect(result.data.summary.schemas).toEqual(['dbo', 'sales']);
        expect(result.data.summary.totalRows).toBe(650);
      });

      it('should filter by schema when provided', async () => {
        const mockTables = [
          { schema: 'dbo', table: 'Users', rowCount: 100, type: 'USER_TABLE' },
          { schema: 'dbo', table: 'Orders', rowCount: 500, type: 'USER_TABLE' },
        ];

        vi.mocked(mockDriver.listTables).mockResolvedValue(mockTables);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
        });

        expect(mockDriver.listTables).toHaveBeenCalledWith('dbo');
        expect(result.success).toBe(true);
        expect(result.data.tables).toHaveLength(2);
      });

      it('should handle empty table list', async () => {
        vi.mocked(mockDriver.listTables).mockResolvedValue([]);

        const result = await tool.execute({
          profile: 'test',
        });

        expect(result.success).toBe(true);
        expect(result.data.tables).toHaveLength(0);
        expect(result.data.summary.totalTables).toBe(0);
        expect(result.data.summary.totalRows).toBe(0);
      });
    });

    describe('input validation', () => {
      it('should reject missing profile', async () => {
        await expect(
          tool.execute({})
        ).rejects.toThrow();
      });

      it('should accept optional schema', async () => {
        vi.mocked(mockDriver.listTables).mockResolvedValue([]);

        await expect(
          tool.execute({ profile: 'test' })
        ).resolves.toBeDefined();
      });
    });

    describe('error handling', () => {
      it('should propagate driver errors', async () => {
        vi.mocked(mockDriver.listTables).mockRejectedValue(
          new Error('Database connection failed')
        );

        await expect(
          tool.execute({
            profile: 'test',
          })
        ).rejects.toThrow('Database connection failed');
      });
    });
  });
});
