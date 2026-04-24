import postgres from 'postgres';
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
 * Convert @paramName style parameters to PostgreSQL $N positional parameters.
 * Returns the converted query string and an ordered array of values.
 */
function convertNamedParams(
  query: string,
  params?: Record<string, any>
): { query: string; values: any[] } {
  if (!params || Object.keys(params).length === 0) {
    return { query, values: [] };
  }

  const values: any[] = [];
  let idx = 0;
  const converted = query.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
    if (name in params) {
      values.push(params[name]);
      idx++;
      return `$${idx}`;
    }
    return `@${name}`;
  });

  return { query: converted, values };
}

/**
 * PostgreSQL implementation of IDatabaseDriver.
 * Uses the `postgres` (porsager) package with tagged template queries
 * for metadata and sql.unsafe() for user-provided queries.
 */
export class PostgresDriver implements IDatabaseDriver {
  readonly dialect = 'postgresql' as const;

  constructor(private sql: postgres.Sql) {}

  async executeQuery(
    query: string,
    params?: Record<string, any>,
    maxRows?: number
  ): Promise<IQueryResult> {
    const limitedQuery = maxRows ? injectRowLimit(this.dialect, query, maxRows) : query;
    const { query: convertedQuery, values } = convertNamedParams(limitedQuery, params);

    try {
      const result = await this.sql.unsafe(convertedQuery, values);
      const columns = result.columns?.map((c: any) => c.name) || [];
      const rowCount = result.length;

      return {
        rows: [...result],
        rowCount,
        columns,
        limited: maxRows ? rowCount >= maxRows : undefined,
      };
    } catch (error) {
      throw createFriendlyError(error);
    }
  }

  async listSchemas(includeSystem: boolean = false): Promise<ISchemaInfo[]> {
    const systemSchemas = ['pg_catalog', 'information_schema', 'pg_toast'];

    try {
      if (includeSystem) {
        const result = await this.sql`
          SELECT
            n.nspname as "schemaName",
            pg_catalog.pg_get_userbyid(n.nspowner) as "owner",
            COUNT(c.relname)::int as "tableCount",
            CASE
              WHEN n.nspname IN ('pg_catalog', 'information_schema', 'pg_toast')
                OR n.nspname LIKE 'pg_temp%'
                OR n.nspname LIKE 'pg_toast_temp%'
              THEN true ELSE false
            END as "isSystemSchema"
          FROM pg_catalog.pg_namespace n
          LEFT JOIN pg_catalog.pg_class c
            ON c.relnamespace = n.oid AND c.relkind = 'r'
          GROUP BY n.nspname, n.nspowner
          ORDER BY n.nspname
        `;
        return result.map((row: any) => ({
          schemaName: row.schemaName,
          owner: row.owner || 'N/A',
          tableCount: row.tableCount || 0,
          isSystemSchema: row.isSystemSchema,
        }));
      } else {
        const result = await this.sql`
          SELECT
            n.nspname as "schemaName",
            pg_catalog.pg_get_userbyid(n.nspowner) as "owner",
            COUNT(c.relname)::int as "tableCount",
            false as "isSystemSchema"
          FROM pg_catalog.pg_namespace n
          LEFT JOIN pg_catalog.pg_class c
            ON c.relnamespace = n.oid AND c.relkind = 'r'
          WHERE n.nspname NOT IN ${this.sql(systemSchemas)}
            AND n.nspname NOT LIKE 'pg_temp%'
            AND n.nspname NOT LIKE 'pg_toast%'
          GROUP BY n.nspname, n.nspowner
          ORDER BY n.nspname
        `;
        return result.map((row: any) => ({
          schemaName: row.schemaName,
          owner: row.owner || 'N/A',
          tableCount: row.tableCount || 0,
          isSystemSchema: false,
        }));
      }
    } catch (error) {
      throw createFriendlyError(error);
    }
  }

