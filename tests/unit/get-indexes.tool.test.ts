import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetIndexesTool } from '../../src/tools/get-indexes.tool.js';
import { ConnectionManager } from '../../src/database/connection-manager.js';
import { QueryExecutor } from '../../src/database/query-executor.js';
import { mockIndexes } from '../fixtures/table-data.js';

describe('GetIndexesTool', () => {
  let tool: GetIndexesTool;
  let mockConnectionManager: ConnectionManager;
  let mockQueryExecutor: QueryExecutor;

  beforeEach(() => {
    mockConnectionManager = {} as ConnectionManager;
    mockQueryExecutor = {
      getTableIndexes: vi.fn(),
    } as any;
    tool = new GetIndexesTool(mockConnectionManager, mockQueryExecutor);
  });

  describe('Tool Properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('get-indexes');
    });

    it('should have descriptive description', () => {
      expect(tool.description).toContain('indexes');
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
      it('should return indexes with summary', async () => {
        vi.mocked(mockQueryExecutor.getTableIndexes).mockResolvedValue(mockIndexes);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
          table: 'Users',
        });

        expect(result.success).toBe(true);
        expect(result.data.schema).toBe('dbo');
        expect(result.data.table).toBe('Users');
        expect(result.data.fullName).toBe('dbo.Users');
        expect(result.data.indexes).toHaveLength(2);
        expect(result.data.summary.totalIndexes).toBe(2);
        expect(result.data.summary.clusteredIndexes).toBe(1);
        expect(result.data.summary.nonClusteredIndexes).toBe(1);
        expect(result.data.summary.uniqueIndexes).toBe(2);
        expect(result.data.summary.primaryKeyIndexes).toBe(1);
        expect(result.data.summary.disabledIndexes).toBe(0);
      });

      it('should correctly calculate index type statistics', async () => {
        const indexesWithTypes = [
          {
            indexName: 'PK_Users',
            type: 'CLUSTERED',
            isUnique: true,
            isPrimaryKey: true,
            isUniqueConstraint: false,
            isDisabled: false,
            fillFactor: null,
            filterDefinition: null,
            keyColumns: [{ columnName: 'Id', isDescending: false, keyOrdinal: 1 }],
            includedColumns: [],
          },
          {
            indexName: 'IX_Users_Email',
            type: 'NONCLUSTERED',
            isUnique: true,
            isPrimaryKey: false,
            isUniqueConstraint: true,
            isDisabled: false,
            fillFactor: 90,
            filterDefinition: null,
            keyColumns: [{ columnName: 'Email', isDescending: false, keyOrdinal: 1 }],
            includedColumns: ['Name'],
          },
          {
            indexName: 'IX_Users_Name',
            type: 'NONCLUSTERED',
            isUnique: false,
            isPrimaryKey: false,
            isUniqueConstraint: false,
            isDisabled: false,
            fillFactor: null,
            filterDefinition: null,
            keyColumns: [{ columnName: 'Name', isDescending: false, keyOrdinal: 1 }],
            includedColumns: [],
          },
        ];

        vi.mocked(mockQueryExecutor.getTableIndexes).mockResolvedValue(indexesWithTypes);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
          table: 'Users',
        });

        expect(result.data.summary.totalIndexes).toBe(3);
        expect(result.data.summary.clusteredIndexes).toBe(1);
        expect(result.data.summary.nonClusteredIndexes).toBe(2);
        expect(result.data.summary.uniqueIndexes).toBe(2);
        expect(result.data.summary.primaryKeyIndexes).toBe(1);
      });

      it('should handle disabled indexes', async () => {
        const indexesWithDisabled = [
          ...mockIndexes,
          {
            indexName: 'IX_Users_Disabled',
            type: 'NONCLUSTERED',
            isUnique: false,
            isPrimaryKey: false,
            isUniqueConstraint: false,
            isDisabled: true,
            fillFactor: null,
            filterDefinition: null,
            keyColumns: [{ columnName: 'Status', isDescending: false, keyOrdinal: 1 }],
            includedColumns: [],
          },
        ];

        vi.mocked(mockQueryExecutor.getTableIndexes).mockResolvedValue(indexesWithDisabled);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
          table: 'Users',
        });

        expect(result.data.summary.disabledIndexes).toBe(1);
      });

      it('should handle indexes with included columns', async () => {
        const indexWithIncluded = [
          {
            indexName: 'IX_Users_Email',
            type: 'NONCLUSTERED',
            isUnique: true,
            isPrimaryKey: false,
            isUniqueConstraint: true,
            isDisabled: false,
            fillFactor: 90,
            filterDefinition: null,
            keyColumns: [
              { columnName: 'Email', isDescending: false, keyOrdinal: 1 },
            ],
            includedColumns: ['Name', 'CreatedAt'],
          },
        ];

        vi.mocked(mockQueryExecutor.getTableIndexes).mockResolvedValue(indexWithIncluded);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
          table: 'Users',
        });

        expect(result.data.indexes[0].includedColumns).toHaveLength(2);
        expect(result.data.indexes[0].includedColumns).toContain('Name');
        expect(result.data.indexes[0].includedColumns).toContain('CreatedAt');
      });

      it('should handle filtered indexes', async () => {
        const filteredIndex = [
          {
            indexName: 'IX_Users_Active',
            type: 'NONCLUSTERED',
            isUnique: false,
            isPrimaryKey: false,
            isUniqueConstraint: false,
            isDisabled: false,
            fillFactor: null,
            filterDefinition: '[IsActive] = 1',
            keyColumns: [{ columnName: 'Email', isDescending: false, keyOrdinal: 1 }],
            includedColumns: [],
          },
        ];

        vi.mocked(mockQueryExecutor.getTableIndexes).mockResolvedValue(filteredIndex);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
          table: 'Users',
        });

        expect(result.data.indexes[0].filterDefinition).toBe('[IsActive] = 1');
      });

      it('should handle composite key indexes', async () => {
        const compositeIndex = [
          {
            indexName: 'IX_Users_Composite',
            type: 'NONCLUSTERED',
            isUnique: false,
            isPrimaryKey: false,
            isUniqueConstraint: false,
            isDisabled: false,
            fillFactor: null,
            filterDefinition: null,
            keyColumns: [
              { columnName: 'Status', isDescending: false, keyOrdinal: 1 },
              { columnName: 'CreatedAt', isDescending: true, keyOrdinal: 2 },
            ],
            includedColumns: [],
          },
        ];

        vi.mocked(mockQueryExecutor.getTableIndexes).mockResolvedValue(compositeIndex);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
          table: 'Users',
        });

        expect(result.data.indexes[0].keyColumns).toHaveLength(2);
        expect(result.data.indexes[0].keyColumns[0].isDescending).toBe(false);
        expect(result.data.indexes[0].keyColumns[1].isDescending).toBe(true);
      });

      it('should handle table with no indexes', async () => {
        vi.mocked(mockQueryExecutor.getTableIndexes).mockResolvedValue([]);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
          table: 'HeapTable',
        });

        expect(result.success).toBe(true);
        expect(result.data.indexes).toHaveLength(0);
        expect(result.data.summary.totalIndexes).toBe(0);
        expect(result.data.summary.clusteredIndexes).toBe(0);
        expect(result.data.summary.nonClusteredIndexes).toBe(0);
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
        vi.mocked(mockQueryExecutor.getTableIndexes).mockRejectedValue(
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
        vi.mocked(mockQueryExecutor.getTableIndexes).mockRejectedValue(
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
