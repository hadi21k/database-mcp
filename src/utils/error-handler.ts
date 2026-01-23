/**
 * Sanitize error messages to prevent information leakage
 */
export function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    // Remove stack traces
    let message = error.message;

    // Remove connection string details
    message = message.replace(/server=([^;]+)/gi, 'server=***');
    message = message.replace(/user=([^;]+)/gi, 'user=***');
    message = message.replace(/password=([^;]+)/gi, 'password=***');
    message = message.replace(/pwd=([^;]+)/gi, 'pwd=***');

    // Remove IP addresses
    message = message.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '***.***.***.**');

    // Remove file paths
    message = message.replace(/[A-Za-z]:\\[^\s]+/g, '***');
    message = message.replace(/\/[^\s]+\//g, '***/');

    return message;
  }

  return 'An unknown error occurred';
}

/**
 * Create a user-friendly error message for common SQL errors
 */
export function createFriendlyError(error: unknown): Error {
  const sanitized = sanitizeError(error);
  
  if (sanitized.includes('Login failed')) {
    return new Error('Authentication failed. Please check your credentials.');
  }
  
  if (sanitized.includes('timeout')) {
    return new Error('Query timeout. The query took too long to execute.');
  }
  
  if (sanitized.includes('Invalid object name')) {
    return new Error('Table or view not found. Please check the object name.');
  }
  
  if (sanitized.includes('Incorrect syntax')) {
    return new Error(`SQL syntax error: ${sanitized}`);
  }

  return new Error(sanitized);
}
