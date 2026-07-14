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
  // Memoizes in-flight driver creation so two concurrent getDriver() calls for a
  // cold profile share one connection attempt instead of racing (which would
  // orphan a pool).
  private driverInits: Map<string, Promise<IDatabaseDriver>> = new Map();

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
    const profile = this.profiles.get(profileName);
    if (!profile) {
      throw new Error(`Unknown connection profile: ${profileName}`);
    }

    const dbType = profile.databaseType || 'sqlserver';

    // Return a cached driver only if it is still usable. For SQL Server, if the
    // pool has been closed (pool.connected === false) evict the stale
    // driver/pool so we reconnect instead of handing back a dead pool. (Note:
    // mssql only flips pool.connected on an explicit close, not on a silent TCP
    // drop; true liveness would need a probe query, which we avoid for latency.)
    // porsager (PostgreSQL) reconnects internally, so a cached PG driver is fine.
    const cached = this.drivers.get(profileName);
    if (cached) {
      if (dbType !== 'sqlserver') {
        return cached;
      }
      const pool = this.pools.get(profileName);
      if (pool?.connected) {
        return cached;
      }
      this.drivers.delete(profileName);
      this.pools.delete(profileName);
      if (pool) {
        pool.close().catch(() => {}); // best-effort cleanup of the dead socket
      }
    }

    // Coalesce concurrent initialization for the same profile.
    const inFlight = this.driverInits.get(profileName);
    if (inFlight) {
      return inFlight;
    }

    const init = (async () => {
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
    })();

    this.driverInits.set(profileName, init);
    try {
      return await init;
    } finally {
      this.driverInits.delete(profileName);
    }
  }

  /**
   * Create a postgres connection from a profile.
   */
  private createPostgresConnection(profile: ConnectionProfile): postgres.Sql {
    if (profile.connectionString) {
      const connectionParams: Record<string, string> = {};
      if (profile.pgOptions?.application_name) {
        connectionParams.application_name = profile.pgOptions.application_name;
      }
      if (profile.pgOptions?.statement_timeout) {
        connectionParams.statement_timeout = String(profile.pgOptions.statement_timeout);
      }

      return postgres(profile.connectionString, {
        max: 10,
        idle_timeout: 30,
        connect_timeout: 15,
        ...(profile.pgOptions?.ssl !== undefined && { ssl: profile.pgOptions.ssl }),
        ...(Object.keys(connectionParams).length > 0 && { connection: connectionParams }),
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
      existingPool.close().catch(() => {}); // release the dead socket
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
    } catch {
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
    this.driverInits.clear();
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
