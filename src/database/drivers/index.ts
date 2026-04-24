import { ConnectionPool } from 'mssql';
import type postgres from 'postgres';
import type { IDatabaseDriver } from '../interfaces/database-driver.js';
import { SqlServerDriver } from './sqlserver.driver.js';
import { PostgresDriver } from './postgres.driver.js';

/**
 * Create a database driver for the given database type and connection.
 * - SQL Server: pass an mssql ConnectionPool
 * - PostgreSQL: pass a postgres Sql instance
 */
export function createDriver(type: 'sqlserver' | 'postgresql', connection: any): IDatabaseDriver {
  switch (type) {
    case 'sqlserver':
      return new SqlServerDriver(connection as ConnectionPool);
    case 'postgresql':
      return new PostgresDriver(connection as postgres.Sql);
    default:
      throw new Error(`Unsupported database type: ${type}`);
  }
}

export { SqlServerDriver } from './sqlserver.driver.js';
export { PostgresDriver } from './postgres.driver.js';
