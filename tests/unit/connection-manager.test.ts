import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConnectionManager } from '../../src/database/connection-manager.js';
import { ConnectionProfile } from '../../src/config/types.js';

describe('ConnectionManager', () => {
  let manager: ConnectionManager;

  const validProfile: ConnectionProfile = {
    server: 'localhost',
    database: 'TestDB',
    user: 'test_user',
    password: 'test_pass',
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  };

  const pgProfile: ConnectionProfile = {
    databaseType: 'postgresql',
    server: 'localhost',
    database: 'testdb',
    user: 'postgres',
    password: 'secret',
    port: 5432,
  };

  const pgConnectionStringProfile: ConnectionProfile = {
    databaseType: 'postgresql',
    server: 'pghost',
    database: 'mydb',
    user: 'pguser',
    password: 'pgpass',
    connectionString: 'postgresql://pguser:pgpass@pghost:5432/mydb',
  };

  beforeEach(() => {
    manager = new ConnectionManager();
  });

  describe('Profile Management', () => {
    describe('addProfile', () => {
      it('should add a new profile', () => {
        manager.addProfile('test', validProfile);
        expect(manager.hasProfile('test')).toBe(true);
      });

      it('should add multiple profiles', () => {
        manager.addProfile('local', validProfile);
        manager.addProfile('prod', { ...validProfile, database: 'ProdDB' });

        expect(manager.hasProfile('local')).toBe(true);
        expect(manager.hasProfile('prod')).toBe(true);
      });

      it('should add PostgreSQL profiles', () => {
        manager.addProfile('pg', pgProfile);
        expect(manager.hasProfile('pg')).toBe(true);
      });

      it('should support mixed database types', () => {
        manager.addProfile('sql', validProfile);
        manager.addProfile('pg', pgProfile);

        expect(manager.getProfileNames()).toHaveLength(2);
      });
    });

    describe('getProfileNames', () => {
      it('should return empty array when no profiles', () => {
        expect(manager.getProfileNames()).toEqual([]);
      });

      it('should return all profile names', () => {
        manager.addProfile('local', validProfile);
        manager.addProfile('prod', validProfile);
        manager.addProfile('dev', validProfile);

        const names = manager.getProfileNames();
        expect(names).toHaveLength(3);
        expect(names).toContain('local');
        expect(names).toContain('prod');
        expect(names).toContain('dev');
      });
    });

    describe('hasProfile', () => {
      it('should return true for existing profiles', () => {
        manager.addProfile('test', validProfile);
        expect(manager.hasProfile('test')).toBe(true);
      });

      it('should return false for non-existent profiles', () => {
        expect(manager.hasProfile('nonexistent')).toBe(false);
      });

      it('should be case-sensitive', () => {
        manager.addProfile('Test', validProfile);
        expect(manager.hasProfile('Test')).toBe(true);
        expect(manager.hasProfile('test')).toBe(false);
      });
    });
  });

  describe('getDriver', () => {
    it('should throw error for unknown profile', async () => {
      await expect(manager.getDriver('unknown'))
        .rejects.toThrow('Unknown connection profile: unknown');
    });

    it('should default to sqlserver when databaseType is not set', async () => {
      manager.addProfile('sql', validProfile);

      // This will fail at mssql ConnectionPool connect, which is expected
      await expect(manager.getDriver('sql'))
        .rejects.toThrow();
    });
  });

  describe('Connection Pool Management', () => {
    describe('getPool', () => {
      it('should throw error for unknown profile', async () => {
        await expect(manager.getPool('unknown'))
          .rejects
          .toThrow('Unknown connection profile: unknown');
      });

      it('should throw descriptive error message', async () => {
        await expect(manager.getPool('missing-profile'))
          .rejects
          .toThrow(/Unknown connection profile.*missing-profile/);
      });
    });

    describe('closePool', () => {
      it('should not throw when closing non-existent pool', async () => {
        await expect(manager.closePool('nonexistent')).resolves.not.toThrow();
      });
    });

    describe('closeAll', () => {
      it('should close all pools without error', async () => {
        await expect(manager.closeAll()).resolves.not.toThrow();
      });
    });
  });

  describe('testConnection', () => {
    it('should return false for unknown profile', async () => {
      const result = await manager.testConnection('unknown');
      expect(result).toBe(false);
    });

    it('should return false when connection fails', async () => {
      manager.addProfile('bad', validProfile);
      // The connection will fail since there's no actual database
      const result = await manager.testConnection('bad');
      expect(result).toBe(false);
    });
  });
});
