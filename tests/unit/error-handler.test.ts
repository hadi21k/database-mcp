import { describe, it, expect } from 'vitest';
import { sanitizeError, createFriendlyError } from '../../src/utils/error-handler.js';

describe('Error Handler', () => {
  describe('sanitizeError', () => {
    describe('should remove sensitive connection information', () => {
      it('sanitizes connection strings', () => {
        const error = new Error('Connection failed: server=prod.db.com;user=admin;password=secret123');
        const sanitized = sanitizeError(error);
        
        expect(sanitized).not.toContain('prod.db.com');
        expect(sanitized).not.toContain('admin');
        expect(sanitized).not.toContain('secret123');
        expect(sanitized).toContain('server=***');
        expect(sanitized).toContain('user=***');
        expect(sanitized).toContain('password=***');
      });

      it('sanitizes pwd parameter', () => {
        const error = new Error('Error: pwd=secret;user=test');
        const sanitized = sanitizeError(error);
        
        expect(sanitized).not.toContain('secret');
        expect(sanitized).toContain('pwd=***');
      });
    });

    describe('should remove IP addresses', () => {
      it('replaces IPv4 addresses', () => {
        const error = new Error('Failed to connect to 192.168.1.100');
        const sanitized = sanitizeError(error);
        
        expect(sanitized).not.toContain('192.168.1.100');
        expect(sanitized).toContain('***.***.***.**');
      });

      it('handles multiple IP addresses', () => {
        const error = new Error('Connection from 10.0.0.1 to 192.168.1.1 failed');
        const sanitized = sanitizeError(error);
        
        expect(sanitized).not.toContain('10.0.0.1');
        expect(sanitized).not.toContain('192.168.1.1');
      });
    });

    describe('should remove file paths', () => {
      it('removes Unix-style paths', () => {
        const error = new Error('Error in /home/user/project/config.json');
        const sanitized = sanitizeError(error);
        
        expect(sanitized).not.toContain('/home/user/project/');
      });

      it('removes Windows-style paths', () => {
        const error = new Error('Error in C:\\Users\\Admin\\config.json');
        const sanitized = sanitizeError(error);
        
        expect(sanitized).not.toContain('C:\\Users\\Admin\\');
      });
    });

    describe('should handle non-Error objects', () => {
      it('handles string errors', () => {
        expect(sanitizeError('string error')).toBe('An unknown error occurred');
      });

      it('handles null/undefined', () => {
        expect(sanitizeError(null)).toBe('An unknown error occurred');
        expect(sanitizeError(undefined)).toBe('An unknown error occurred');
      });

      it('handles objects', () => {
        expect(sanitizeError({ message: 'error' })).toBe('An unknown error occurred');
      });
    });

    describe('should preserve safe error messages', () => {
      it('keeps non-sensitive messages intact', () => {
        const error = new Error('Invalid query syntax');
        expect(sanitizeError(error)).toBe('Invalid query syntax');
      });

      it('keeps generic database errors', () => {
        const error = new Error('Table not found');
        expect(sanitizeError(error)).toBe('Table not found');
      });
    });
  });

  describe('createFriendlyError', () => {
    describe('should create user-friendly messages for common errors', () => {
      it('handles login failures', () => {
        const error = new Error('Login failed for user "sa"');
        const friendly = createFriendlyError(error);
        
        expect(friendly).toBeInstanceOf(Error);
        expect(friendly.message).toContain('Authentication failed');
        expect(friendly.message).toContain('credentials');
      });

      it('handles timeout errors', () => {
        const error = new Error('Request timeout exceeded');
        const friendly = createFriendlyError(error);
        
        expect(friendly.message).toContain('Query timeout');
        expect(friendly.message).toContain('too long');
      });

      it('handles invalid object errors', () => {
        const error = new Error('Invalid object name "NonExistentTable"');
        const friendly = createFriendlyError(error);
        
        expect(friendly.message).toContain('Table or view not found');
        expect(friendly.message).toContain('object name');
      });

      it('handles syntax errors', () => {
        const error = new Error('Incorrect syntax near keyword SELECT');
        const friendly = createFriendlyError(error);
        
        expect(friendly.message).toContain('SQL syntax error');
      });
    });

    describe('should sanitize unknown errors', () => {
      it('passes through sanitized unknown errors', () => {
        const error = new Error('Some database error with password=secret');
        const friendly = createFriendlyError(error);
        
        expect(friendly.message).not.toContain('secret');
        expect(friendly.message).toContain('password=***');
      });

      it('handles non-Error objects', () => {
        const friendly = createFriendlyError('string error');
        expect(friendly).toBeInstanceOf(Error);
        expect(friendly.message).toBe('An unknown error occurred');
      });
    });
  });
});
