import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PostgresDriver } from '../../src/database/drivers/postgres.driver.js';

/**
 * Creates a mock postgres Sql instance that supports both
 * tagged template calls (sql`...`) and sql.unsafe().
 */
function createMockSql() {
  const mockSql: any = vi.fn().mockImplementation(() => []);

  // sql.unsafe(query, values)
  mockSql.unsafe = vi.fn().mockResolvedValue(
    Object.assign([], { columns: [] })
  );

  // sql.end()
  mockSql.end = vi.fn().mockResolvedValue(undefined);

  // sql(array) — used for IN clauses with tagged templates
  mockSql.mockImplementation((...args: any[]) => {
    // When called as tagged template sql`...`, args[0] is TemplateStringsArray
    if (Array.isArray(args[0]) && 'raw' in args[0]) {
      return Promise.resolve([]);
    }
    // When called as sql(values) for parameterized IN lists
    return args[0];
  });

  return mockSql;
}

describe('PostgresDriver', () => {
  let driver: PostgresDriver;
  let mockSql: any;

  beforeEach(() => {
    mockSql = createMockSql();
    driver = new PostgresDriver(mockSql);
  });

  describe('dialect', () => {
    it('should be postgresql', () => {
      expect(driver.dialect).toBe('postgresql');
    });
  });

  describe('executeQuery', () => {
    it('should execute a basic query', async () => {
      mockSql.unsafe.mockResolvedValue(
        Object.assign([{ id: 1, name: 'test' }], {
          columns: [{ name: 'id' }, { name: 'name' }],
        })
      );

      const result = await driver.executeQuery('SELECT * FROM users');

      expect(result.rows).toEqual([{ id: 1, name: 'test' }]);
      expect(result.rowCount).toBe(1);
      expect(result.columns).toEqual(['id', 'name']);
      expect(mockSql.unsafe).toHaveBeenCalledWith('SELECT * FROM users', []);
    });

    it('should convert @params to $N positional params', async () => {
      mockSql.unsafe.mockResolvedValue(
        Object.assign([], { columns: [] })
      );

      await driver.executeQuery(
        'SELECT * FROM users WHERE id = @id AND name = @name',
        { id: 42, name: 'Alice' }
      );

      expect(mockSql.unsafe).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE id = $1 AND name = $2',
        [42, 'Alice']
      );
    });

    it('should inject LIMIT when maxRows is provided', async () => {
      mockSql.unsafe.mockResolvedValue(
        Object.assign([], { columns: [] })
      );

      await driver.executeQuery('SELECT * FROM users', undefined, 100);

      const calledQuery = mockSql.unsafe.mock.calls[0][0];
      expect(calledQuery).toContain('LIMIT 100');
    });

    it('should not inject LIMIT when no maxRows', async () => {
      mockSql.unsafe.mockResolvedValue(
        Object.assign([], { columns: [] })
      );

      await driver.executeQuery('SELECT * FROM users');

      const calledQuery = mockSql.unsafe.mock.calls[0][0];
      expect(calledQuery).not.toContain('LIMIT');
    });

    it('should set limited flag when rowCount >= maxRows', async () => {
      const rows = Array.from({ length: 10 }, (_, i) => ({ id: i }));
      mockSql.unsafe.mockResolvedValue(
        Object.assign(rows, { columns: [{ name: 'id' }] })
      );

      const result = await driver.executeQuery('SELECT * FROM users', undefined, 10);

      expect(result.limited).toBe(true);
    });

    it('should handle empty results', async () => {
      mockSql.unsafe.mockResolvedValue(
        Object.assign([], { columns: [{ name: 'id' }] })
      );

      const result = await driver.executeQuery('SELECT * FROM empty_table');

      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
    });

    it('should handle missing columns metadata', async () => {
      mockSql.unsafe.mockResolvedValue(
        Object.assign([{ id: 1 }], { columns: undefined })
      );

      const result = await driver.executeQuery('SELECT 1');

      expect(result.columns).toEqual([]);
    });

    it('should leave @param untouched if not in params object', async () => {
      mockSql.unsafe.mockResolvedValue(
        Object.assign([], { columns: [] })
      );

      await driver.executeQuery(
        'SELECT * FROM users WHERE email = @email',
        { id: 1 }  // email not in params
      );

      const calledQuery = mockSql.unsafe.mock.calls[0][0];
      expect(calledQuery).toContain('@email');
      expect(calledQuery).not.toContain('$');
    });

    it('should wrap errors with createFriendlyError', async () => {
      mockSql.unsafe.mockRejectedValue(new Error('relation does not exist'));

      await expect(driver.executeQuery('SELECT * FROM nonexistent')).rejects.toThrow();
    });
  });

  describe('listSchemas', () => {
    it('should return schemas from tagged template query', async () => {
      const schemas = [
        { schemaName: 'public', owner: 'postgres', tableCount: 5, isSystemSchema: false },
      ];
      mockSql.mockImplementation((...args: any[]) => {
        if (Array.isArray(args[0]) && 'raw' in args[0]) {
          return Promise.resolve(schemas);
        }
        return args[0];
      });

      const result = await driver.listSchemas(false);

      expect(result).toHaveLength(1);
      expect(result[0].schemaName).toBe('public');
    });

    it('should return system schemas when includeSystem is true', async () => {
      const schemas = [
        { schemaName: 'public', owner: 'postgres', tableCount: 5, isSystemSchema: false },
        { schemaName: 'pg_catalog', owner: 'postgres', tableCount: 100, isSystemSchema: true },
      ];
      mockSql.mockImplementation((...args: any[]) => {
        if (Array.isArray(args[0]) && 'raw' in args[0]) {
          return Promise.resolve(schemas);
        }
        return args[0];
      });

      const result = await driver.listSchemas(true);

      expect(result).toHaveLength(2);
    });
  });

  describe('listTables', () => {
    it('should return tables', async () => {
      const tables = [
        { schema: 'public', table: 'users', rowCount: 100, type: 'USER_TABLE' },
      ];
      mockSql.mockImplementation((...args: any[]) => {
        if (Array.isArray(args[0]) && 'raw' in args[0]) {
          return Promise.resolve(tables);
        }
        return args[0];
      });

      const result = await driver.listTables();

      expect(result).toHaveLength(1);
      expect(result[0].table).toBe('users');
    });

    it('should filter by schema when provided', async () => {
      mockSql.mockImplementation((...args: any[]) => {
        if (Array.isArray(args[0]) && 'raw' in args[0]) {
          return Promise.resolve([]);
        }
        return args[0];
      });

      const result = await driver.listTables('public');

      expect(result).toEqual([]);
    });
  });

  describe('describeTable', () => {
    it('should return column details', async () => {
      const columns = [
        {
          columnName: 'id',
          ordinalPosition: 1,
          dataType: 'integer',
          maxLength: null,
          precision: 32,
          scale: 0,
          isNullable: false,
          isPrimaryKey: true,
          isIdentity: true,
          isComputed: false,
          defaultValue: "nextval('users_id_seq'::regclass)",
          description: 'Primary key',
        },
      ];
      mockSql.mockImplementation((...args: any[]) => {
        if (Array.isArray(args[0]) && 'raw' in args[0]) {
          return Promise.resolve(columns);
        }
        return args[0];
      });

      const result = await driver.describeTable('public', 'users');

      expect(result).toHaveLength(1);
      expect(result[0].columnName).toBe('id');
      expect(result[0].isPrimaryKey).toBe(true);
      expect(result[0].dataType).toBe('integer');
    });
  });

  describe('getTableSchema', () => {
    it('should return basic column info', async () => {
      const columns = [
        { column: 'id', dataType: 'integer', maxLength: null, isNullable: false, isPrimaryKey: true },
      ];
      mockSql.mockImplementation((...args: any[]) => {
        if (Array.isArray(args[0]) && 'raw' in args[0]) {
          return Promise.resolve(columns);
        }
        return args[0];
      });

      const result = await driver.getTableSchema('public', 'users');

      expect(result).toHaveLength(1);
      expect(result[0].column).toBe('id');
    });
  });

  describe('getRelationships', () => {
    it('should return outgoing and incoming FKs', async () => {
      let callCount = 0;
      mockSql.mockImplementation((...args: any[]) => {
        if (Array.isArray(args[0]) && 'raw' in args[0]) {
          callCount++;
          if (callCount === 1) {
            // Outgoing
            return Promise.resolve([
              {
                foreignKeyName: 'fk_orders_users',
                referencedSchema: 'public',
                referencedTable: 'users',
                fromColumn: 'user_id',
                toColumn: 'id',
              },
            ]);
          }
          // Incoming
          return Promise.resolve([]);
        }
        return args[0];
      });

      const result = await driver.getRelationships('public', 'orders');

      expect(result.outgoing).toHaveLength(1);
      expect(result.outgoing[0].foreignKeyName).toBe('fk_orders_users');
      expect(result.incoming).toHaveLength(0);
    });
  });

  describe('getIndexes', () => {
    it('should return index information', async () => {
      const indexes = [
        {
          indexName: 'users_pkey',
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
      ];
      mockSql.mockImplementation((...args: any[]) => {
        if (Array.isArray(args[0]) && 'raw' in args[0]) {
          return Promise.resolve(indexes);
        }
        return args[0];
      });

      const result = await driver.getIndexes('public', 'users');

      expect(result).toHaveLength(1);
      expect(result[0].indexName).toBe('users_pkey');
      expect(result[0].keyColumns).toHaveLength(1);
    });
  });

  describe('getDatabaseInfo', () => {
    it('should return database metadata', async () => {
      mockSql.mockImplementation((...args: any[]) => {
        if (Array.isArray(args[0]) && 'raw' in args[0]) {
          return Promise.resolve([
            {
              databaseName: 'testdb',
              serverVersion: 'PostgreSQL 15.4',
              compatibilityLevel: 150004,
            },
          ]);
        }
        return args[0];
      });

      const result = await driver.getDatabaseInfo();

      expect(result.databaseName).toBe('testdb');
      expect(result.serverVersion).toContain('PostgreSQL');
    });
  });

  describe('close', () => {
    it('should close the connection', async () => {
      await driver.close();

      expect(mockSql.end).toHaveBeenCalledWith({ timeout: 5 });
    });

    it('should handle close errors gracefully', async () => {
      mockSql.end.mockRejectedValue(new Error('close error'));

      await expect(driver.close()).resolves.not.toThrow();
    });
  });
});
