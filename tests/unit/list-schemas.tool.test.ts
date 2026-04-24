import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ListSchemasTool } from '../../src/tools/list-schemas.tool.js';
import type { IDatabaseDriver } from '../../src/database/interfaces/database-driver.js';

describe('ListSchemasTool', () => {
  let tool: ListSchemasTool;
  let mockDriver: IDatabaseDriver;

  beforeEach(() => {
    mockDriver = {
      dialect: 'sqlserver',
      listSchemas: vi.fn(),
    } as any;

    const mockConnectionManager = {
      getDriver: vi.fn().mockResolvedValue(mockDriver),
    } as any;

    tool = new ListSchemasTool(mockConnectionManager);
  });

  describe('Tool Properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('list-schemas');
    });

    it('should have descriptive description', () => {
      expect(tool.description).toContain('schemas');
    });

    it('should have proper input schema', () => {
      const definition = tool.getDefinition();
      expect(definition.inputSchema.properties).toHaveProperty('profile');
      expect(definition.inputSchema.properties).toHaveProperty('includeSystem');
      expect(definition.inputSchema.required).toContain('profile');
      expect(definition.inputSchema.required).not.toContain('includeSystem');
    });
  });

  describe('execute', () => {
    describe('with valid input', () => {
      it('should return schemas with summary', async () => {
        const mockSchemas = [
          { schemaName: 'dbo', owner: 'dbo', tableCount: 10, isSystemSchema: false },
          { schemaName: 'sales', owner: 'dbo', tableCount: 5, isSystemSchema: false },
          { schemaName: 'hr', owner: 'hr_user', tableCount: 3, isSystemSchema: false },
        ];

        vi.mocked(mockDriver.listSchemas).mockResolvedValue(mockSchemas);

        const result = await tool.execute({
          profile: 'test',
        });

        expect(result.success).toBe(true);
        expect(result.data.schemas).toHaveLength(3);
        expect(result.data.summary.totalSchemas).toBe(3);
        expect(result.data.summary.userSchemas).toBe(3);
        expect(result.data.summary.systemSchemas).toBe(0);
        expect(result.data.summary.totalTables).toBe(18);
      });

      it('should exclude system schemas by default', async () => {
        const mockSchemas = [
          { schemaName: 'dbo', owner: 'dbo', tableCount: 10, isSystemSchema: false },
          { schemaName: 'sys', owner: '', tableCount: 0, isSystemSchema: true },
        ];

        vi.mocked(mockDriver.listSchemas).mockResolvedValue(mockSchemas);

        const result = await tool.execute({
          profile: 'test',
        });

        expect(mockDriver.listSchemas).toHaveBeenCalledWith(false);
        expect(result.data.schemas).toHaveLength(2);
        expect(result.data.summary.userSchemas).toBe(1);
        expect(result.data.summary.systemSchemas).toBe(1);
      });

      it('should include system schemas when requested', async () => {
        const mockSchemas = [
          { schemaName: 'dbo', owner: 'dbo', tableCount: 10, isSystemSchema: false },
          { schemaName: 'sys', owner: '', tableCount: 0, isSystemSchema: true },
          { schemaName: 'INFORMATION_SCHEMA', owner: '', tableCount: 0, isSystemSchema: true },
        ];

        vi.mocked(mockDriver.listSchemas).mockResolvedValue(mockSchemas);

        const result = await tool.execute({
          profile: 'test',
          includeSystem: true,
        });

        expect(mockDriver.listSchemas).toHaveBeenCalledWith(true);
        expect(result.data.schemas).toHaveLength(3);
        expect(result.data.summary.systemSchemas).toBe(2);
      });

      it('should handle schemas with no tables', async () => {
        const mockSchemas = [
          { schemaName: 'empty_schema', owner: 'dbo', tableCount: 0, isSystemSchema: false },
        ];

        vi.mocked(mockDriver.listSchemas).mockResolvedValue(mockSchemas);

        const result = await tool.execute({
          profile: 'test',
        });

        expect(result.success).toBe(true);
        expect(result.data.schemas[0].tableCount).toBe(0);
        expect(result.data.summary.totalTables).toBe(0);
      });

      it('should handle empty schema list', async () => {
        vi.mocked(mockDriver.listSchemas).mockResolvedValue([]);

        const result = await tool.execute({
          profile: 'test',
        });

        expect(result.success).toBe(true);
        expect(result.data.schemas).toHaveLength(0);
        expect(result.data.summary.totalSchemas).toBe(0);
        expect(result.data.summary.totalTables).toBe(0);
      });

      it('should correctly identify system vs user schemas', async () => {
        const mockSchemas = [
          { schemaName: 'dbo', owner: 'dbo', tableCount: 10, isSystemSchema: false },
          { schemaName: 'sys', owner: '', tableCount: 0, isSystemSchema: true },
          { schemaName: 'custom', owner: 'user1', tableCount: 5, isSystemSchema: false },
        ];

        vi.mocked(mockDriver.listSchemas).mockResolvedValue(mockSchemas);

        const result = await tool.execute({
          profile: 'test',
          includeSystem: true,
        });

        expect(result.data.summary.userSchemas).toBe(2);
        expect(result.data.summary.systemSchemas).toBe(1);
      });
    });

    describe('input validation', () => {
      it('should reject missing profile', async () => {
        await expect(
          tool.execute({})
        ).rejects.toThrow();
      });

      it('should accept optional includeSystem parameter', async () => {
        vi.mocked(mockDriver.listSchemas).mockResolvedValue([]);

        await expect(
          tool.execute({ profile: 'test' })
        ).resolves.toBeDefined();
      });

      it('should handle includeSystem as false explicitly', async () => {
        vi.mocked(mockDriver.listSchemas).mockResolvedValue([]);

        await tool.execute({
          profile: 'test',
          includeSystem: false,
        });

        expect(mockDriver.listSchemas).toHaveBeenCalledWith(false);
      });
    });

    describe('error handling', () => {
      it('should propagate driver errors', async () => {
        vi.mocked(mockDriver.listSchemas).mockRejectedValue(
          new Error('Database connection failed')
        );

        await expect(
          tool.execute({
            profile: 'test',
          })
        ).rejects.toThrow('Database connection failed');
      });

      it('should handle database access errors', async () => {
        vi.mocked(mockDriver.listSchemas).mockRejectedValue(
          new Error('Insufficient permissions')
        );

        await expect(
          tool.execute({
            profile: 'test',
          })
        ).rejects.toThrow('Insufficient permissions');
      });
    });
  });
});
