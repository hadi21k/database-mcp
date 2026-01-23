import { describe, it, expect, afterEach } from 'vitest';
import { ConfigLoader } from '../../src/config/config-loader.js';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

describe('ConfigLoader', () => {
  const testConfigPath = join(process.cwd(), 'test-config-temp.json');
  
  const validConfig = {
    local: {
      server: 'localhost',
      database: 'TestDB',
      user: 'test_user',
      password: 'test_pass',
    },
    prod: {
      server: 'prod.server.com',
      database: 'ProdDB',
      user: 'prod_user',
      password: 'prod_pass',
    },
  };

  afterEach(() => {
    // Cleanup
    try {
      unlinkSync(testConfigPath);
    } catch {}
    delete process.env.SQLSERVER_CONFIG_FILE;
    delete process.env.SQLSERVER_CONNECTIONS;
  });

  describe('load from file', () => {
    it('should load config from SQLSERVER_CONFIG_FILE', () => {
      writeFileSync(testConfigPath, JSON.stringify(validConfig));
      process.env.SQLSERVER_CONFIG_FILE = testConfigPath;
      
      const config = ConfigLoader.load([]);
      
      expect(config.connections).toHaveProperty('local');
      expect(config.connections).toHaveProperty('prod');
      expect(config.connections.local.server).toBe('localhost');
      expect(config.connections.prod.database).toBe('ProdDB');
    });

    it('should throw error if config file does not exist', () => {
      process.env.SQLSERVER_CONFIG_FILE = '/nonexistent/path/config.json';
      
      expect(() => ConfigLoader.load([])).toThrow('Failed to read config file');
    });

    it('should throw error if config file has invalid JSON', () => {
      writeFileSync(testConfigPath, 'invalid json{]');
      process.env.SQLSERVER_CONFIG_FILE = testConfigPath;
      
      expect(() => ConfigLoader.load([])).toThrow('Failed to read config file');
    });
  });

  describe('load from environment variable', () => {
    it('should load config from SQLSERVER_CONNECTIONS', () => {
      process.env.SQLSERVER_CONNECTIONS = JSON.stringify(validConfig);
      
      const config = ConfigLoader.load([]);
      
      expect(config.connections).toHaveProperty('local');
      expect(config.connections.local.database).toBe('TestDB');
    });

    it('should throw error if SQLSERVER_CONNECTIONS has invalid JSON', () => {
      process.env.SQLSERVER_CONNECTIONS = 'not valid json';
      
      expect(() => ConfigLoader.load([])).toThrow('Failed to parse SQLSERVER_CONNECTIONS');
    });

    it('should handle complex connection profiles', () => {
      const complexConfig = {
        azure: {
          server: 'server.database.windows.net',
          database: 'AzureDB',
          user: 'azure_user',
          password: 'complex_p@ssw0rd!',
          port: 1433,
          options: {
            encrypt: true,
            trustServerCertificate: false,
            applicationIntent: 'ReadOnly' as const,
          },
        },
      };

      process.env.SQLSERVER_CONNECTIONS = JSON.stringify(complexConfig);
      const config = ConfigLoader.load([]);
      
      expect(config.connections.azure.options?.encrypt).toBe(true);
      expect(config.connections.azure.options?.applicationIntent).toBe('ReadOnly');
    });
  });

  describe('load from command line arguments', () => {
    it('should load config from --config argument', () => {
      const args = ['--config', JSON.stringify(validConfig)];
      const config = ConfigLoader.load(args);
      
      expect(config.connections).toHaveProperty('local');
      expect(config.connections).toHaveProperty('prod');
    });

    it('should throw error if --config has invalid JSON', () => {
      const args = ['--config', 'invalid json'];
      
      expect(() => ConfigLoader.load(args)).toThrow('Failed to parse --config');
    });

    it('should handle --config flag at different positions', () => {
      const args = ['other', 'args', '--config', JSON.stringify(validConfig), 'more'];
      const config = ConfigLoader.load(args);
      
      expect(config.connections).toHaveProperty('local');
    });
  });

  describe('configuration priority', () => {
    it('should prioritize file over environment variable', () => {
      const fileConfig = { file_profile: { server: 'file', database: 'db', user: 'u', password: 'p' } };
      const envConfig = { env_profile: { server: 'env', database: 'db', user: 'u', password: 'p' } };
      
      writeFileSync(testConfigPath, JSON.stringify(fileConfig));
      process.env.SQLSERVER_CONFIG_FILE = testConfigPath;
      process.env.SQLSERVER_CONNECTIONS = JSON.stringify(envConfig);
      
      const config = ConfigLoader.load([]);
      
      expect(config.connections).toHaveProperty('file_profile');
      expect(config.connections).not.toHaveProperty('env_profile');
    });

    it('should prioritize env variable over command line', () => {
      const envConfig = { env: { server: 'env', database: 'db', user: 'u', password: 'p' } };
      const argsConfig = { args: { server: 'args', database: 'db', user: 'u', password: 'p' } };
      
      process.env.SQLSERVER_CONNECTIONS = JSON.stringify(envConfig);
      const args = ['--config', JSON.stringify(argsConfig)];
      
      const config = ConfigLoader.load(args);
      
      expect(config.connections).toHaveProperty('env');
      expect(config.connections).not.toHaveProperty('args');
    });
  });

  describe('validation', () => {
    it('should validate config with at least one profile', () => {
      const config = { connections: validConfig };
      expect(() => ConfigLoader.validate(config)).not.toThrow();
    });

    it('should throw error if no profiles provided', () => {
      const config = { connections: {} };
      expect(() => ConfigLoader.validate(config)).toThrow('at least one connection profile');
    });

    it('should validate all required fields', () => {
      const invalidConfigs = [
        { test: { database: 'db', user: 'u', password: 'p' } }, // missing server
        { test: { server: 's', user: 'u', password: 'p' } }, // missing database
        { test: { server: 's', database: 'db', password: 'p' } }, // missing user
        { test: { server: 's', database: 'db', user: 'u' } }, // missing password
      ];

      invalidConfigs.forEach((connections) => {
        expect(() => ConfigLoader.validate({ connections } as any))
          .toThrow('server, database, user, and password are required');
      });
    });

    it('should identify which profile is invalid', () => {
      const config = {
        connections: {
          valid: { server: 's', database: 'db', user: 'u', password: 'p' },
          invalid: { server: 's' } as any,
        },
      };

      expect(() => ConfigLoader.validate(config))
        .toThrow(/invalid.*server, database, user, and password are required/);
    });
  });

  describe('error handling', () => {
    it('should throw if no configuration source provided', () => {
      expect(() => ConfigLoader.load([])).toThrow('No configuration provided');
    });

    it('should mention configuration options in error', () => {
      expect(() => ConfigLoader.load([]))
        .toThrow(/SQLSERVER_CONFIG_FILE.*SQLSERVER_CONNECTIONS/);
    });
  });
});
