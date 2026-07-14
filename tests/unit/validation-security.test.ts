import { describe, it, expect } from 'vitest';
import { isReadOnlyQuery, hasCrossDatabaseQuery, stripLiteralsAndComments } from '../../src/utils/validation.js';

describe('Validation Security Hardening', () => {
  describe('isReadOnlyQuery', () => {
    describe('rejects previously-permitted attack vectors', () => {
      it('rejects SELECT ... INTO table creation', () => {
        expect(isReadOnlyQuery('SELECT * INTO evil FROM users')).toBe(false);
      });

      it('rejects stacked statements with a write after a SELECT', () => {
        expect(isReadOnlyQuery('SELECT 1; DROP TABLE users')).toBe(false);
      });

      it('rejects stacked statements with an UPDATE after a SELECT', () => {
        expect(isReadOnlyQuery('SELECT 1; UPDATE users SET x=1')).toBe(false);
      });

      it('rejects stacked SELECT statements', () => {
        expect(isReadOnlyQuery('SELECT 1;SELECT 2')).toBe(false);
      });

      it('rejects pg_sleep inside a SELECT', () => {
        expect(isReadOnlyQuery('SELECT pg_sleep(10)')).toBe(false);
      });

      it('rejects pg_read_file inside a SELECT', () => {
        expect(isReadOnlyQuery("SELECT pg_read_file('/etc/passwd')")).toBe(false);
      });

      it('rejects lo_export inside a SELECT', () => {
        expect(isReadOnlyQuery("SELECT lo_export(1,'/tmp/x')")).toBe(false);
      });

      it('rejects nextval sequence mutation inside a SELECT', () => {
        expect(isReadOnlyQuery("SELECT nextval('s')")).toBe(false);
      });

      it('rejects openrowset cross-source reads', () => {
        expect(isReadOnlyQuery("SELECT * FROM openrowset('x','y','z')")).toBe(false);
      });

      it('rejects xp_cmdshell invocation', () => {
        expect(isReadOnlyQuery("SELECT xp_cmdshell('dir')")).toBe(false);
      });
    });

    describe('still allows legitimate read-only queries', () => {
      it('allows a plain SELECT', () => {
        expect(isReadOnlyQuery('SELECT id FROM users')).toBe(true);
      });

      it('allows a single trailing semicolon', () => {
        expect(isReadOnlyQuery('SELECT id FROM users;')).toBe(true);
      });

      it('allows a string literal that merely contains a dangerous word', () => {
        expect(isReadOnlyQuery("SELECT * FROM logs WHERE action = 'delete'")).toBe(true);
      });

      it('allows a string literal describing an update without being one', () => {
        expect(isReadOnlyQuery("SELECT 'please update the record' AS note")).toBe(true);
      });

      it('allows a CTE query', () => {
        expect(isReadOnlyQuery('WITH t AS (SELECT 1 AS n) SELECT n FROM t')).toBe(true);
      });
    });

    describe('review hardening', () => {
      it('rejects a stacked DROP smuggled inside a PostgreSQL E-string backslash-escaped quote', () => {
        expect(
          isReadOnlyQuery("SELECT * FROM t WHERE x = E'a\\'b'; DROP TABLE users; -- ")
        ).toBe(false);
      });

      it('rejects pg_sleep_for as a disguised pg_sleep variant', () => {
        expect(isReadOnlyQuery("SELECT pg_sleep_for('60 seconds')")).toBe(false);
      });

      it('rejects pg_sleep_until as a disguised pg_sleep variant', () => {
        expect(isReadOnlyQuery('SELECT pg_sleep_until(now())')).toBe(false);
      });

      it('rejects pg_terminate_backend', () => {
        expect(isReadOnlyQuery('SELECT pg_terminate_backend(123)')).toBe(false);
      });

      it('rejects pg_cancel_backend', () => {
        expect(isReadOnlyQuery('SELECT pg_cancel_backend(123)')).toBe(false);
      });

      it('rejects set_config session mutation', () => {
        expect(isReadOnlyQuery("SELECT set_config('x','y',false)")).toBe(false);
      });

      it('rejects pg_advisory_lock', () => {
        expect(isReadOnlyQuery('SELECT pg_advisory_lock(1)')).toBe(false);
      });

      it('allows a parenthesized set-operation with a leading paren', () => {
        expect(isReadOnlyQuery('(SELECT id FROM a) UNION ALL (SELECT id FROM b)')).toBe(true);
      });

      it('allows a plain SELECT (sanity)', () => {
        expect(isReadOnlyQuery('SELECT id FROM users')).toBe(true);
      });
    });
  });

  describe('hasCrossDatabaseQuery', () => {
    it('detects a three-part database.schema.table reference', () => {
      expect(hasCrossDatabaseQuery('SELECT * FROM otherdb.dbo.users')).toBe(true);
    });

    it('detects a three-part database.schema.table reference with whitespace around the dots', () => {
      expect(hasCrossDatabaseQuery('SELECT * FROM otherdb . dbo . sometable')).toBe(true);
    });

    it('detects a four-part linked-server.database.schema.table reference', () => {
      expect(hasCrossDatabaseQuery('SELECT * FROM srv.otherdb.dbo.users')).toBe(true);
    });

    it('does not flag a plain two-part schema.table reference', () => {
      expect(hasCrossDatabaseQuery('SELECT * FROM dbo.users')).toBe(false);
    });

    it('does not flag an unqualified table reference', () => {
      expect(hasCrossDatabaseQuery('SELECT * FROM users')).toBe(false);
    });
  });

  describe('stripLiteralsAndComments', () => {
    it('removes the content of a line comment', () => {
      const stripped = stripLiteralsAndComments('SELECT 1 -- DROP TABLE x');
      expect(stripped).not.toContain('DROP');
    });

    it('removes the content of a block comment', () => {
      const stripped = stripLiteralsAndComments('SELECT /* DELETE */ 1');
      expect(stripped).not.toContain('DELETE');
    });

    it('does not treat -- inside a string literal as a comment start', () => {
      const stripped = stripLiteralsAndComments("SELECT 'a--b'");
      expect(stripped.startsWith('SELECT')).toBe(true);
      expect(stripped).not.toContain('a--b');
    });
  });
});
