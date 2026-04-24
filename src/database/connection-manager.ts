import sql, { ConnectionPool } from 'mssql';
import postgres from 'postgres';
import { ConnectionProfile, toMssqlConfig } from '../config/types.js';
import { createDriver } from './drivers/index.js';
import type { IDatabaseDriver } from './interfaces/database-driver.js';

/**
 * Manages database connection pools and drivers for multiple profiles.
 * Returns IDatabaseDriver instances that abstract the underlying database engine.
 */
export class ConnectionManager {
  private pools: Map<string, ConnectionPool> = new Map();
  private drivers: Map<string, IDatabaseDriver> = new Map();
  private profiles: Map<string, ConnectionProfile> = new Map();

  /**
   * Add a connection profile
   */
  addProfile(name: string, profile: ConnectionProfile): void {
    this.profiles.set(name, profile);
  }

  /**
   * Get a database driver for a profile (creates connection and driver if needed).
   * This is the primary way tools and resources access the database.
   */
  async getDriver(profileName: string): Promise<IDatabaseDriver> {
    const existingDriver = this.drivers.get(profileName);
    if (existingDriver) {
      return existingDriver;
    }

    const profile = this.profiles.get(profileName);
    if (!profile) {
      throw new Error(`Unknown connection profile: ${profileName}`);
    }

    const dbType = profile.databaseType || 'sqlserver';
    let driver: IDatabaseDriver;

    if (dbType === 'postgresql') {
      const pgSql = this.createPostgresConnection(profile);
      driver = createDriver('postgresql', pgSql);
    } else {
      const pool = await this.getPool(profileName);
      driver = createDriver('sqlserver', pool);
    }

    this.drivers.set(profileName, driver);
    return driver;
  }

  /**
   * Create a postgres connection from a profile.
   */
  private createPostgresConnection(profile: ConnectionProfile): postgres.Sql {
    if (profile.connectionString) {
      return postgres(profile.connectionString, {
        max: 10,
        idle_timeout: 30,
        connect_timeout: 15,
        ...(profile.pgOptions?.application_name && {
          connection: { application_name: profile.pgOptions.application_name },
        }),
      });
    }

    const connectionOpts: postgres.Options<Record<string, postgres.PostgresType>> = {
      host: profile.server,
      port: profile.port || 5432,
      database: profile.database,
      username: profile.user,
      password: profile.password,
      max: 10,
      idle_timeout: 30,
      connect_timeout: 15,
    };

    // SSL configuration
    if (profile.pgOptions?.ssl !== undefined) {
      if (typeof profile.pgOptions.ssl === 'boolean') {
        connectionOpts.ssl = profile.pgOptions.ssl;
      } else {
        connectionOpts.ssl = profile.pgOptions.ssl;
      }
    }

    // Runtime parameters
    const connectionParams: Record<string, string> = {};
    if (profile.pgOptions?.application_name) {
      connectionParams.application_name = profile.pgOptions.application_name;
    }
    if (profile.pgOptions?.statement_timeout) {
      connectionParams.statement_timeout = String(profile.pgOptions.statement_timeout);
    }
    if (Object.keys(connectionParams).length > 0) {
      connectionOpts.connection = connectionParams;
    }

    return postgres(connectionOpts);
  }

  /**
   * Get a connection pool for a SQL Server profile (creates if doesn't exist).
   * Used internally by getDriver() for SQL Server profiles.
   */
  async getPool(profileName: string): Promise<ConnectionPool> {
    // Return existing pool if available
    const existingPool = this.pools.get(profileName);
    if (existingPool) {
      if (existingPool.connected) {
        return existingPool;
      }
      this.pools.delete(profileName);
      this.drivers.delete(profileName);
    }

    const profile = this.profiles.get(profileName);
    if (!profile) {
      throw new Error(`Unknown connection profile: ${profileName}`);
    }

    const config = toMssqlConfig(profile);
    const pool = new sql.ConnectionPool(config);

    try {
      await pool.connect();
      this.pools.set(profileName, pool);
      return pool;
    } catch (error) {
      throw new Error(
        `Failed to connect to profile "${profileName}": ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Test connection to a profile
   */
  async testConnection(profileName: string): Promise<boolean> {
    try {
      const driver = await this.getDriver(profileName);
      const result = await driver.executeQuery('SELECT 1 as test');
      return result.rowCount > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get list of available profile names
   */
  getProfileNames(): string[] {
    return Array.from(this.profiles.keys());
  }

  /**
   * Check if a profile exists
   */
  hasProfile(profileName: string): boolean {
    return this.profiles.has(profileName);
  }

  /**
   * Close all connections
   */
  async closeAll(): Promise<void> {
    // Close all drivers (handles both SQL Server and PostgreSQL)
    const closePromises = Array.from(this.drivers.values()).map(async (driver) => {
      try {
        await driver.close();
      } catch (error) {
        console.error('Error closing driver:', error);
      }
    });
    await Promise.all(closePromises);
    this.drivers.clear();
    this.pools.clear();
  }

  /**
   * Close a specific connection
   */
  async closePool(profileName: string): Promise<void> {
    const driver = this.drivers.get(profileName);
    if (driver) {
      try {
        await driver.close();
      } catch (error) {
        console.error(`Error closing connection "${profileName}":`, error);
      }
      this.drivers.delete(profileName);
    }
    this.pools.delete(profileName);
  }
}
