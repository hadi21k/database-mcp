/**
 * Standardized query result returned by all database drivers
 */
export interface IQueryResult {
  rows: any[];
  rowCount: number;
  columns: string[];
  limited?: boolean;
}

/**
 * Schema information returned by listSchemas()
 */
export interface ISchemaInfo {
  schemaName: string;
  owner: string;
  tableCount: number;
  isSystemSchema: boolean;
}

/**
 * Table information returned by listTables()
 */
export interface ITableInfo {
  schema: string;
  table: string;
  rowCount: number;
  type: string;
}

/**
 * Detailed column information returned by describeTable()
 */
export interface IColumnInfo {
  columnName: string;
  ordinalPosition: number;
  dataType: string;
  maxLength: number | null;
  precision: number | null;
  scale: number | null;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isIdentity: boolean;
  isComputed: boolean;
  defaultValue: string | null;
  description: string | null;
}

/**
 * Basic column information returned by getTableSchema()
 */
export interface IColumnBasicInfo {
  column: string;
  dataType: string;
  maxLength: number | null;
  isNullable: boolean;
  isPrimaryKey: boolean;
}

/**
 * Foreign key relationships returned by getRelationships()
 */
export interface IRelationships {
  outgoing: Array<{
    foreignKeyName: string;
    referencedSchema: string;
    referencedTable: string;
    columns: Array<{ fromColumn: string; toColumn: string }>;
  }>;
  incoming: Array<{
    foreignKeyName: string;
    referencingSchema: string;
    referencingTable: string;
    columns: Array<{ fromColumn: string; toColumn: string }>;
  }>;
}

/**
 * Index information returned by getIndexes()
 */
export interface IIndexInfo {
  indexName: string;
  type: string;
  isUnique: boolean;
  isPrimaryKey: boolean;
  isUniqueConstraint: boolean;
  isDisabled: boolean;
  filterDefinition: string | null;
  keyColumns: Array<{ columnName: string; isDescending: boolean; keyOrdinal: number }>;
  includedColumns: string[];
}

/**
 * Database metadata returned by getDatabaseInfo()
 */
export interface IDatabaseInfo {
  databaseName: string;
  serverVersion: string;
  compatibilityLevel: number;
}

/**
 * Database driver interface — abstracts all database-specific operations.
 * Each database type (SQL Server, PostgreSQL, etc.) implements this interface
 * with its own SQL dialect and driver package.
 */
export interface IDatabaseDriver {
  readonly dialect: 'sqlserver' | 'postgresql';

  /**
   * Execute a query with optional parameters and row limiting.
   * The driver applies dialect-specific row limiting (TOP for SQL Server, LIMIT for PostgreSQL).
   */
  executeQuery(query: string, params?: Record<string, any>, maxRows?: number): Promise<IQueryResult>;

  /** List schemas in the database */
  listSchemas(includeSystem?: boolean): Promise<ISchemaInfo[]>;

  /** List tables, optionally filtered by schema */
  listTables(schema?: string): Promise<ITableInfo[]>;

  /** Get detailed column information for a table */
  describeTable(schema: string, table: string): Promise<IColumnInfo[]>;

  /** Get basic column information for a table (used by resources) */
  getTableSchema(schema: string, table: string): Promise<IColumnBasicInfo[]>;

  /** Get foreign key relationships (outgoing and incoming) */
  getRelationships(schema: string, table: string): Promise<IRelationships>;

  /** Get index information for a table */
  getIndexes(schema: string, table: string): Promise<IIndexInfo[]>;

  /** Get database metadata (name, version, compatibility) */
  getDatabaseInfo(): Promise<IDatabaseInfo>;

  /** Close the underlying connection/pool */
  close(): Promise<void>;
}
