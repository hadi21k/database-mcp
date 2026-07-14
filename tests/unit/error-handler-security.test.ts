import { describe, it, expect } from 'vitest';
import { sanitizeError } from '../../src/utils/error-handler.js';

describe('Error Handler Security Hardening', () => {
  describe('sanitizeError', () => {
    it('masks credentials, host, and password embedded in a connection URL', () => {
      const error = new Error('connect ECONNREFUSED postgresql://admin:s3cr3t@db.internal:5432/app');
      const sanitized = sanitizeError(error);

      expect(sanitized).not.toContain('s3cr3t');
      expect(sanitized).not.toContain('admin');
      expect(sanitized).not.toContain('db.internal');
    });

    it('masks a password= key-value pair', () => {
      const error = new Error('Connection failed: password=hunter2');
      const sanitized = sanitizeError(error);

      expect(sanitized).not.toContain('hunter2');
    });

    it('masks a bare IPv6 address', () => {
      const error = new Error('Failed to connect to 2001:db8:0:0:0:0:0:1');
      const sanitized = sanitizeError(error);

      expect(sanitized).not.toContain('2001:db8');
    });

    it('masks a bracketed IPv6 address', () => {
      const error = new Error('Failed to connect to [2001:db8::1]:5432');
      const sanitized = sanitizeError(error);

      expect(sanitized).not.toContain('2001:db8');
    });
  });
});
