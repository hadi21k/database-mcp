/**
 * Strip SQL string literals, line/block comments, and PostgreSQL dollar-quoted
 * bodies from a query. This is the single source of truth for "cleaned" SQL used
 * by every scanning function below, so keyword checks can't be evaded by hiding a
 * verb inside a comment or a string, and legitimate string contents (e.g.
 * `WHERE note = 'please delete later'`) can't trigger false positives.
 *
 * A single left-to-right scan handles the states correctly (a `'` inside a
 * comment is not a string start, a `--` inside a string is not a comment).
 */
export function stripLiteralsAndComments(sql: string): string {
  let out = '';
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];

    // Line comment: -- ... EOL
    if (c === '-' && next === '-') {
      i += 2;
      while (i < n && sql[i] !== '\n') i++;
      out += ' ';
      continue;
    }

    // Block comment: /* ... */
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      out += ' ';
      continue;
    }

    // Single-quoted string literal. Handles the '' doubling escape, and, for
    // PostgreSQL E'...' escape strings, backslash escapes (\' \\). Getting the
    // E-string case right matters for security: a scanner that mis-detects where
    // an E-string ends can let a stacked `'; DROP TABLE ...` slip past the
    // multi-statement check. Plain strings treat backslash literally, matching
    // the modern default standard_conforming_strings=on.
    if (c === "'") {
      const isEString = /[eE]/.test(sql[i - 1] ?? '') && (i < 2 || /[^A-Za-z0-9_]/.test(sql[i - 2]));
      i++;
      while (i < n) {
        if (isEString && sql[i] === '\\') {
          i += 2; // escaped char (including \' and \\) is part of the string
          continue;
        }
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      out += "''"; // keep a token so surrounding word boundaries survive
      continue;
    }

    // PostgreSQL dollar-quoted body: $tag$ ... $tag$
    if (c === '$') {
      const m = sql.slice(i).match(/^\$([A-Za-z0-9_]*)\$/);
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        i = end === -1 ? n : end + tag.length;
        out += ' ';
        continue;
      }
    }

    out += c;
    i++;
  }

  return out;
}

/**
 * Keywords and functions that must never appear in a read-only query, even
 * inside an otherwise SELECT-shaped statement. Covers write/DDL verbs, plus
 * side-effecting or data-exfiltrating constructs that are valid inside a SELECT
 * (SELECT ... INTO, server-side file/OS access, sequence mutation, cross-source
 * reads). Statement-level threats (stacked writes, USE, WAITFOR, SHUTDOWN, DO)
 * are blocked separately by the single-statement + first-token checks.
 */
const DANGEROUS_KEYWORDS: RegExp[] = [
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
  /\binto\b/i, // SELECT ... INTO creates a table on both engines
  /\bopenrowset\b/i,
  /\bopenquery\b/i,
  /\bopendatasource\b/i,
  /\bdblink\b/i,
  /\bpg_sleep/i, // matches pg_sleep, pg_sleep_for, pg_sleep_until
  /\bpg_terminate_backend\b/i,
  /\bpg_cancel_backend\b/i,
  /\bpg_reload_conf\b/i,
  /\bpg_rotate_logfile\b/i,
  /\bpg_switch_wal\b/i,
  /\bset_config\b/i,
  /\bpg_advisory_lock/i,
  /\bpg_read_file\b/i,
  /\bpg_read_binary_file\b/i,
  /\bpg_ls_dir\b/i,
  /\blo_import\b/i,
  /\blo_export\b/i,
  /\bnextval\b/i,
  /\bsetval\b/i,
  /\bxp_\w+/i, // extended stored procedures (xp_cmdshell, ...)
  /\bsp_\w+/i, // system stored procedures
];

/**
 * Validate that a SQL query is read-only.
 *
 * Enforces three layers: (1) exactly one statement (no stacked queries),
 * (2) the statement begins with SELECT or WITH, and (3) no dangerous
 * keyword/function appears anywhere in the literal-and-comment-stripped text.
 */
export function isReadOnlyQuery(sql: string): boolean {
  const cleanSql = stripLiteralsAndComments(sql).trim();

  if (!cleanSql) {
    return false;
  }

  // Single statement only: reject any ';' that isn't a lone trailing terminator.
  // This blocks stacked statements like `SELECT 1; DROP TABLE x`.
  const withoutTrailing = cleanSql.replace(/;\s*$/, '');
  if (withoutTrailing.includes(';')) {
    return false;
  }

  // Must start with SELECT or WITH (CTE). Strip leading parentheses first so a
  // parenthesized set-operation like `(SELECT ...) UNION (SELECT ...)` is allowed.
  const leading = withoutTrailing.replace(/^[\s(]+/, '');
  const firstWord = leading.split(/\s+/)[0].toLowerCase();
  if (firstWord !== 'select' && firstWord !== 'with') {
    return false;
  }

  for (const keyword of DANGEROUS_KEYWORDS) {
    if (keyword.test(withoutTrailing)) {
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
  const cleanQuery = stripLiteralsAndComments(query);

  // Pattern: any dotted chain of 3+ identifier parts, e.g. database.schema.table
  // or the four-part linkedserver.database.schema.table. Matching 2+ leading
  // parts before the final one covers both (the previous 3-part-only regex let
  // four-part linked-server names slip through).
  // Whitespace is allowed around the dots (SQL Server accepts `db . schema . t`),
  // and comments have already been reduced to spaces by the stripper.
  const multiPartNameRegex = /(?<![.\w])(\[?[a-zA-Z_][a-zA-Z0-9_]*\]?\s*\.\s*){2,}\[?[a-zA-Z_][a-zA-Z0-9_]*\]?(?![.\w])/;

  return multiPartNameRegex.test(cleanQuery);
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
