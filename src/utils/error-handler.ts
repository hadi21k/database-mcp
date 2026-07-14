/**
 * Sanitize error messages to prevent information leakage
 */
export function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    // Remove stack traces
    let message = error.message;

    // Remove URL-form credentials first: postgresql://user:pass@host -> ***
    // (do this before the key=value masking so the host isn't left exposed).
    message = message.replace(
      /\b([a-z][a-z0-9+.-]*):\/\/[^\s/@]+(:[^\s/@]+)?@[^\s/]+/gi,
      '$1://***'
    );

    // Remove key=value connection string / libpq details
    message = message.replace(/\b(server|host|hostaddr|data source)\s*=\s*[^;\s]+/gi, '$1=***');
    message = message.replace(/\b(user|uid|user id|username)\s*=\s*[^;\s]+/gi, '$1=***');
    message = message.replace(/\b(password|pwd|pass)\s*=\s*[^;\s]+/gi, '$1=***');

    // Remove IPv4 addresses
    message = message.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '***.***.***.**');

    // Remove IPv6 addresses (bracketed or bare, 2+ hextet groups)
    message = message.replace(/\[[0-9a-f:]+\]/gi, '[***]');
    message = message.replace(/\b(?:[0-9a-f]{1,4}:){2,}[0-9a-f]{1,4}\b/gi, '***');

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
