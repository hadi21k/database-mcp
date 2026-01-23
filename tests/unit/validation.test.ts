import { describe, it, expect } from 'vitest';
import { isReadOnlyQuery, validateParameters, sanitizeIdentifier } from '../../src/utils/validation.js';

describe('Validation Utils', () => {
  describe('isReadOnlyQuery', () => {
    describe('should allow safe SELECT queries', () => {
      it('allows basic SELECT statements', () => {
        expect(isReadOnlyQuery('SELECT * FROM Users')).toBe(true);
        expect(isReadOnlyQuery('select id, name from products')).toBe(true);
        expect(isReadOnlyQuery('  SELECT TOP 10 * FROM Orders  ')).toBe(true);
      });

      it('allows SELECT with WHERE clauses', () => {
        expect(isReadOnlyQuery('SELECT * FROM Users WHERE status = @status')).toBe(true);
        expect(isReadOnlyQuery('SELECT id FROM Orders WHERE date > @date')).toBe(true);
      });

      it('allows SELECT with JOINs', () => {
        expect(isReadOnlyQuery('SELECT u.*, o.* FROM Users u JOIN Orders o ON u.id = o.user_id')).toBe(true);
      });

      it('allows WITH (CTE) queries', () => {
        expect(isReadOnlyQuery('WITH cte AS (SELECT * FROM Users) SELECT * FROM cte')).toBe(true);
      });

      it('handles queries with comments', () => {
        expect(isReadOnlyQuery('-- Comment\nSELECT * FROM Users')).toBe(true);
        expect(isReadOnlyQuery('/* Multi\nline\ncomment */ SELECT * FROM Users')).toBe(true);
      });
    });

    describe('should reject dangerous write operations', () => {
      it('rejects INSERT statements', () => {
        expect(isReadOnlyQuery('INSERT INTO Users VALUES (1, "test")')).toBe(false);
        expect(isReadOnlyQuery('INSERT INTO Users (name) VALUES (@name)')).toBe(false);
      });

      it('rejects UPDATE statements', () => {
        expect(isReadOnlyQuery('UPDATE Users SET name = "test"')).toBe(false);
        expect(isReadOnlyQuery('UPDATE Users SET status = @status WHERE id = @id')).toBe(false);
      });

      it('rejects DELETE statements', () => {
        expect(isReadOnlyQuery('DELETE FROM Users WHERE id = 1')).toBe(false);
        expect(isReadOnlyQuery('DELETE FROM Users')).toBe(false);
      });

      it('rejects DDL statements', () => {
        expect(isReadOnlyQuery('DROP TABLE Users')).toBe(false);
        expect(isReadOnlyQuery('CREATE TABLE Users (id INT)')).toBe(false);
        expect(isReadOnlyQuery('ALTER TABLE Users ADD COLUMN age INT')).toBe(false);
        expect(isReadOnlyQuery('TRUNCATE TABLE Users')).toBe(false);
      });

      it('rejects EXEC/EXECUTE statements', () => {
        expect(isReadOnlyQuery('EXEC sp_executesql @sql')).toBe(false);
        expect(isReadOnlyQuery('EXECUTE my_procedure')).toBe(false);
      });

      it('rejects MERGE statements', () => {
        expect(isReadOnlyQuery('MERGE INTO Users ...')).toBe(false);
      });

      it('rejects permission changes', () => {
        expect(isReadOnlyQuery('GRANT SELECT ON Users TO public')).toBe(false);
        expect(isReadOnlyQuery('REVOKE SELECT ON Users FROM user')).toBe(false);
        expect(isReadOnlyQuery('DENY SELECT ON Users TO user')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('rejects empty or whitespace-only queries', () => {
        expect(isReadOnlyQuery('')).toBe(false);
        expect(isReadOnlyQuery('   ')).toBe(false);
        expect(isReadOnlyQuery('\n\t  ')).toBe(false);
      });
    });
  });

  describe('validateParameters', () => {
    describe('should accept valid parameters', () => {
      it('accepts alphanumeric parameter names', () => {
        expect(() => validateParameters({ id: 1 })).not.toThrow();
        expect(() => validateParameters({ userName: 'test' })).not.toThrow();
        expect(() => validateParameters({ user_name: 'test' })).not.toThrow();
        expect(() => validateParameters({ _privateVar: 'value' })).not.toThrow();
        expect(() => validateParameters({ param123: 'value' })).not.toThrow();
      });

      it('accepts various value types', () => {
        expect(() => validateParameters({
          str: 'string',
          num: 42,
          bool: true,
          nullVal: null,
          arr: [1, 2, 3],
          obj: { nested: 'value' }
        })).not.toThrow();
      });
    });

    describe('should reject invalid parameters', () => {
      it('rejects parameter names starting with numbers', () => {
        expect(() => validateParameters({ '123invalid': 'value' })).toThrow('Invalid parameter name');
      });

      it('rejects parameter names with special characters', () => {
        expect(() => validateParameters({ 'param-name': 'value' })).toThrow('Invalid parameter name');
        expect(() => validateParameters({ 'param.name': 'value' })).toThrow('Invalid parameter name');
        expect(() => validateParameters({ 'param name': 'value' })).toThrow('Invalid parameter name');
        expect(() => validateParameters({ 'param;DROP': 'value' })).toThrow('Invalid parameter name');
      });

      it('rejects function parameters', () => {
        expect(() => validateParameters({ func: () => {} })).toThrow('cannot be a function');
        expect(() => validateParameters({ cb: function() {} })).toThrow('cannot be a function');
      });
    });
  });

  describe('sanitizeIdentifier', () => {
    describe('should accept valid identifiers', () => {
      it('accepts simple table names', () => {
        expect(sanitizeIdentifier('Users')).toBe('Users');
        expect(sanitizeIdentifier('user_data')).toBe('user_data');
        expect(sanitizeIdentifier('_private')).toBe('_private');
        expect(sanitizeIdentifier('Table123')).toBe('Table123');
      });

      it('accepts schema.table format', () => {
        expect(sanitizeIdentifier('dbo.Users')).toBe('dbo.Users');
        expect(sanitizeIdentifier('custom_schema.my_table')).toBe('custom_schema.my_table');
      });
    });

    describe('should reject dangerous identifiers', () => {
      it('rejects identifiers with special characters', () => {
        expect(() => sanitizeIdentifier('table-name')).toThrow('Invalid identifier');
        expect(() => sanitizeIdentifier('table name')).toThrow('Invalid identifier');
        expect(() => sanitizeIdentifier('table;DROP')).toThrow('Invalid identifier');
        expect(() => sanitizeIdentifier('table\'name')).toThrow('Invalid identifier');
      });

      it('rejects identifiers starting with numbers', () => {
        expect(() => sanitizeIdentifier('123table')).toThrow('Invalid identifier');
      });

      it('rejects SQL injection attempts', () => {
        expect(() => sanitizeIdentifier('Users; DROP TABLE Users;--')).toThrow('Invalid identifier');
        expect(() => sanitizeIdentifier('Users\' OR \'1\'=\'1')).toThrow('Invalid identifier');
        expect(() => sanitizeIdentifier('Users/**/OR/**/')).toThrow('Invalid identifier');
      });
    });
  });
});
