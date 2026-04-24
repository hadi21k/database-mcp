import { config as mssqlConfig } from 'mssql';

/**
 * Supported database types
 */
export type DatabaseType = 'sqlserver' | 'postgresql';

/**
 * Connection profile configuration
 */
export interface ConnectionProfile {
  databaseType?: DatabaseType; // defaults to 'sqlserver'
  server: string;
  database: string;
  user: string;
  password: string;
  port?: number;
  // SQL Server-specific options
  options?: {
    encrypt?: boolean;
    trustServerCertificate?: boolean;
    applicationIntent?: 'ReadOnly' | 'ReadWrite';
    requestTimeout?: number;
    connectionTimeout?: number;
  };
  // PostgreSQL-specific options
  pgOptions?: {
    ssl?: boolean | { rejectUnauthorized?: boolean };
    statement_timeout?: number;
    application_name?: string;
  };
  // Connection string (alternative to structured config, primarily for PostgreSQL)
  connectionString?: string;
}

/**
 * Map of profile names to connection configurations
 */
export interface ConnectionProfiles {
  [profileName: string]: ConnectionProfile;
}

/**
 * Server configuration loaded from environment or arguments
 */
export interface ServerConfig {
  connections: ConnectionProfiles;
}

/**
 * Convert ConnectionProfile to mssql config
 */
export function toMssqlConfig(profile: ConnectionProfile): mssqlConfig {
  return {
    server: profile.server,
    database: profile.database,
    user: profile.user,
    password: profile.password,
    port: profile.port || 1433,
    options: {
      encrypt: profile.options?.encrypt ?? true,
      trustServerCertificate: profile.options?.trustServerCertificate ?? false,
      enableArithAbort: true,
    },
    requestTimeout: profile.options?.requestTimeout || 30000,
    connectionTimeout: profile.options?.connectionTimeout || 15000,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
}

/**
 * Parse a PostgreSQL connection string into a ConnectionProfile.
 * Supports: postgresql://user:password@host:port/database?param=value
 */
export function parsePostgresConnectionString(connectionString: string): ConnectionProfile {
  try {
    const url = new URL(connectionString);

    if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
      throw new Error(`Unsupported protocol: ${url.protocol}. Expected postgresql:// or postgres://`);
    }

    const profile: ConnectionProfile = {
      databaseType: 'postgresql',
      server: url.hostname,
      database: url.pathname.slice(1), // Remove leading /
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      port: url.port ? parseInt(url.port, 10) : 5432,
      connectionString,
    };

    // Parse query parameters for PG options
    const sslParam = url.searchParams.get('sslmode');
    if (sslParam) {
      profile.pgOptions = profile.pgOptions || {};
      profile.pgOptions.ssl = sslParam !== 'disable';
    }

    const appName = url.searchParams.get('application_name');
    if (appName) {
      profile.pgOptions = profile.pgOptions || {};
      profile.pgOptions.application_name = appName;
    }

    const timeout = url.searchParams.get('statement_timeout');
    if (timeout) {
      profile.pgOptions = profile.pgOptions || {};
      profile.pgOptions.statement_timeout = parseInt(timeout, 10);
    }

    return profile;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Invalid PostgreSQL connection string: ${connectionString}`);
    }
    throw error;
  }
}
