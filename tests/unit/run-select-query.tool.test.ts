import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RunSelectQueryTool } from '../../src/tools/run-select-query.tool.js';
import { ConnectionManager } from '../../src/database/connection-manager.js';
import { QueryExecutor } from '../../src/database/query-executor.js';
import { mockQueryResult } from '../fixtures/table-data.js';

describe('RunSelectQueryTool', () => {
  let tool: RunSelectQueryTool;
  let mockConnectionManager: ConnectionManager;
  let mockQueryExecutor: QueryExecutor;

  beforeEach(() => {
    mockConnectionManager = {} as ConnectionManager;
    mockQueryExecutor = {
      executeQuerySafe: vi.fn(),
    } as any;
    tool = new RunSelectQueryTool(mockConnectionManager, mockQueryExecutor);
  });

  describe('Tool Properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('run-select-query');
    });

    it('should have descriptive description', () => {
      expect(tool.description).toContain('SELECT query');
      expect(tool.description).toContain('SQL Server');
    });

    it('should have proper input schema', () => {
      const definition = tool.getDefinition();
      expect(definition.inputSchema.properties).toHaveProperty('profile');
      expect(definition.inputSchema.properties).toHaveProperty('query');
      expect(definition.inputSchema.properties).toHaveProperty('parameters');
      expect(definition.inputSchema.properties).toHaveProperty('maxRows');
      expect(definition.inputSchema.required).toContain('profile');
      expect(definition.inputSchema.required).toContain('query');
      expect(definition.inputSchema.required).not.toContain('parameters');
      expect(definition.inputSchema.required).not.toContain('maxRows');
    });
  });

  describe('execute', () => {
    describe('with valid input', () => {
      it('should execute query and return results', async () => {
        vi.mocked(mockQueryExecutor.executeQuerySafe).mockResolvedValue(mockQueryResult);

        const result = await tool.execute({
          profile: 'test',
          query: 'SELECT * FROM Users',
        });

        expect(result.success).toBe(true);
        expect(result.data.rows).toHaveLength(2);
        expect(result.data.rowCount).toBe(2);
        expect(result.data.columns).toEqual(['Id', 'Name', 'Email']);
        expect(result.data.summary.totalRows).toBe(2);
        expect(result.data.summary.columnCount).toBe(3);
        expect(result.data.summary.wasLimited).toBe(false);
      });

      it('should use default maxRows when not specified', async () => {
        vi.mocked(mockQueryExecutor.executeQuerySafe).mockResolvedValue(mockQueryResult);

        await tool.execute({
          profile: 'test',
          query: 'SELECT * FROM Users',
        });

        expect(mockQueryExecutor.executeQuerySafe).toHaveBeenCalledWith(
          'test',
          'SELECT * FROM Users',
          { maxRows: 1000 }
        );
      });

      it('should use custom maxRows when specified', async () => {
        vi.mocked(mockQueryExecutor.executeQuerySafe).mockResolvedValue(mockQueryResult);

        await tool.execute({
          profile: 'test',
          query: 'SELECT * FROM Users',
          maxRows: 500,
        });

        expect(mockQueryExecutor.executeQuerySafe).toHaveBeenCalledWith(
          'test',
          'SELECT * FROM Users',
          { maxRows: 500 }
        );
      });

      it('should pass parameters to query executor', async () => {
        const parameters = { userId: 123, status: 'active' };
        vi.mocked(mockQueryExecutor.executeQuerySafe).mockResolvedValue(mockQueryResult);

        await tool.execute({
          profile: 'test',
          query: 'SELECT * FROM Users WHERE Id = @userId AND Status = @status',
          parameters,
        });

        expect(mockQueryExecutor.executeQuerySafe).toHaveBeenCalledWith(
          'test',
          'SELECT * FROM Users WHERE Id = @userId AND Status = @status',
          { parameters, maxRows: 1000 }
        );
      });

      it('should handle limited results', async () => {
        const limitedResult = {
          ...mockQueryResult,
          limited: true,
          rowCount: 1000,
        };
        vi.mocked(mockQueryExecutor.executeQuerySafe).mockResolvedValue(limitedResult);

        const result = await tool.execute({
          profile: 'test',
          query: 'SELECT * FROM Users',
        });

        expect(result.data.limited).toBe(true);
        expect(result.data.summary.wasLimited).toBe(true);
      });

      it('should handle empty result sets', async () => {
        const emptyResult = {
          rows: [],
          rowCount: 0,
          columns: ['Id', 'Name'],
          limited: false,
        };
        vi.mocked(mockQueryExecutor.executeQuerySafe).mockResolvedValue(emptyResult);

        const result = await tool.execute({
          profile: 'test',
          query: 'SELECT * FROM Users WHERE Id = 99999',
        });

        expect(result.success).toBe(true);
        expect(result.data.rows).toHaveLength(0);
        expect(result.data.rowCount).toBe(0);
        expect(result.data.summary.totalRows).toBe(0);
      });
    });

    describe('input validation', () => {
      it('should reject missing profile', async () => {
        await expect(
          tool.execute({
            query: 'SELECT * FROM Users',
          })
        ).rejects.toThrow();
      });

      it('should reject missing query', async () => {
        await expect(
          tool.execute({
            profile: 'test',
          })
        ).rejects.toThrow();
      });

      it('should reject maxRows below minimum', async () => {
        await expect(
          tool.execute({
            profile: 'test',
            query: 'SELECT * FROM Users',
            maxRows: 0,
          })
        ).rejects.toThrow();
      });

      it('should reject maxRows above maximum', async () => {
        await expect(
          tool.execute({
            profile: 'test',
            query: 'SELECT * FROM Users',
            maxRows: 10001,
          })
        ).rejects.toThrow();
      });

      it('should accept valid maxRows range', async () => {
        vi.mocked(mockQueryExecutor.executeQuerySafe).mockResolvedValue(mockQueryResult);

        await expect(
          tool.execute({
            profile: 'test',
            query: 'SELECT * FROM Users',
            maxRows: 5000,
          })
        ).resolves.toBeDefined();
      });
    });

    describe('error handling', () => {
      it('should propagate query executor errors', async () => {
        vi.mocked(mockQueryExecutor.executeQuerySafe).mockRejectedValue(
          new Error('Database connection failed')
        );

        await expect(
          tool.execute({
            profile: 'test',
            query: 'SELECT * FROM Users',
          })
        ).rejects.toThrow('Database connection failed');
      });

      it('should handle SQL syntax errors', async () => {
        vi.mocked(mockQueryExecutor.executeQuerySafe).mockRejectedValue(
          new Error('Invalid column name')
        );

        await expect(
          tool.execute({
            profile: 'test',
            query: 'SELECT * FROM NonExistentTable',
          })
        ).rejects.toThrow('Invalid column name');
      });

      it('should reject non-SELECT queries', async () => {
        vi.mocked(mockQueryExecutor.executeQuerySafe).mockRejectedValue(
          new Error('Only SELECT queries are allowed')
        );

        await expect(
          tool.execute({
            profile: 'test',
            query: 'INSERT INTO Users VALUES (1, "test")',
          })
        ).rejects.toThrow();
      });
    });
  });
});
