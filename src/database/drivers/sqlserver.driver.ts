import { ConnectionPool } from 'mssql';
import sql from 'mssql';
import { createFriendlyError } from '../../utils/error-handler.js';
import { injectRowLimit } from '../../utils/validation.js';
import type {
  IDatabaseDriver,
  IQueryResult,
  ISchemaInfo,
  ITableInfo,
  IColumnInfo,
  IColumnBasicInfo,
  IRelationships,
  IIndexInfo,
  IDatabaseInfo,
} from '../interfaces/database-driver.js';

/**
 * SQL Server implementation of IDatabaseDriver.
 * Wraps an mssql ConnectionPool and implements all metadata queries
 * using SQL Server system views (sys.*).
 */
export class SqlServerDriver implements IDatabaseDriver {
  readonly dialect = 'sqlserver' as const;

  constructor(private pool: ConnectionPool) {}

  async executeQuery(
    query: string,
    params?: Record<string, any>,
    maxRows?: number
  ): Promise<IQueryResult> {
    const limitedQuery = maxRows ? injectRowLimit(this.dialect, query, maxRows) : query;

    try {
      const request = this.pool.request();
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          request.input(key, value);
        }
      }

      const result = await request.query(limitedQuery);
      const columns = result.recordset.columns
        ? Object.keys(result.recordset.columns)
        : [];
      const rowCount = result.recordset?.length || 0;

