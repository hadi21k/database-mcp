import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SqlServerDriver } from '../../src/database/drivers/sqlserver.driver.js';

/**
 * Helper: create a mock mssql recordset (array with .columns property).
 */
function mockRecordset(rows: any[], columnNames: string[] = []) {
  const rs = [...rows] as any;
  rs.columns = {};
  for (const name of columnNames) {
    rs.columns[name] = {};
  }
  return rs;
}

describe('SqlServerDriver', () => {
  let driver: SqlServerDriver;
  let mockPool: any;
  let mockRequest: any;

  beforeEach(() => {
    mockRequest = {
      input: vi.fn().mockReturnThis(),
      query: vi.fn(),
    };

    mockPool = {
      request: vi.fn().mockReturnValue(mockRequest),
      close: vi.fn().mockResolvedValue(undefined),
    };

    driver = new SqlServerDriver(mockPool);
  });

  describe('dialect', () => {
    it('should be sqlserver', () => {
      expect(driver.dialect).toBe('sqlserver');
    });
  });

  describe('executeQuery', () => {
    it('should execute a basic query and return rows', async () => {
      mockRequest.query.mockResolvedValue({
        recordset: mockRecordset([{ id: 1, name: 'test' }], ['id', 'name']),
      });

      const result = await driver.executeQuery('SELECT * FROM users');

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ id: 1, name: 'test' });
      expect(result.rowCount).toBe(1);
      expect(result.columns).toEqual(['id', 'name']);
    });

    it('should add parameters to request', async () => {
      mockRequest.query.mockResolvedValue({
        recordset: mockRecordset([], []),
      });

      await driver.executeQuery('SELECT * FROM users WHERE id = @id', { id: 42 });

      expect(mockRequest.input).toHaveBeenCalledWith('id', 42);
    });

    it('should inject TOP clause when maxRows is provided', async () => {
      mockRequest.query.mockResolvedValue({
        recordset: mockRecordset([], []),
      });

      await driver.executeQuery('SELECT * FROM users', undefined, 100);

      const calledQuery = mockRequest.query.mock.calls[0][0];
      expect(calledQuery).toContain('TOP 100');
    });

    it('should not inject TOP when no maxRows', async () => {
      mockRequest.query.mockResolvedValue({
        recordset: mockRecordset([], []),
      });

      await driver.executeQuery('SELECT * FROM users');

      const calledQuery = mockRequest.query.mock.calls[0][0];
      expect(calledQuery).not.toContain('TOP');
    });

    it('should set limited=true when rowCount >= maxRows', async () => {
      const rows = Array.from({ length: 10 }, (_, i) => ({ id: i }));
      mockRequest.query.mockResolvedValue({
        recordset: mockRecordset(rows, ['id']),
      });

      const result = await driver.executeQuery('SELECT * FROM users', undefined, 10);

      expect(result.limited).toBe(true);
    });

    it('should set limited=undefined when no maxRows', async () => {
      mockRequest.query.mockResolvedValue({
        recordset: mockRecordset([{ id: 1 }], ['id']),
      });

      const result = await driver.executeQuery('SELECT * FROM users');

      expect(result.limited).toBeUndefined();
    });

    it('should handle empty result sets', async () => {
      mockRequest.query.mockResolvedValue({
        recordset: mockRecordset([], ['id']),
      });

      const result = await driver.executeQuery('SELECT * FROM empty_table');

      expect(result.rows).toHaveLength(0);
      expect(result.rowCount).toBe(0);
    });

    it('should wrap errors with createFriendlyError', async () => {
      mockRequest.query.mockRejectedValue(new Error('Connection lost'));

      await expect(driver.executeQuery('SELECT 1')).rejects.toThrow();
    });
  });

  describe('listSchemas', () => {
    it('should query sys.schemas and map results', async () => {
      // listSchemas creates its own pool.request() call
      mockPool.request.mockReturnValue(mockRequest);
      mockRequest.query.mockResolvedValue({
        recordset: mockRecordset(
          [{ schemaName: 'dbo', owner: 'dbo', tableCount: 5, isSystemSchema: 0 }],
          []
        ),
      });

      const result = await driver.listSchemas();

      expect(result).toHaveLength(1);
      expect(result[0].schemaName).toBe('dbo');
      expect(result[0].isSystemSchema).toBe(false);
      const calledQuery = mockRequest.query.mock.calls[0][0];
      expect(calledQuery).toContain('sys.schemas');
    });

    it('should filter system schemas by default', async () => {
      mockPool.request.mockReturnValue(mockRequest);
      mockRequest.query.mockResolvedValue({
        recordset: mockRecordset([], []),
      });

      await driver.listSchemas(false);

      const calledQuery = mockRequest.query.mock.calls[0][0];
      expect(calledQuery).toContain('NOT IN');
    });

    it('should include all schemas when includeSystem is true', async () => {
      mockPool.request.mockReturnValue(mockRequest);
      mockRequest.query.mockResolvedValue({
        recordset: mockRecordset([], []),
      });

      await driver.listSchemas(true);

      const calledQuery = mockRequest.query.mock.calls[0][0];
      expect(calledQuery).toContain('1=1');
    });
  });

  describe('listTables', () => {
    it('should query sys.tables', async () => {
      mockPool.request.mockReturnValue(mockRequest);
      mockRequest.query.mockResolvedValue({
        recordset: mockRecordset(
          [{ schema: 'dbo', table: 'Users', rowCount: 100, type: 'USER_TABLE' }],
          []
        ),
      });

      const result = await driver.listTables();

      expect(result).toHaveLength(1);
      expect(result[0].table).toBe('Users');
    });

    it('should filter by schema when provided', async () => {
      mockPool.request.mockReturnValue(mockRequest);
      mockRequest.query.mockResolvedValue({
        recordset: mockRecordset([], []),
      });

      await driver.listTables('dbo');

      // Uses @schemaFilter parameter name and sql.VarChar type
      expect(mockRequest.input).toHaveBeenCalled();
      const inputCall = mockRequest.input.mock.calls[0];
      expect(inputCall[0]).toBe('schemaFilter');
      expect(inputCall[2]).toBe('dbo');
    });
  });

  describe('describeTable', () => {
    it('should return column information', async () => {
      // describeTable chains .request().input().input().query()
      mockPool.request.mockReturnValue(mockRequest);
      mockRequest.query.mockResolvedValue({
        recordset: mockRecordset(
          [
            {
              columnName: 'id',
              ordinalPosition: 1,
              dataType: 'int',
              maxLength: null,
              precision: 10,
              scale: 0,
              isNullable: false,
              isPrimaryKey: 1,
              isIdentity: true,
              isComputed: false,
              defaultValue: null,
              description: null,
            },
          ],
          []
        ),
      });

      const result = await driver.describeTable('dbo', 'Users');

      expect(result).toHaveLength(1);
      expect(result[0].columnName).toBe('id');
      // Verify input was called with schema and table params
      const inputCalls = mockRequest.input.mock.calls;
      expect(inputCalls[0][0]).toBe('schema');
      expect(inputCalls[0][2]).toBe('dbo');
      expect(inputCalls[1][0]).toBe('table');
      expect(inputCalls[1][2]).toBe('Users');
    });
  });

  describe('getTableSchema', () => {
    it('should return basic column info', async () => {
      mockPool.request.mockReturnValue(mockRequest);
      mockRequest.query.mockResolvedValue({
        recordset: mockRecordset(
          [{ column: 'id', dataType: 'int', maxLength: null, isNullable: false, isPrimaryKey: true }],
          []
        ),
      });

      const result = await driver.getTableSchema('dbo', 'Users');

      expect(result).toHaveLength(1);
      expect(result[0].column).toBe('id');
    });
  });

  describe('getRelationships', () => {
    it('should return outgoing and incoming relationships', async () => {
      // getRelationships makes two queries through pool.request()
      const mockRequest2 = {
        input: vi.fn().mockReturnThis(),
        query: vi.fn(),
      };

      mockPool.request
        .mockReturnValueOnce(mockRequest)
        .mockReturnValueOnce(mockRequest2);

      // First query: outgoing FKs
      mockRequest.query.mockResolvedValue({
        recordset: mockRecordset(
          [
            {
              foreignKeyName: 'FK_Orders_Users',
              referencedSchema: 'dbo',
              referencedTable: 'Users',
              fromColumn: 'user_id',
              toColumn: 'id',
            },
          ],
          []
        ),
      });

      // Second query: incoming FKs
      mockRequest2.query.mockResolvedValue({
        recordset: mockRecordset([], []),
      });

      const result = await driver.getRelationships('dbo', 'Orders');

      expect(result.outgoing).toHaveLength(1);
      expect(result.outgoing[0].foreignKeyName).toBe('FK_Orders_Users');
      expect(result.outgoing[0].columns).toHaveLength(1);
      expect(result.incoming).toHaveLength(0);
    });
  });

  describe('getIndexes', () => {
    it('should return grouped index information', async () => {
      mockPool.request.mockReturnValue(mockRequest);
      mockRequest.query.mockResolvedValue({
        recordset: mockRecordset(
          [
            {
              indexName: 'PK_Users',
              type: 'CLUSTERED',
              isUnique: true,
              isPrimaryKey: true,
              isUniqueConstraint: false,
              isDisabled: false,
              filterDefinition: null,
              columnName: 'id',
              isDescending: false,
              keyOrdinal: 1,
              isIncluded: false,
            },
          ],
          []
        ),
      });

      const result = await driver.getIndexes('dbo', 'Users');

      expect(result).toHaveLength(1);
      expect(result[0].indexName).toBe('PK_Users');
      expect(result[0].isPrimaryKey).toBe(true);
      expect(result[0].keyColumns).toHaveLength(1);
      expect(result[0].keyColumns[0].columnName).toBe('id');
    });

    it('should separate included columns from key columns', async () => {
      mockPool.request.mockReturnValue(mockRequest);
      mockRequest.query.mockResolvedValue({
        recordset: mockRecordset(
          [
            {
              indexName: 'IX_Users_Email',
              type: 'NONCLUSTERED',
              isUnique: false,
              isPrimaryKey: false,
              isUniqueConstraint: false,
              isDisabled: false,
              filterDefinition: null,
              columnName: 'email',
              isDescending: false,
              keyOrdinal: 1,
              isIncluded: false,
            },
            {
              indexName: 'IX_Users_Email',
              type: 'NONCLUSTERED',
              isUnique: false,
              isPrimaryKey: false,
              isUniqueConstraint: false,
              isDisabled: false,
              filterDefinition: null,
              columnName: 'name',
              isDescending: false,
              keyOrdinal: 0,
              isIncluded: true,
            },
          ],
          []
        ),
      });

      const result = await driver.getIndexes('dbo', 'Users');

      expect(result).toHaveLength(1);
      expect(result[0].keyColumns).toHaveLength(1);
      expect(result[0].includedColumns).toEqual(['name']);
    });
  });

  describe('getDatabaseInfo', () => {
    it('should return database metadata', async () => {
      mockPool.request.mockReturnValue(mockRequest);
      mockRequest.query.mockResolvedValue({
        recordset: mockRecordset(
          [{ databaseName: 'TestDB', serverVersion: '15.0', compatibilityLevel: 150 }],
          []
        ),
      });

      const result = await driver.getDatabaseInfo();

      expect(result.databaseName).toBe('TestDB');
      expect(result.serverVersion).toBe('15.0');
      expect(result.compatibilityLevel).toBe(150);
    });
  });

  describe('close', () => {
    it('should close the pool', async () => {
      await driver.close();

      expect(mockPool.close).toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      mockPool.close.mockRejectedValue(new Error('close error'));

      await expect(driver.close()).resolves.not.toThrow();
    });
  });
});
