import { ConnectionProfiles, ServerConfig } from './types.js';
import { readFileSync } from 'fs';

/**
 * Load configuration from environment variables or command-line arguments
 */
export class ConfigLoader {
  /**
   * Load configuration from SQLSERVER_CONFIG_FILE or SQLSERVER_CONNECTIONS environment variable
   */
  static load(args: string[] = process.argv.slice(2)): ServerConfig {
    // Try config file path first
    const configFilePath = process.env.SQLSERVER_CONFIG_FILE;
    
    if (configFilePath) {
      try {
        const fileContent = readFileSync(configFilePath, 'utf-8');
        const connections = JSON.parse(fileContent) as ConnectionProfiles;
        return { connections };
      } catch (error) {
        throw new Error(
          `Failed to read config file at ${configFilePath}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    }

    // Try environment variable with JSON string
    const envConfig = process.env.SQLSERVER_CONNECTIONS;
    
    if (envConfig) {
      try {
        const connections = JSON.parse(envConfig) as ConnectionProfiles;
        return { connections };
      } catch (error) {
        throw new Error(
          `Failed to parse SQLSERVER_CONNECTIONS environment variable: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    }

    // Try command-line arguments
    const configIndex = args.indexOf('--config');
    if (configIndex !== -1 && args[configIndex + 1]) {
      try {
        const connections = JSON.parse(args[configIndex + 1]) as ConnectionProfiles;
        return { connections };
      } catch (error) {
        throw new Error(
          `Failed to parse --config argument: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
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
      if (!profile.server || !profile.database || !profile.user || !profile.password) {
        throw new Error(
          `Invalid configuration for profile "${name}": server, database, user, and password are required`
        );
      }
    }
  }
}
