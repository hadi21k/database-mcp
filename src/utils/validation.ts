/**
 * Validate that a SQL query is read-only (SELECT only)
 */
export function isReadOnlyQuery(sql: string): boolean {
  // Remove comments
  const cleanSql = sql
    .replace(/--.*$/gm, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .trim();

  if (!cleanSql) {
    return false;
  }

  // Check if query starts with SELECT (case-insensitive)
  const firstWord = cleanSql.split(/\s+/)[0].toLowerCase();
  
  if (firstWord !== 'select' && firstWord !== 'with') {
    return false;
  }

  // Check for dangerous keywords (case-insensitive)
  const dangerousKeywords = [
    /\binsert\b/i,
    /\bupdate\b/i,
    /\bdelete\b/i,
    /\bdrop\b/i,
    /\bcreate\b/i,
    /\balter\b/i,
    /\btruncate\b/i,
    /\bexec\b/i,
    /\bexecute\b/i,
    /\bmerge\b/i,
    /\bgrant\b/i,
    /\brevoke\b/i,
    /\bdeny\b/i,
  ];

  for (const keyword of dangerousKeywords) {
    if (keyword.test(cleanSql)) {
      return false;
    }
  }

  return true;
}

/**
 * Validate query parameters to prevent injection
 */
export function validateParameters(params: Record<string, any>): void {
  for (const [key, value] of Object.entries(params)) {
    // Check parameter name is safe (alphanumeric and underscore only)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      throw new Error(`Invalid parameter name: ${key}. Use only letters, numbers, and underscores.`);
    }

    // Check value is not a function or object with methods
    if (typeof value === 'function') {
      throw new Error(`Parameter ${key} cannot be a function`);
    }
  }
}

/**
 * Sanitize table/column names to prevent SQL injection
 * Only allows alphanumeric, underscore, and dot (for schema.table)
 */
export function sanitizeIdentifier(identifier: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/.test(identifier)) {
    throw new Error(
      `Invalid identifier: ${identifier}. Use only letters, numbers, underscores, and optionally schema.table format.`
    );
  }
  return identifier;
}

/**
 * Detects cross-database queries (three-part names: database.schema.table)
 * Returns true if query contains cross-database references
 */
export function hasCrossDatabaseQuery(query: string): boolean {
  // Remove comments to avoid false positives
  let cleanQuery = query.replace(/--[^\n]*/g, '');
  cleanQuery = cleanQuery.replace(/\/\*[\s\S]*?\*\//g, '');
  
  // Pattern: identifier.identifier.identifier (database.schema.table)
  // Must not be preceded by another dot (to avoid four-part names with server)
  const threePartNameRegex = /(?<![.\w])\[?[a-zA-Z_][a-zA-Z0-9_]*\]?\.\[?[a-zA-Z_][a-zA-Z0-9_]*\]?\.\[?[a-zA-Z_][a-zA-Z0-9_]*\]?(?![.\w])/;
  
  return threePartNameRegex.test(cleanQuery);
}

/**
 * Enforces max rows by checking if query has TOP or similar limits
 * Returns true if query has a row limit, false if unlimited
 */
export function hasRowLimit(query: string): boolean {
  // Remove comments
  let cleanQuery = query.replace(/--[^\n]*/g, '');
  cleanQuery = cleanQuery.replace(/\/\*[\s\S]*?\*\//g, '');
  
  // Check for TOP clause
  if (/\bTOP\s+\d+\b/i.test(cleanQuery)) {
    return true;
  }
  
  // Check for OFFSET-FETCH (SQL Server 2012+)
  if (/\bOFFSET\s+\d+\s+ROWS?\s+FETCH\s+(NEXT|FIRST)\s+\d+\s+ROWS?\s+ONLY\b/i.test(cleanQuery)) {
    return true;
  }
  
  return false;
}

/**
 * Injects TOP clause if query doesn't have a limit (SQL Server dialect)
 * Returns modified query with TOP clause
 */
export function injectTopClause(query: string, maxRows: number): string {
  // If already has limit, return as-is
  if (hasRowLimit(query)) {
    return query;
  }

  // Find SELECT keyword and inject TOP after it
  const selectRegex = /^(\s*(?:WITH\s+[\s\S]*?\)\s*)?SELECT)\s+/i;
  const match = query.match(selectRegex);

  if (match) {
    return query.replace(selectRegex, `$1 TOP ${maxRows} `);
  }

  // Fallback: prepend at the beginning (shouldn't happen with valid SELECT)
  return `SELECT TOP ${maxRows} * FROM (${query}) AS limited_query`;
}

/**
 * Check if a PostgreSQL query already has a LIMIT clause
 */
export function hasLimitClause(query: string): boolean {
  let cleanQuery = query.replace(/--[^\n]*/g, '');
  cleanQuery = cleanQuery.replace(/\/\*[\s\S]*?\*\//g, '');

  return /\bLIMIT\s+\d+\b/i.test(cleanQuery);
}

/**
 * Injects LIMIT clause if query doesn't have one (PostgreSQL dialect)
 * Appends LIMIT at the end of the query
 */
export function injectLimitClause(query: string, maxRows: number): string {
  // If already has LIMIT or SQL Server TOP/OFFSET-FETCH, return as-is
  if (hasLimitClause(query) || hasRowLimit(query)) {
    return query;
  }

  // LIMIT goes at the end of the query (simpler than TOP injection)
  return `${query.trimEnd()} LIMIT ${maxRows}`;
}

/**
 * Dialect-aware row limit injection.
 * Dispatches to the correct function based on database dialect.
 */
export function injectRowLimit(dialect: 'sqlserver' | 'postgresql', query: string, maxRows: number): string {
  switch (dialect) {
    case 'sqlserver':
      return injectTopClause(query, maxRows);
    case 'postgresql':
      return injectLimitClause(query, maxRows);
  }
}

/**
 * Quote an identifier using the correct syntax for the dialect.
 * SQL Server: [name]
 * PostgreSQL: "name"
 */
export function quoteIdentifier(dialect: 'sqlserver' | 'postgresql', name: string): string {
  switch (dialect) {
    case 'sqlserver':
      return `[${name}]`;
    case 'postgresql':
      return `"${name}"`;
  }
}
