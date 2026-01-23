import { describe, it, expect, beforeEach } from 'vitest';
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
});
