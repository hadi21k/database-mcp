import { ConnectionProfiles, ServerConfig, parsePostgresConnectionString } from './types.js';
import { readFileSync } from 'fs';

/**
 * Load configuration from environment variables or command-line arguments
 */
export class ConfigLoader {
  /**
   * Parse a JSON connections blob and assert it is a plain object mapping
   * profile names to profile objects. This is the untrusted config boundary, so
   * validate the shape here rather than casting blindly.
   */
  private static parseConnections(raw: string, source: string): ConnectionProfiles {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `Failed to parse ${source}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`Invalid ${source}: expected a JSON object of connection profiles`);
    }

    for (const [name, profile] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof profile !== 'object' || profile === null || Array.isArray(profile)) {
        throw new Error(`Invalid ${source}: profile "${name}" must be an object`);
      }
    }

    return parsed as ConnectionProfiles;
  }

  /**
   * Load configuration from SQLSERVER_CONFIG_FILE or SQLSERVER_CONNECTIONS environment variable
   */
  static load(args: string[] = process.argv.slice(2)): ServerConfig {
    // Try config file path first
    const configFilePath = process.env.SQLSERVER_CONFIG_FILE;

    if (configFilePath) {
      let fileContent: string;
      try {
        fileContent = readFileSync(configFilePath, 'utf-8');
      } catch (error) {
        throw new Error(
          `Failed to read config file at ${configFilePath}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
      return { connections: this.parseConnections(fileContent, `config file at ${configFilePath}`) };
    }

    // Try environment variable with JSON string
    const envConfig = process.env.SQLSERVER_CONNECTIONS;

    if (envConfig) {
      return { connections: this.parseConnections(envConfig, 'SQLSERVER_CONNECTIONS environment variable') };
    }

    // Try command-line arguments
    const configIndex = args.indexOf('--config');
    if (configIndex !== -1 && args[configIndex + 1]) {
      return { connections: this.parseConnections(args[configIndex + 1], '--config argument') };
    }

    throw new Error(
      'No configuration provided. Set SQLSERVER_CONFIG_FILE or SQLSERVER_CONNECTIONS environment variable'
    );
  }

  /**
   * Validate that configuration has at least one profile
   */
  static validate(config: ServerConfig): void {
    const profileNames = Object.keys(config.connections);

    if (profileNames.length === 0) {
      throw new Error('Configuration must contain at least one connection profile');
    }

    for (const [name, profile] of Object.entries(config.connections)) {
      // Validate databaseType if provided
      if (profile.databaseType && profile.databaseType !== 'sqlserver' && profile.databaseType !== 'postgresql') {
        throw new Error(
          `Invalid databaseType for profile "${name}": "${profile.databaseType}". Must be "sqlserver" or "postgresql".`
        );
      }

      // PostgreSQL profiles can use connectionString instead of structured fields
      if (profile.connectionString) {
        // Parse and merge connection string into profile (fills in server/database/user/password)
        const parsed = parsePostgresConnectionString(profile.connectionString);
        if (!profile.server) profile.server = parsed.server;
        if (!profile.database) profile.database = parsed.database;
        if (!profile.user) profile.user = parsed.user;
        if (!profile.password) profile.password = parsed.password;
        if (!profile.port) profile.port = parsed.port;
        if (!profile.databaseType) profile.databaseType = 'postgresql';
        continue;
      }

      // For structured config, require server/database/user/password
      if (!profile.server || !profile.database || !profile.user || !profile.password) {
        throw new Error(
          `Invalid configuration for profile "${name}": server, database, user, and password are required`
        );
      }
    }
  }
}