      return {
        rows: result.recordset || [],
        rowCount,
        columns,
        limited: maxRows ? rowCount >= maxRows : undefined,
      };
    } catch (error) {
      throw createFriendlyError(error);
    }
  }

  async listSchemas(includeSystem: boolean = false): Promise<ISchemaInfo[]> {
    const whereClause = includeSystem
      ? '1=1'
      : `s.name NOT IN ('guest', 'INFORMATION_SCHEMA', 'sys', 'db_owner', 'db_accessadmin',
                        'db_securityadmin', 'db_ddladmin', 'db_backupoperator', 'db_datareader',
                        'db_datawriter', 'db_denydatareader', 'db_denydatawriter')
         AND s.principal_id IS NOT NULL`;

    const query = `
      SELECT
        s.name as schemaName,
        ISNULL(USER_NAME(s.principal_id), '') as owner,
        COUNT(DISTINCT t.object_id) as tableCount,
        CASE
          WHEN s.name IN ('dbo', 'guest', 'INFORMATION_SCHEMA', 'sys', 'db_owner', 'db_accessadmin',
                         'db_securityadmin', 'db_ddladmin', 'db_backupoperator', 'db_datareader',
                         'db_datawriter', 'db_denydatareader', 'db_denydatawriter')
          OR s.principal_id IS NULL
          THEN 1
          ELSE 0
        END as isSystemSchema
      FROM sys.schemas s
      LEFT JOIN sys.tables t ON s.schema_id = t.schema_id AND t.is_ms_shipped = 0
      WHERE ${whereClause}
      GROUP BY s.name, s.principal_id
      ORDER BY s.name
    `;

    try {
      const result = await this.pool.request().query(query);
      return (result.recordset || []).map((row: any) => ({
        schemaName: row.schemaName,
        owner: row.owner || 'N/A',
        tableCount: row.tableCount || 0,
        isSystemSchema: row.isSystemSchema === 1,
      }));
    } catch (error) {
      throw createFriendlyError(error);
    }
  }

  async listTables(schemaFilter?: string): Promise<ITableInfo[]> {
    const query = `
      SELECT
        s.name as [schema],
        t.name as [table],
        ISNULL(SUM(p.rows), 0) as [rowCount],
        t.type_desc as [type]
      FROM sys.tables t
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      LEFT JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
      WHERE t.is_ms_shipped = 0
        ${schemaFilter ? 'AND s.name = @schemaFilter' : ''}
      GROUP BY s.name, t.name, t.type_desc
      ORDER BY s.name, t.name
    `;

    try {
      const request = this.pool.request();
      if (schemaFilter) {
        request.input('schemaFilter', sql.VarChar, schemaFilter);
      }
      const result = await request.query(query);
      return result.recordset || [];
    } catch (error) {
      throw createFriendlyError(error);
    }
  }

  async describeTable(schemaName: string, tableName: string): Promise<IColumnInfo[]> {
    const query = `
      SELECT
        c.name as columnName,
        c.column_id as ordinalPosition,
        TYPE_NAME(c.user_type_id) as dataType,
        CASE
          WHEN TYPE_NAME(c.user_type_id) IN ('nchar', 'nvarchar') THEN c.max_length / 2
          WHEN TYPE_NAME(c.user_type_id) IN ('char', 'varchar', 'binary', 'varbinary') THEN c.max_length
          ELSE NULL
        END as maxLength,
        c.precision as [precision],
        c.scale as scale,
        c.is_nullable as isNullable,
        CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END as isPrimaryKey,
        c.is_identity as isIdentity,
        c.is_computed as isComputed,
        dc.definition as defaultValue,
        ep.value as [description]
      FROM sys.columns c
      INNER JOIN sys.tables tb ON c.object_id = tb.object_id
      INNER JOIN sys.schemas s ON tb.schema_id = s.schema_id
      LEFT JOIN (
        SELECT ic.object_id, ic.column_id
        FROM sys.index_columns ic
        INNER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
        WHERE i.is_primary_key = 1
      ) pk ON c.object_id = pk.object_id AND c.column_id = pk.column_id
      LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
      LEFT JOIN sys.extended_properties ep ON ep.major_id = c.object_id AND ep.minor_id = c.column_id AND ep.name = 'MS_Description'
      WHERE s.name = @schema AND tb.name = @table
      ORDER BY c.column_id
    `;

    try {
      const result = await this.pool
        .request()
        .input('schema', sql.VarChar, schemaName)
        .input('table', sql.VarChar, tableName)
        .query(query);
      return result.recordset || [];
    } catch (error) {
      throw createFriendlyError(error);
    }
  }

  async getTableSchema(schemaName: string, tableName: string): Promise<IColumnBasicInfo[]> {
    const query = `
      SELECT
        c.name as [column],
        t.name as dataType,
        c.max_length as maxLength,
        c.is_nullable as isNullable,
        CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END as isPrimaryKey
      FROM sys.columns c
      INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
      INNER JOIN sys.tables tb ON c.object_id = tb.object_id
      INNER JOIN sys.schemas s ON tb.schema_id = s.schema_id
      LEFT JOIN (
        SELECT ic.object_id, ic.column_id
        FROM sys.index_columns ic
        INNER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
        WHERE i.is_primary_key = 1
      ) pk ON c.object_id = pk.object_id AND c.column_id = pk.column_id
      WHERE s.name = @schema AND tb.name = @table
      ORDER BY c.column_id
    `;

    try {
      const result = await this.pool
        .request()
        .input('schema', sql.VarChar, schemaName)
        .input('table', sql.VarChar, tableName)
        .query(query);
      return result.recordset || [];
    } catch (error) {
      throw createFriendlyError(error);
    }
  }

  async getRelationships(schemaName: string, tableName: string): Promise<IRelationships> {
    const outgoingQuery = `
      SELECT
        fk.name as foreignKeyName,
        SCHEMA_NAME(ref_t.schema_id) as referencedSchema,
        ref_t.name as referencedTable,
        col.name as fromColumn,
        ref_col.name as toColumn
      FROM sys.foreign_keys fk
      INNER JOIN sys.tables t ON fk.parent_object_id = t.object_id
      INNER JOIN sys.tables ref_t ON fk.referenced_object_id = ref_t.object_id
      INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
      INNER JOIN sys.columns col ON fkc.parent_object_id = col.object_id AND fkc.parent_column_id = col.column_id
      INNER JOIN sys.columns ref_col ON fkc.referenced_object_id = ref_col.object_id AND fkc.referenced_column_id = ref_col.column_id
      WHERE SCHEMA_NAME(t.schema_id) = @schema
        AND t.name = @table
      ORDER BY fk.name, fkc.constraint_column_id
    `;

    const incomingQuery = `
      SELECT
        fk.name as foreignKeyName,
        SCHEMA_NAME(t.schema_id) as referencingSchema,
        t.name as referencingTable,
        col.name as fromColumn,
        ref_col.name as toColumn
      FROM sys.foreign_keys fk
      INNER JOIN sys.tables t ON fk.parent_object_id = t.object_id
      INNER JOIN sys.tables ref_t ON fk.referenced_object_id = ref_t.object_id
      INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
      INNER JOIN sys.columns col ON fkc.parent_object_id = col.object_id AND fkc.parent_column_id = col.column_id
      INNER JOIN sys.columns ref_col ON fkc.referenced_object_id = ref_col.object_id AND fkc.referenced_column_id = ref_col.column_id
      WHERE SCHEMA_NAME(ref_t.schema_id) = @schema
        AND ref_t.name = @table
      ORDER BY fk.name, fkc.constraint_column_id
    `;

    try {
      const [outgoingResult, incomingResult] = await Promise.all([
        this.pool.request()
          .input('schema', sql.VarChar, schemaName)
          .input('table', sql.VarChar, tableName)
          .query(outgoingQuery),
        this.pool.request()
          .input('schema', sql.VarChar, schemaName)
          .input('table', sql.VarChar, tableName)
          .query(incomingQuery),
      ]);

      // Group outgoing relationships by foreign key name
      const outgoingMap = new Map<string, {
        foreignKeyName: string;
        referencedSchema: string;
        referencedTable: string;
        columns: Array<{ fromColumn: string; toColumn: string }>;
      }>();

      for (const row of outgoingResult.recordset) {
        if (!outgoingMap.has(row.foreignKeyName)) {
          outgoingMap.set(row.foreignKeyName, {
            foreignKeyName: row.foreignKeyName,
            referencedSchema: row.referencedSchema,
            referencedTable: row.referencedTable,
            columns: [],
          });
        }
        outgoingMap.get(row.foreignKeyName)!.columns.push({
          fromColumn: row.fromColumn,
          toColumn: row.toColumn,
        });
      }

      // Group incoming relationships by foreign key name
      const incomingMap = new Map<string, {
        foreignKeyName: string;
        referencingSchema: string;
        referencingTable: string;
        columns: Array<{ fromColumn: string; toColumn: string }>;
      }>();

      for (const row of incomingResult.recordset) {
        if (!incomingMap.has(row.foreignKeyName)) {
          incomingMap.set(row.foreignKeyName, {
            foreignKeyName: row.foreignKeyName,
            referencingSchema: row.referencingSchema,
            referencingTable: row.referencingTable,
            columns: [],
          });
        }
        incomingMap.get(row.foreignKeyName)!.columns.push({
          fromColumn: row.fromColumn,
          toColumn: row.toColumn,
        });
      }

      return {
        outgoing: Array.from(outgoingMap.values()),
        incoming: Array.from(incomingMap.values()),
      };
    } catch (error) {
      throw createFriendlyError(error);
    }
  }

  async getIndexes(schemaName: string, tableName: string): Promise<IIndexInfo[]> {
    const query = `
      SELECT
        i.name as indexName,
        i.type_desc as [type],
        i.is_unique as isUnique,
        i.is_primary_key as isPrimaryKey,
        i.is_unique_constraint as isUniqueConstraint,
        i.is_disabled as isDisabled,
        i.filter_definition as filterDefinition,
        c.name as columnName,
        ic.is_descending_key as isDescending,
        ic.key_ordinal as keyOrdinal,
        ic.is_included_column as isIncluded
      FROM sys.indexes i
      INNER JOIN sys.tables t ON i.object_id = t.object_id
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      LEFT JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
      LEFT JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      WHERE s.name = @schema
        AND t.name = @table
        AND i.type > 0  -- Exclude heaps (type = 0)
      ORDER BY i.name, ic.key_ordinal, ic.index_column_id
    `;

    try {
      const result = await this.pool
        .request()
        .input('schema', sql.VarChar, schemaName)
        .input('table', sql.VarChar, tableName)
        .query(query);

      // Group by index name
      const indexMap = new Map<string, IIndexInfo>();

      for (const row of result.recordset) {
        if (!indexMap.has(row.indexName)) {
          indexMap.set(row.indexName, {
            indexName: row.indexName,
            type: row.type,
            isUnique: row.isUnique,
            isPrimaryKey: row.isPrimaryKey,
            isUniqueConstraint: row.isUniqueConstraint,
            isDisabled: row.isDisabled,
            filterDefinition: row.filterDefinition || null,
            keyColumns: [],
            includedColumns: [],
          });
        }

        const index = indexMap.get(row.indexName)!;

        if (row.columnName) {
          if (row.isIncluded) {
            index.includedColumns.push(row.columnName);
          } else if (row.keyOrdinal > 0) {
            index.keyColumns.push({
              columnName: row.columnName,
              isDescending: row.isDescending,
              keyOrdinal: row.keyOrdinal,
            });
          }
        }
      }

      // Sort key columns by ordinal
      for (const index of indexMap.values()) {
        index.keyColumns.sort((a, b) => a.keyOrdinal - b.keyOrdinal);
      }

      return Array.from(indexMap.values());
    } catch (error) {
      throw createFriendlyError(error);
    }
  }

  async getDatabaseInfo(): Promise<IDatabaseInfo> {
    const query = `
      SELECT
        DB_NAME() as databaseName,
        @@VERSION as serverVersion,
        compatibility_level as compatibilityLevel
      FROM sys.databases
      WHERE name = DB_NAME()
    `;

    try {
      const result = await this.pool.request().query(query);
      return result.recordset[0];
    } catch (error) {
      throw createFriendlyError(error);
    }
  }

  async close(): Promise<void> {
    try {
      await this.pool.close();
    } catch (error) {
      console.error('Error closing SQL Server pool:', error);
    }
  }
}