  async listTables(schemaFilter?: string): Promise<ITableInfo[]> {
    try {
      if (schemaFilter) {
        const result = await this.sql`
          SELECT
            schemaname as "schema",
            relname as "table",
            COALESCE(n_live_tup, 0)::int as "rowCount",
            'USER_TABLE' as "type"
          FROM pg_catalog.pg_stat_user_tables
          WHERE schemaname = ${schemaFilter}
          ORDER BY schemaname, relname
        `;
        return [...result] as unknown as ITableInfo[];
      } else {
        const result = await this.sql`
          SELECT
            schemaname as "schema",
            relname as "table",
            COALESCE(n_live_tup, 0)::int as "rowCount",
            'USER_TABLE' as "type"
          FROM pg_catalog.pg_stat_user_tables
          ORDER BY schemaname, relname
        `;
        return [...result] as unknown as ITableInfo[];
      }
    } catch (error) {
      throw createFriendlyError(error);
    }
  }

  async describeTable(schemaName: string, tableName: string): Promise<IColumnInfo[]> {
    try {
      const result = await this.sql`
        SELECT
          c.column_name as "columnName",
          c.ordinal_position as "ordinalPosition",
          c.data_type as "dataType",
          c.character_maximum_length as "maxLength",
          c.numeric_precision as "precision",
          c.numeric_scale as "scale",
          (c.is_nullable = 'YES') as "isNullable",
          COALESCE(
            (SELECT true FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name
               AND tc.table_schema = kcu.table_schema
             WHERE tc.constraint_type = 'PRIMARY KEY'
               AND tc.table_schema = c.table_schema
               AND tc.table_name = c.table_name
               AND kcu.column_name = c.column_name),
            false
          ) as "isPrimaryKey",
          COALESCE(pg_get_serial_sequence(c.table_schema || '.' || c.table_name, c.column_name) IS NOT NULL, false) as "isIdentity",
          (c.is_generated = 'ALWAYS') as "isComputed",
          c.column_default as "defaultValue",
          pgd.description as "description"
        FROM information_schema.columns c
        LEFT JOIN pg_catalog.pg_statio_all_tables st
          ON st.schemaname = c.table_schema AND st.relname = c.table_name
        LEFT JOIN pg_catalog.pg_description pgd
          ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
        WHERE c.table_schema = ${schemaName}
          AND c.table_name = ${tableName}
        ORDER BY c.ordinal_position
      `;
      return result.map((row: any) => ({
        columnName: row.columnName,
        ordinalPosition: row.ordinalPosition,
        dataType: row.dataType,
        maxLength: row.maxLength,
        precision: row.precision,
        scale: row.scale,
        isNullable: row.isNullable,
        isPrimaryKey: row.isPrimaryKey,
        isIdentity: row.isIdentity,
        isComputed: row.isComputed,
        defaultValue: row.defaultValue,
        description: row.description,
      }));
    } catch (error) {
      throw createFriendlyError(error);
    }
  }

  async getTableSchema(schemaName: string, tableName: string): Promise<IColumnBasicInfo[]> {
    try {
      const result = await this.sql`
        SELECT
          c.column_name as "column",
          c.data_type as "dataType",
          c.character_maximum_length as "maxLength",
          (c.is_nullable = 'YES') as "isNullable",
          COALESCE(
            (SELECT true FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name
               AND tc.table_schema = kcu.table_schema
             WHERE tc.constraint_type = 'PRIMARY KEY'
               AND tc.table_schema = c.table_schema
               AND tc.table_name = c.table_name
               AND kcu.column_name = c.column_name),
            false
          ) as "isPrimaryKey"
        FROM information_schema.columns c
        WHERE c.table_schema = ${schemaName}
          AND c.table_name = ${tableName}
        ORDER BY c.ordinal_position
      `;
      return [...result] as unknown as IColumnBasicInfo[];
    } catch (error) {
      throw createFriendlyError(error);
    }
  }

