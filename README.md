# SQL Server MCP Server

A secure, read-only Model Context Protocol (MCP) server that enables AI assistants like Cursor to safely query and explore SQL Server databases.

## 🎯 What is this?

This MCP server acts as a bridge between Cursor AI and your SQL Server databases. It provides safe, read-only access so AI can help you understand your database schema, query data, and discover relationships—all without risking data modification.

## ✨ Features

- 🔒 **Read-Only by Design** - Only SELECT queries allowed, preventing accidental data changes
- 🔐 **Secure by Default** - SQL injection prevention, parameterized queries, encrypted connections
- 📊 **Multiple Connection Profiles** - Connect to multiple databases (local, staging, production)
- 🔗 **Relationship Discovery** - Automatically discover foreign key relationships between tables
- ⚡ **Safety Features** - Automatic row limiting, query timeouts, cross-database blocking
- 🧩 **Extensible Architecture** - Easy to add custom tools and resources

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- SQL Server (local or remote)
- Cursor IDE

### Installation

```bash
# Clone or download the project
cd sqlserver-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

### Configuration

1. **Create `config.json`** in the project root:

```json
{
  "local": {
    "server": "localhost",
    "database": "MyDatabase",
    "user": "readonly_user",
    "password": "your_password",
    "options": {
      "encrypt": false,
      "trustServerCertificate": true
    }
  },
  "production": {
    "server": "prod.database.windows.net",
    "database": "ProdDB",
    "user": "readonly_user",
    "password": "your_prod_password",
    "options": {
      "encrypt": true,
      "trustServerCertificate": false,
      "applicationIntent": "ReadOnly"
    }
  }
}
```

> ⚠️ **Important:** `config.json` is in `.gitignore` - never commit credentials!

2. **Configure Cursor MCP Settings**

Open Cursor Settings → MCP Servers and add:

```json
{
  "mcpServers": {
    "sqlserver": {
      "command": "node",
      "args": ["/absolute/path/to/sqlserver-mcp/build/index.js"],
      "env": {
        "SQLSERVER_CONFIG_FILE": "/absolute/path/to/sqlserver-mcp/config.json"
      }
    }
  }
}
```

Replace `/absolute/path/to/sqlserver-mcp` with your actual installation path.

3. **Restart Cursor**

That's it! Cursor AI can now query your databases.

## 📖 Usage Examples

### Query Data

Ask Cursor:
- *"Show me the top 10 users from the local database"*
- *"What are the recent orders in production?"*
- *"Find all products with price greater than $100"*

### Explore Schema

- *"List all tables in the production database"*
- *"Show me the schema for the Users table"*
- *"What are the relationships for the Orders table?"*

### Discover Relationships

- *"How is the Orders table related to other tables?"*
- *"Show me foreign keys for the Products table"*

## 🛠️ Available Tools

The MCP server provides these tools for AI to use:

| Tool | Description |
|------|-------------|
| `query-data` | Execute SELECT queries with automatic safety limits |
| `list-tables` | List all tables with row counts |
| `get-table-preview` | Preview sample data from a table |
| `get-table-relations` | Discover foreign key relationships |

## 🔒 Security Features

### Automatic Safety

- **Row Limiting**: Queries automatically limited to 1000 rows (configurable)
- **Query Timeout**: 30 seconds default (configurable per profile)
- **Cross-Database Blocking**: Prevents queries accessing other databases
- **Read-Only Enforcement**: Only SELECT statements allowed
- **SQL Injection Prevention**: All inputs parameterized

### Best Practices

1. **Use Read-Only Database Users**
   ```sql
   CREATE USER readonly_user WITH PASSWORD 'secure_password';
   GRANT SELECT ON SCHEMA::dbo TO readonly_user;
   ```

2. **Enable Encryption** (especially for production)
   ```json
   "options": {
     "encrypt": true,
     "trustServerCertificate": false
   }
   ```

3. **Set Application Intent** (for Azure SQL)
   ```json
   "options": {
     "applicationIntent": "ReadOnly"
   }
   ```

## 📁 Project Structure

```
sqlserver-mcp/
├── src/
│   ├── tools/          # MCP tools (query-data, list-tables, etc.)
│   ├── resources/      # MCP resources (schema info, etc.)
│   ├── database/       # Connection management & query execution
│   ├── config/         # Configuration loading
│   └── utils/          # Validation & error handling
├── tests/              # Unit tests
├── config.json         # Your database connections (not committed)
└── package.json
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## 🔧 Development

```bash
# Build TypeScript
npm run build

# Watch mode for development
npm run dev

# Start server manually
npm start
```

## 📝 Configuration Options

### Connection Profile Options

```json
{
  "profile_name": {
    "server": "hostname or IP",
    "database": "database_name",
    "user": "username",
    "password": "password",
    "port": 1433,                    // Optional, defaults to 1433
    "options": {
      "encrypt": true,               // Enable TLS encryption
      "trustServerCertificate": false, // Verify certificate
      "applicationIntent": "ReadOnly", // Azure SQL read routing
      "requestTimeout": 30000,        // Query timeout in ms
      "connectionTimeout": 15000      // Connection timeout in ms
    }
  }
}
```

## 🎓 How It Works

1. **Cursor AI** sends a request through the MCP protocol
2. **MCP Server** validates the request and checks security
3. **Query Executor** safely executes the query with limits
4. **Results** are returned to Cursor AI in a structured format

All queries are:
- ✅ Validated as read-only
- ✅ Parameterized to prevent injection
- ✅ Limited in row count and timeout
- ✅ Sanitized for error messages

## 🐛 Troubleshooting

### "Cannot find module" error
- Make sure you've run `npm run build`
- Check the path in Cursor settings is absolute and correct

### "Unknown connection profile" error
- Verify the profile name matches exactly in `config.json`
- Check the profile name is spelled correctly in your query

### Connection timeout
- Verify SQL Server is accessible from your machine
- Check firewall rules allow connections
- Increase `connectionTimeout` in config if needed

### Query timeout
- Simplify your query or add WHERE filters
- Increase `requestTimeout` in config options

## 📚 Learn More

- [Model Context Protocol](https://modelcontextprotocol.io/) - Official MCP documentation
- [EXTENSIONS.md](./EXTENSIONS.md) - Guide for creating custom tools
- [mssql Documentation](https://github.com/tediousjs/node-mssql) - SQL Server driver docs

## 🤝 Contributing

This project follows SOLID principles and includes comprehensive tests. When adding features:

1. Create tests first
2. Follow existing code patterns
3. Ensure all tests pass
4. Update documentation

## 📄 License

MIT License - feel free to use and modify as needed.

## ⚡ Quick Tips

- **Multiple Profiles**: Use descriptive names like `local_dev`, `staging`, `production`
- **Security**: Always use read-only database users in production
- **Performance**: Add indexes to frequently queried columns
- **Debugging**: Check Cursor's MCP logs for detailed error messages

---

**Made with ❤️ for safer AI-database interactions**
