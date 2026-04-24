import { describe, it, expect } from 'vitest';
import {
  hasLimitClause,
  injectLimitClause,
  injectRowLimit,
  quoteIdentifier,
} from '../../src/utils/validation.js';

describe('PostgreSQL Validation Utils', () => {
  describe('hasLimitClause', () => {
    it('should detect LIMIT clause', () => {
      expect(hasLimitClause('SELECT * FROM users LIMIT 10')).toBe(true);
      expect(hasLimitClause('SELECT * FROM users limit 100')).toBe(true);
      expect(hasLimitClause('SELECT * FROM users ORDER BY id LIMIT 5')).toBe(true);
    });

    it('should not detect LIMIT in identifiers or strings', () => {
      expect(hasLimitClause('SELECT * FROM users')).toBe(false);
      expect(hasLimitClause('SELECT * FROM limited_users')).toBe(false);
    });

    it('should ignore LIMIT in comments', () => {
      expect(hasLimitClause('SELECT * FROM users -- LIMIT 10')).toBe(false);
      expect(hasLimitClause('SELECT * FROM users /* LIMIT 10 */')).toBe(false);
    });
  });

  describe('injectLimitClause', () => {
    it('should append LIMIT to queries without one', () => {
      expect(injectLimitClause('SELECT * FROM users', 100)).toBe(
        'SELECT * FROM users LIMIT 100'
      );
    });

    it('should not add LIMIT if already present', () => {
      const query = 'SELECT * FROM users LIMIT 10';
      expect(injectLimitClause(query, 100)).toBe(query);
    });

    it('should not add LIMIT if TOP is present (cross-dialect)', () => {
      const query = 'SELECT TOP 10 * FROM users';
      expect(injectLimitClause(query, 100)).toBe(query);
    });

    it('should trim trailing whitespace before appending', () => {
      expect(injectLimitClause('SELECT * FROM users   ', 50)).toBe(
        'SELECT * FROM users LIMIT 50'
      );
    });

    it('should handle queries with ORDER BY', () => {
      expect(injectLimitClause('SELECT * FROM users ORDER BY id', 25)).toBe(
        'SELECT * FROM users ORDER BY id LIMIT 25'
      );
    });

    it('should handle CTE queries', () => {
      const cte = 'WITH cte AS (SELECT * FROM users) SELECT * FROM cte';
      expect(injectLimitClause(cte, 100)).toBe(`${cte} LIMIT 100`);
    });
  });

  describe('injectRowLimit', () => {
    it('should use TOP for SQL Server', () => {
      const result = injectRowLimit('sqlserver', 'SELECT * FROM users', 100);
      expect(result).toContain('TOP 100');
      expect(result).not.toContain('LIMIT');
    });

    it('should use LIMIT for PostgreSQL', () => {
      const result = injectRowLimit('postgresql', 'SELECT * FROM users', 100);
      expect(result).toContain('LIMIT 100');
      expect(result).not.toContain('TOP');
    });

    it('should not double-limit', () => {
      expect(injectRowLimit('postgresql', 'SELECT * FROM users LIMIT 10', 100)).toBe(
        'SELECT * FROM users LIMIT 10'
      );
      expect(injectRowLimit('sqlserver', 'SELECT TOP 10 * FROM users', 100)).toBe(
        'SELECT TOP 10 * FROM users'
      );
    });
  });

  describe('quoteIdentifier', () => {
    it('should use brackets for SQL Server', () => {
      expect(quoteIdentifier('sqlserver', 'users')).toBe('[users]');
      expect(quoteIdentifier('sqlserver', 'order')).toBe('[order]');
    });

    it('should use double quotes for PostgreSQL', () => {
      expect(quoteIdentifier('postgresql', 'users')).toBe('"users"');
      expect(quoteIdentifier('postgresql', 'order')).toBe('"order"');
    });
  });
});
