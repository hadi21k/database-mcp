import sql, { ConnectionPool } from 'mssql';
import { ConnectionProfile, toMssqlConfig } from '../config/types.js';

/**
 * Manages SQL Server connection pools for multiple profiles
 */
export class ConnectionManager {
  private pools: Map<string, ConnectionPool> = new Map();
  private profiles: Map<string, ConnectionProfile> = new Map();

  /**
   * Add a connection profile
   */
  addProfile(name: string, profile: ConnectionProfile): void {
    this.profiles.set(name, profile);
  }

  /**
   * Get a connection pool for a profile (creates if doesn't exist)
   */
  async getPool(profileName: string): Promise<ConnectionPool> {
    // Return existing pool if available
    const existingPool = this.pools.get(profileName);
    if (existingPool) {
      // Check if pool is connected
      if (existingPool.connected) {
        return existingPool;
      }
      // Pool exists but not connected, remove and recreate
      this.pools.delete(profileName);
    }

    // Get profile configuration
    const profile = this.profiles.get(profileName);
    if (!profile) {
      throw new Error(`Unknown connection profile: ${profileName}`);
    }

    // Create new pool
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
      const pool = await this.getPool(profileName);
      const result = await pool.request().query('SELECT 1 as test');
      return result.recordset.length > 0;
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
   * Close all connection pools
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.pools.values()).map(async (pool) => {
      try {
        await pool.close();
      } catch (error) {
        // Ignore errors during shutdown
        console.error('Error closing pool:', error);
      }
    });

    await Promise.all(closePromises);
    this.pools.clear();
  }

  /**
   * Close a specific connection pool
   */
  async closePool(profileName: string): Promise<void> {
    const pool = this.pools.get(profileName);
    if (pool) {
      try {
        await pool.close();
      } catch (error) {
        console.error(`Error closing pool "${profileName}":`, error);
      }
      this.pools.delete(profileName);
    }
  }
}
