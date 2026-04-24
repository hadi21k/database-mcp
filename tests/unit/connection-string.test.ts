import { describe, it, expect } from 'vitest';
import { parsePostgresConnectionString } from '../../src/config/types.js';

describe('parsePostgresConnectionString', () => {
  it('should parse a basic connection string', () => {
    const profile = parsePostgresConnectionString('postgresql://user:pass@localhost:5432/mydb');

    expect(profile.databaseType).toBe('postgresql');
    expect(profile.server).toBe('localhost');
    expect(profile.database).toBe('mydb');
    expect(profile.user).toBe('user');
    expect(profile.password).toBe('pass');
    expect(profile.port).toBe(5432);
    expect(profile.connectionString).toBe('postgresql://user:pass@localhost:5432/mydb');
  });

  it('should parse postgres:// protocol', () => {
    const profile = parsePostgresConnectionString('postgres://user:pass@host:5432/db');

    expect(profile.databaseType).toBe('postgresql');
    expect(profile.server).toBe('host');
  });

  it('should default port to 5432', () => {
    const profile = parsePostgresConnectionString('postgresql://user:pass@host/db');

    expect(profile.port).toBe(5432);
  });

  it('should decode URL-encoded username and password', () => {
    const profile = parsePostgresConnectionString(
      'postgresql://user%40domain:p%40ss%23word@host:5432/db'
    );

    expect(profile.user).toBe('user@domain');
    expect(profile.password).toBe('p@ss#word');
  });

  it('should parse sslmode parameter', () => {
    const profile = parsePostgresConnectionString(
      'postgresql://user:pass@host:5432/db?sslmode=require'
    );

    expect(profile.pgOptions?.ssl).toBe(true);
  });

  it('should handle sslmode=disable', () => {
    const profile = parsePostgresConnectionString(
      'postgresql://user:pass@host:5432/db?sslmode=disable'
    );

    expect(profile.pgOptions?.ssl).toBe(false);
  });

  it('should parse application_name parameter', () => {
    const profile = parsePostgresConnectionString(
      'postgresql://user:pass@host:5432/db?application_name=my-app'
    );

    expect(profile.pgOptions?.application_name).toBe('my-app');
  });

  it('should parse statement_timeout parameter', () => {
    const profile = parsePostgresConnectionString(
      'postgresql://user:pass@host:5432/db?statement_timeout=5000'
    );

    expect(profile.pgOptions?.statement_timeout).toBe(5000);
  });

  it('should parse multiple query parameters', () => {
    const profile = parsePostgresConnectionString(
      'postgresql://user:pass@host:5432/db?sslmode=require&application_name=test&statement_timeout=3000'
    );

    expect(profile.pgOptions?.ssl).toBe(true);
    expect(profile.pgOptions?.application_name).toBe('test');
    expect(profile.pgOptions?.statement_timeout).toBe(3000);
  });

  it('should reject unsupported protocols', () => {
    expect(() =>
      parsePostgresConnectionString('mysql://user:pass@host:3306/db')
    ).toThrow('Unsupported protocol');
  });

  it('should reject invalid connection strings', () => {
    expect(() => parsePostgresConnectionString('not-a-url')).toThrow(
      'Invalid PostgreSQL connection string'
    );
  });

  it('should handle empty password', () => {
    const profile = parsePostgresConnectionString('postgresql://user:@host:5432/db');

    expect(profile.user).toBe('user');
    expect(profile.password).toBe('');
  });

  it('should handle database with path segments', () => {
    const profile = parsePostgresConnectionString('postgresql://user:pass@host:5432/mydb');

    expect(profile.database).toBe('mydb');
  });
});
