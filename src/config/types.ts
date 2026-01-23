import { config as mssqlConfig } from 'mssql';

/**
 * Connection profile configuration
 */
export interface ConnectionProfile {
  server: string;
  database: string;
  user: string;
  password: string;
  port?: number;
  options?: {
    encrypt?: boolean;
    trustServerCertificate?: boolean;
    applicationIntent?: 'ReadOnly' | 'ReadWrite';
    requestTimeout?: number;
    connectionTimeout?: number;
  };
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
