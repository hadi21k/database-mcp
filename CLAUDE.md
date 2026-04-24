# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Database MCP Server — a Model Context Protocol server that gives AI assistants read-only access to SQL Server and PostgreSQL databases. Built with TypeScript, Node.js 18+, ESM modules, and the `@modelcontextprotocol/sdk`.

## Commands

```bash
npm run build            # Compile TypeScript → build/
npm run dev              # Watch mode compilation
npm start                # Run server (node build/index.js)
npm test                 # Run all tests (Vitest)
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only
npm run test:watch       # Tests in watch mode
npm run test:coverage    # Coverage report (V8 provider)
```

## Architecture

### Layers

```
index.ts (entry)
  → ConfigLoader (env/file/CLI config)
  → SqlServerMcpServer (server.ts)
      → ConnectionManager (pool-per-profile, lazy init, multi-database)
      → IDatabaseDriver (driver abstraction per profile)
          → SqlServerDriver (mssql package)
          → PostgresDriver (postgres/porsager package)
      → ToolRegistry → 11 tools (BaseTool subclasses)
      → ResourceRegistry → 3 resources (BaseResource subclasses)
  → StdioServerTransport (MCP stdio transport)
```

### Driver Abstraction

The `IDatabaseDriver` interface (`src/database/interfaces/database-driver.ts`) abstracts all database-specific operations. Each database type implements this interface:

- **SqlServerDriver** (`src/database/drivers/sqlserver.driver.ts`) — uses `mssql` ConnectionPool, `sys.*` views for metadata, `TOP` for row limiting
- **PostgresDriver** (`src/database/drivers/postgres.driver.ts`) — uses `postgres` (porsager) tagged template queries, `pg_catalog`/`information_schema` for metadata, `LIMIT` for row limiting

Tools and resources interact only with `IDatabaseDriver`, never with database-specific APIs.

### Key Directories

- `src/config/` — Config loading (`ConfigLoader`) and types (`ConnectionProfile`, `DatabaseType`, connection string parsing)
- `src/core/` — Abstract base classes (`BaseTool`, `BaseResource`) and registries
- `src/database/` — `ConnectionManager` (pool management, driver creation)
- `src/database/interfaces/` — `IDatabaseDriver` interface and result type interfaces
- `src/database/drivers/` — Database-specific driver implementations and factory
- `src/tools/` — MCP tool implementations:
  - **Universal**: list-schemas, list-tables, describe-table, get-relationships, get-indexes, run-select-query, explain-query, estimate-cost
  - **PostgreSQL-only**: list-materialized-views, list-extensions, list-enums
- `src/resources/` — MCP resource implementations (table-schema, database-info, connection-profiles) using `db:///` URI scheme
- `src/utils/` — Dialect-aware query validation (`validation.ts`) and error sanitization (`error-handler.ts`)
- `tests/unit/` — Vitest unit tests

### Adding a New Tool

1. Create `src/tools/<name>.tool.ts` extending `BaseTool`
2. Define Zod input schema, implement `execute()` method
3. Use `this.getDriver(profile)` to get an `IDatabaseDriver` instance
4. Export from `src/tools/index.ts`
5. Register the tool class in `registerBuiltins()` in `server.ts`
6. Add MCP registration in `setupTools()` in `server.ts`

For database-specific tools, check `driver.dialect` and throw if the wrong database type is used.

### Security Model

All enforcement lives in `src/utils/validation.ts`:

- **Read-only enforcement**: `isReadOnlyQuery()` blocks INSERT/UPDATE/DELETE/DROP/CREATE/ALTER/EXEC/MERGE/GRANT/REVOKE
- **Row limiting**: `injectRowLimit()` dispatches to `injectTopClause()` (SQL Server) or `injectLimitClause()` (PostgreSQL)
- **Cross-database blocking**: `hasCrossDatabaseQuery()` detects three-part names
- **Parameter validation**: alphanumeric-only names, no function parameters
- **Identifier sanitization**: `sanitizeIdentifier()` allows `[a-zA-Z_][a-zA-Z0-9_]*`
- **Identifier quoting**: `quoteIdentifier()` uses `[name]` for SQL Server, `"name"` for PostgreSQL
- **Error sanitization**: masks credentials, IPs, file paths in error output

### Configuration

Connection profiles loaded in priority order:
1. `SQLSERVER_CONFIG_FILE` env var (path to JSON file)
2. `SQLSERVER_CONNECTIONS` env var (JSON string)
3. `--config` CLI argument (JSON string)

Each profile supports:
- `databaseType`: `'sqlserver'` (default) or `'postgresql'`
- SQL Server-specific `options` (encrypt, trustServerCertificate, etc.)
- PostgreSQL-specific `pgOptions` (ssl, statement_timeout, application_name)
- `connectionString` for PostgreSQL (e.g., `postgresql://user:pass@host:5432/db`)

### Adding to a Project (Claude Code / Cursor)

Add to your project's `.mcp.json` to give AI assistants database access:

**PostgreSQL (connection string):**
```json
{
  "mcpServers": {
    "database": {
      "command": "node",
      "args": ["/absolute/path/to/sqlserver-mcp/build/index.js"],
      "env": {
        "SQLSERVER_CONNECTIONS": "{\"mydb\":{\"databaseType\":\"postgresql\",\"connectionString\":\"postgresql://user:pass@localhost:5432/dbname\"}}"
      }
    }
  }
}
```

**SQL Server:**
```json
{
  "mcpServers": {
    "database": {
      "command": "node",
      "args": ["/absolute/path/to/sqlserver-mcp/build/index.js"],
      "env": {
        "SQLSERVER_CONNECTIONS": "{\"mydb\":{\"server\":\"localhost\",\"database\":\"MyDB\",\"user\":\"sa\",\"password\":\"pass\",\"options\":{\"encrypt\":false,\"trustServerCertificate\":true}}}"
      }
    }
  }
}
```

The profile name (e.g., `mydb`) is what gets passed as the `profile` parameter to every tool call. Use a short, memorable name.

### Dependencies

- `@modelcontextprotocol/sdk` — MCP protocol
- `mssql` — SQL Server driver (Tedious)
- `postgres` — PostgreSQL driver (porsager)
- `zod` — Schema validation
