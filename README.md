# Database MCP Server

A secure, read-only Model Context Protocol (MCP) server that enables AI assistants (Claude Code, Cursor, etc.) to safely query and explore SQL Server and PostgreSQL databases.

## What is this?

This MCP server acts as a bridge between AI assistants and your databases. It provides safe, read-only access so AI can help you understand your database schema, query data, and discover relationships — all without risking data modification.

## Features

- **Read-Only by Design** — Only SELECT queries allowed, preventing accidental data changes
- **Multi-Database** — Supports both SQL Server and PostgreSQL
- **Multiple Profiles** — Connect to multiple databases simultaneously (local, staging, production)
- **Relationship Discovery** — Automatically discover foreign key relationships between tables
- **Safety Features** — Automatic row limiting, query validation, cross-database blocking
- **PostgreSQL Extras** — EXPLAIN plans, materialized views, extensions, enum types

## Quick Start

### Prerequisites

- Node.js 18+
- SQL Server and/or PostgreSQL database
- Claude Code or Cursor IDE

### Installation

```bash
cd sqlserver-mcp
npm install
npm run build
```

### Add to Your Project

Add a `.mcp.json` file to the root of any project where you want database access:

**PostgreSQL:**
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
        "SQLSERVER_CONNECTIONS": "{\"mydb\":{\"server\":\"localhost\",\"database\":\"MyDB\",\"user\":\"sa\",\"password\":\"yourpassword\",\"options\":{\"encrypt\":false,\"trustServerCertificate\":true}}}"
      }
    }
  }
}
```

**Multiple databases:**
```json
{
  "mcpServers": {
    "database": {
      "command": "node",
      "args": ["/absolute/path/to/sqlserver-mcp/build/index.js"],
      "env": {
        "SQLSERVER_CONNECTIONS": "{\"pg_local\":{\"databaseType\":\"postgresql\",\"connectionString\":\"postgresql://user:pass@localhost:5432/appdb\"},\"sql_prod\":{\"server\":\"prod.server.com\",\"database\":\"ProdDB\",\"user\":\"readonly\",\"password\":\"pass\",\"options\":{\"encrypt\":true}}}"
      }
    }
  }
}
```

The profile name (e.g., `mydb`, `pg_local`) is what gets passed as the `profile` parameter to every tool call.

### Alternative: Config File

Instead of inline JSON, you can use a config file:

```json
{
  "mcpServers": {
    "database": {
      "command": "node",
      "args": ["/absolute/path/to/sqlserver-mcp/build/index.js"],
      "env": {
        "SQLSERVER_CONFIG_FILE": "/path/to/config.json"
      }
    }
  }
}
```

Where `config.json` contains:
```json
{
  "local_pg": {
    "databaseType": "postgresql",
    "connectionString": "postgresql://user:pass@localhost:5432/mydb"
  },
  "local_sql": {
    "server": "localhost",
    "database": "MyDB",
    "user": "sa",
    "password": "yourpassword",
    "options": {
      "encrypt": false,
      "trustServerCertificate": true
    }
  }
}
```

Restart your IDE after adding or changing `.mcp.json`.

## Available Tools

| Tool | Database | Description |
|------|----------|-------------|
| `list-schemas` | Both | List schemas with owner info and table counts |
| `list-tables` | Both | List tables with row counts and type info |
| `describe-table` | Both | Column details: types, nullability, PKs, defaults, identity |
| `get-relationships` | Both | Foreign key relationships (outgoing and incoming) |
| `get-indexes` | Both | Index details: type, columns, uniqueness, filters |
| `run-select-query` | Both | Execute read-only SELECT queries with parameters |
| `explain-query` | Both | Get estimated execution plan for a query |
| `estimate-cost` | Both | Estimate query cost and row counts |
| `list-materialized-views` | PostgreSQL | List materialized views with size and status |
| `list-extensions` | PostgreSQL | List installed and available extensions |
| `list-enums` | PostgreSQL | List user-defined enum types with values |

## Usage Examples

Ask your AI assistant:

- *"List all tables in the mydb database"*
- *"Describe the Users table in mydb"*
- *"Show me the relationships for the Orders table"*
- *"Run this query on mydb: SELECT * FROM users WHERE active = true"*
- *"Explain this query: SELECT u.*, o.total FROM users u JOIN orders o ON u.id = o.user_id"*
- *"What extensions are installed on mydb?"*

## Connection Profile Options

### SQL Server
```json
{
  "server": "hostname",
  "database": "database_name",
  "user": "username",
  "password": "password",
  "port": 1433,
  "options": {
    "encrypt": true,
    "trustServerCertificate": false,
    "applicationIntent": "ReadOnly",
    "requestTimeout": 30000,
    "connectionTimeout": 15000
  }
}
```

### PostgreSQL (structured)
```json
{
  "databaseType": "postgresql",
  "server": "hostname",
  "database": "database_name",
  "user": "username",
  "password": "password",
  "port": 5432,
  "pgOptions": {
    "ssl": true,
    "statement_timeout": 30000,
    "application_name": "mcp-server"
  }
}
```

### PostgreSQL (connection string)
```json
{
  "databaseType": "postgresql",
  "connectionString": "postgresql://user:pass@host:5432/dbname?sslmode=require"
}
```

When using `connectionString`, the `server`, `database`, `user`, and `password` fields are still required but can be set to placeholder values — the connection string takes precedence.

## Security

- **Read-only enforcement** — INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, EXEC, MERGE, GRANT, REVOKE are all blocked
- **Automatic row limiting** — Queries limited to 1000 rows by default (max 10,000)
- **Cross-database blocking** — Three-part names (database.schema.table) are rejected
- **Parameter validation** — Only alphanumeric parameter names allowed
- **Error sanitization** — Credentials, IPs, and file paths are masked in error output

**Best practice:** Create a read-only database user for the MCP server.

```sql
-- PostgreSQL
CREATE USER mcp_readonly WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE mydb TO mcp_readonly;
GRANT USAGE ON SCHEMA public TO mcp_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mcp_readonly;

-- SQL Server
CREATE LOGIN mcp_readonly WITH PASSWORD = 'secure_password';
CREATE USER mcp_readonly FOR LOGIN mcp_readonly;
EXEC sp_addrolemember 'db_datareader', 'mcp_readonly';
```

## Development

```bash
npm run build            # Compile TypeScript
npm run dev              # Watch mode
npm test                 # Run all tests
npm run test:coverage    # Coverage report
```

## Troubleshooting

**"Unknown connection profile"** — The profile name in your tool call doesn't match what's in the config. Check spelling.

**"connect ECONNREFUSED"** — The database isn't running or the host/port is wrong. Verify the database is accessible.

**"Cannot find module"** — Run `npm run build` first. Check the path in `.mcp.json` is absolute and correct.

## License

MIT