  async getRelationships(schemaName: string, tableName: string): Promise<IRelationships> {
    try {
      // Outgoing: this table's FKs referencing other tables
      const outgoingResult = await this.sql`
        SELECT
          tc.constraint_name as "foreignKeyName",
          ccu.table_schema as "referencedSchema",
          ccu.table_name as "referencedTable",
          kcu.column_name as "fromColumn",
          ccu.column_name as "toColumn"
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = ${schemaName}
          AND tc.table_name = ${tableName}
        ORDER BY tc.constraint_name, kcu.ordinal_position
      `;

      // Incoming: other tables' FKs referencing this table
      const incomingResult = await this.sql`
        SELECT
          tc.constraint_name as "foreignKeyName",
          tc.table_schema as "referencingSchema",
          tc.table_name as "referencingTable",
          kcu.column_name as "fromColumn",
          ccu.column_name as "toColumn"
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_schema = ${schemaName}
          AND ccu.table_name = ${tableName}
        ORDER BY tc.constraint_name, kcu.ordinal_position
      `;

      // Group outgoing
      const outgoingMap = new Map<string, {
        foreignKeyName: string;
        referencedSchema: string;
        referencedTable: string;
        columns: Array<{ fromColumn: string; toColumn: string }>;
      }>();
      for (const row of outgoingResult) {
        const r = row as any;
        if (!outgoingMap.has(r.foreignKeyName)) {
          outgoingMap.set(r.foreignKeyName, {
            foreignKeyName: r.foreignKeyName,
            referencedSchema: r.referencedSchema,
            referencedTable: r.referencedTable,
            columns: [],
          });
        }
        outgoingMap.get(r.foreignKeyName)!.columns.push({
          fromColumn: r.fromColumn,
          toColumn: r.toColumn,
        });
      }

      // Group incoming
      const incomingMap = new Map<string, {
        foreignKeyName: string;
        referencingSchema: string;
        referencingTable: string;
        columns: Array<{ fromColumn: string; toColumn: string }>;
      }>();
      for (const row of incomingResult) {
        const r = row as any;
        if (!incomingMap.has(r.foreignKeyName)) {
          incomingMap.set(r.foreignKeyName, {
            foreignKeyName: r.foreignKeyName,
            referencingSchema: r.referencingSchema,
            referencingTable: r.referencingTable,
            columns: [],
          });
        }
        incomingMap.get(r.foreignKeyName)!.columns.push({
          fromColumn: r.fromColumn,
          toColumn: r.toColumn,
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
    try {
      const result = await this.sql`
        SELECT
          i.relname as "indexName",
          CASE
            WHEN ix.indisclustered THEN 'CLUSTERED'
            ELSE 'NONCLUSTERED'
          END as "type",
          ix.indisunique as "isUnique",
          ix.indisprimary as "isPrimaryKey",
          CASE WHEN con.contype = 'u' THEN true ELSE false END as "isUniqueConstraint",
          NOT ix.indisvalid as "isDisabled",
          pg_get_expr(ix.indpred, ix.indrelid) as "filterDefinition",
          a.attname as "columnName",
          CASE WHEN ix.indoption[array_position(ix.indkey, a.attnum) - 1] & 1 = 1
            THEN true ELSE false END as "isDescending",
          array_position(ix.indkey, a.attnum) as "keyOrdinal",
          false as "isIncluded"
        FROM pg_catalog.pg_index ix
        JOIN pg_catalog.pg_class t ON t.oid = ix.indrelid
        JOIN pg_catalog.pg_class i ON i.oid = ix.indexrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        LEFT JOIN pg_catalog.pg_constraint con
          ON con.conindid = ix.indexrelid
        WHERE n.nspname = ${schemaName}
          AND t.relname = ${tableName}
        ORDER BY i.relname, array_position(ix.indkey, a.attnum)
      `;

      // Group by index name
      const indexMap = new Map<string, IIndexInfo>();
      for (const row of result) {
        const r = row as any;
        if (!indexMap.has(r.indexName)) {
          indexMap.set(r.indexName, {
            indexName: r.indexName,
            type: r.type,
            isUnique: r.isUnique,
            isPrimaryKey: r.isPrimaryKey,
            isUniqueConstraint: r.isUniqueConstraint,
            isDisabled: r.isDisabled,
            filterDefinition: r.filterDefinition || null,
            keyColumns: [],
            includedColumns: [],
          });
        }

        const index = indexMap.get(r.indexName)!;
        if (r.columnName) {
          if (r.isIncluded) {
            index.includedColumns.push(r.columnName);
          } else {
            index.keyColumns.push({
              columnName: r.columnName,
              isDescending: r.isDescending,
              keyOrdinal: r.keyOrdinal,
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
    try {
      const result = await this.sql`
        SELECT
          current_database() as "databaseName",
          version() as "serverVersion",
          current_setting('server_version_num')::int as "compatibilityLevel"
      `;
      return result[0] as IDatabaseInfo;
    } catch (error) {
      throw createFriendlyError(error);
    }
  }

  async close(): Promise<void> {
    try {
      await this.sql.end({ timeout: 5 });
    } catch (error) {
      console.error('Error closing PostgreSQL connection:', error);
    }
  }
}
