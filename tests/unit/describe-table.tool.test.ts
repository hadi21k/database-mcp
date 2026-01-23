import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DescribeTableTool } from '../../src/tools/describe-table.tool.js';
import { ConnectionManager } from '../../src/database/connection-manager.js';
import { QueryExecutor } from '../../src/database/query-executor.js';
import { mockTableSchema } from '../fixtures/table-data.js';

describe('DescribeTableTool', () => {
  let tool: DescribeTableTool;
  let mockConnectionManager: ConnectionManager;
  let mockQueryExecutor: QueryExecutor;

  beforeEach(() => {
    mockConnectionManager = {} as ConnectionManager;
    mockQueryExecutor = {
      describeTable: vi.fn(),
    } as any;
    tool = new DescribeTableTool(mockConnectionManager, mockQueryExecutor);
  });

  describe('Tool Properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('describe-table');
    });

    it('should have descriptive description', () => {
      expect(tool.description).toContain('schema information');
      expect(tool.description).toContain('SQL Server');
    });

    it('should have proper input schema', () => {
      const definition = tool.getDefinition();
      expect(definition.inputSchema.properties).toHaveProperty('profile');
      expect(definition.inputSchema.properties).toHaveProperty('schema');
      expect(definition.inputSchema.properties).toHaveProperty('table');
      expect(definition.inputSchema.required).toContain('profile');
      expect(definition.inputSchema.required).toContain('schema');
      expect(definition.inputSchema.required).toContain('table');
    });
  });

  describe('execute', () => {
    describe('with valid input', () => {
      it('should return table schema with summary', async () => {
        vi.mocked(mockQueryExecutor.describeTable).mockResolvedValue(mockTableSchema);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
          table: 'Users',
        });

        expect(result.success).toBe(true);
        expect(result.data.schema).toBe('dbo');
        expect(result.data.table).toBe('Users');
        expect(result.data.fullName).toBe('dbo.Users');
        expect(result.data.columns).toHaveLength(3);
        expect(result.data.summary.totalColumns).toBe(3);
        expect(result.data.summary.primaryKeyColumns).toBe(1);
        expect(result.data.summary.nullableColumns).toBe(1);
        expect(result.data.summary.identityColumns).toBe(1);
        expect(result.data.summary.computedColumns).toBe(0);
      });

      it('should correctly calculate summary statistics', async () => {
        const schemaWithComputed = [
          ...mockTableSchema,
          {
            columnName: 'FullName',
            ordinalPosition: 4,
            dataType: 'nvarchar',
            maxLength: 200,
            precision: null,
            scale: null,
            isNullable: true,
            isPrimaryKey: false,
            isIdentity: false,
            isComputed: true,
            defaultValue: null,
            description: 'Computed full name',
          },
        ];

        vi.mocked(mockQueryExecutor.describeTable).mockResolvedValue(schemaWithComputed);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
          table: 'Users',
        });

        expect(result.data.summary.totalColumns).toBe(4);
        expect(result.data.summary.computedColumns).toBe(1);
        expect(result.data.summary.nullableColumns).toBe(2);
      });

      it('should handle table with no primary keys', async () => {
        const schemaNoPK = mockTableSchema.map(col => ({
          ...col,
          isPrimaryKey: false,
        }));

        vi.mocked(mockQueryExecutor.describeTable).mockResolvedValue(schemaNoPK);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
          table: 'Users',
        });

        expect(result.data.summary.primaryKeyColumns).toBe(0);
      });

      it('should handle empty column list', async () => {
        vi.mocked(mockQueryExecutor.describeTable).mockResolvedValue([]);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
          table: 'EmptyTable',
        });

        expect(result.success).toBe(true);
        expect(result.data.columns).toHaveLength(0);
        expect(result.data.summary.totalColumns).toBe(0);
      });
    });

    describe('input validation', () => {
      it('should reject missing profile', async () => {
        await expect(
          tool.execute({
            schema: 'dbo',
            table: 'Users',
          })
        ).rejects.toThrow();
      });

      it('should reject missing schema', async () => {
        await expect(
          tool.execute({
            profile: 'test',
            table: 'Users',
          })
        ).rejects.toThrow();
      });

      it('should reject missing table', async () => {
        await expect(
          tool.execute({
            profile: 'test',
            schema: 'dbo',
          })
        ).rejects.toThrow();
      });

      it('should reject invalid input types', async () => {
        await expect(
          tool.execute({
            profile: 123,
            schema: 'dbo',
            table: 'Users',
          })
        ).rejects.toThrow();
      });
    });

    describe('error handling', () => {
      it('should propagate query executor errors', async () => {
        vi.mocked(mockQueryExecutor.describeTable).mockRejectedValue(
          new Error('Database connection failed')
        );

        await expect(
          tool.execute({
            profile: 'test',
            schema: 'dbo',
            table: 'Users',
          })
        ).rejects.toThrow('Database connection failed');
      });

      it('should handle non-existent tables gracefully', async () => {
        vi.mocked(mockQueryExecutor.describeTable).mockRejectedValue(
          new Error('Table or view not found')
        );

        await expect(
          tool.execute({
            profile: 'test',
            schema: 'dbo',
            table: 'NonExistentTable',
          })
        ).rejects.toThrow('Table or view not found');
      });
    });
  });
});
