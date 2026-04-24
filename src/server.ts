import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ConnectionManager } from './database/connection-manager.js';
import { ToolRegistry } from './core/tool-registry.js';
import { ResourceRegistry } from './core/resource-registry.js';
import { ListSchemasTool, ListTablesTool, DescribeTableTool, GetRelationshipsTool, GetIndexesTool, RunSelectQueryTool, ExplainQueryTool, EstimateCostTool, ListMaterializedViewsTool, ListExtensionsTool, ListEnumsTool } from './tools/index.js';
import { TableSchemaResource, DatabaseInfoResource, ConnectionProfilesResource } from './resources/index.js';
import { ServerConfig } from './config/types.js';

/**
 * Multi-Database MCP Server
 */
export class SqlServerMcpServer {
  private server: McpServer;
  private connectionManager: ConnectionManager;
  private toolRegistry: ToolRegistry;
  private resourceRegistry: ResourceRegistry;

  constructor(config: ServerConfig) {
    this.server = new McpServer({
      name: 'sqlserver-mcp',
      version: '1.0.0',
    });

    // Initialize managers
    this.connectionManager = new ConnectionManager();
    this.toolRegistry = new ToolRegistry();
    this.resourceRegistry = new ResourceRegistry();

    // Load connection profiles
    this.loadProfiles(config);

    // Register built-in tools and resources
    this.registerBuiltins();

    // Setup MCP tools using the new API
    this.setupTools();
  }

  /**
   * Load connection profiles from config
   */
  private loadProfiles(config: ServerConfig): void {
    for (const [name, profile] of Object.entries(config.connections)) {
      this.connectionManager.addProfile(name, profile);
    }
  }

  /**
   * Register built-in tools and resources
   */
  private registerBuiltins(): void {
    // Register tools
    this.toolRegistry.register(new ListSchemasTool(this.connectionManager));
    this.toolRegistry.register(new ListTablesTool(this.connectionManager));
    this.toolRegistry.register(new DescribeTableTool(this.connectionManager));
    this.toolRegistry.register(new GetRelationshipsTool(this.connectionManager));
    this.toolRegistry.register(new GetIndexesTool(this.connectionManager));
    this.toolRegistry.register(new RunSelectQueryTool(this.connectionManager));
    this.toolRegistry.register(new ExplainQueryTool(this.connectionManager));
    this.toolRegistry.register(new EstimateCostTool(this.connectionManager));
    this.toolRegistry.register(new ListMaterializedViewsTool(this.connectionManager));
    this.toolRegistry.register(new ListExtensionsTool(this.connectionManager));
    this.toolRegistry.register(new ListEnumsTool(this.connectionManager));

    // Register resources
    this.resourceRegistry.register(new TableSchemaResource(this.connectionManager));
    this.resourceRegistry.register(new DatabaseInfoResource(this.connectionManager));
    this.resourceRegistry.register(new ConnectionProfilesResource(this.connectionManager));
  }

  /**
   * Setup MCP tools using the new API
   */
  private setupTools(): void {
    // Register list-schemas tool
    this.server.registerTool(
      'list-schemas',
      {
        title: 'List Schemas',
        description: 'List all schemas in the database with owner information and table counts. Excludes system schemas by default.',
        inputSchema: {
          profile: z.string().describe('Connection profile name'),
          includeSystem: z.boolean().optional().describe('Include system schemas (default: false)'),
        },
      },
      async (args: any) => {
        try {
          const tool = this.toolRegistry.get('list-schemas');
          if (!tool) throw new Error('List schemas tool not found');

          const result = await tool.execute(args);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          const errorMessage = JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }, null, 2);

          return {
            content: [
              {
                type: 'text' as const,
                text: errorMessage,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Register list-tables tool
    this.server.registerTool(
      'list-tables',
      {
        title: 'List Tables',
        description: 'List all tables in the database with schema, row counts, and type information (user tables only, excludes system tables).',
        inputSchema: {
          profile: z.string().describe('Connection profile name'),
          schema: z.string().optional().describe('Optional schema filter (e.g., "dbo"). If not provided, returns tables from all schemas'),
        },
      },
      async (args: any) => {
        try {
          const tool = this.toolRegistry.get('list-tables');
          if (!tool) throw new Error('List tables tool not found');

          const result = await tool.execute(args);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          const errorMessage = JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }, null, 2);

          return {
            content: [
              {
                type: 'text' as const,
                text: errorMessage,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Register describe-table tool
    this.server.registerTool(
      'describe-table',
      {
        title: 'Describe Table',
        description: 'Get detailed schema information for a table including columns, data types, nullability, primary keys, defaults, identity columns, computed columns, and column descriptions.',
        inputSchema: {
          profile: z.string().describe('Connection profile name'),
          schema: z.string().describe('Schema name (e.g., "dbo")'),
          table: z.string().describe('Table name'),
        },
      },
      async (args: any) => {
        try {
          const tool = this.toolRegistry.get('describe-table');
          if (!tool) throw new Error('Describe table tool not found');

          const result = await tool.execute(args);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          const errorMessage = JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }, null, 2);

          return {
            content: [
              {
                type: 'text' as const,
                text: errorMessage,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Register get-relationships tool
    this.server.registerTool(
      'get-relationships',
      {
        title: 'Get Relationships',
        description: 'Get foreign key relationships for a table. Returns both outgoing relationships (this table references other tables) and incoming relationships (other tables reference this table) with column mappings and suggested JOIN syntax.',
        inputSchema: {
          profile: z.string().describe('Connection profile name'),
          schema: z.string().describe('Schema name (e.g., "dbo")'),
          table: z.string().describe('Table name'),
        },
      },
      async (args: any) => {
        try {
          const tool = this.toolRegistry.get('get-relationships');
          if (!tool) throw new Error('Get relationships tool not found');

          const result = await tool.execute(args);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          const errorMessage = JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }, null, 2);

          return {
            content: [
              {
                type: 'text' as const,
                text: errorMessage,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Register get-indexes tool
    this.server.registerTool(
      'get-indexes',
      {
        title: 'Get Indexes',
        description: 'Get all indexes for a table including clustered/non-clustered indexes, primary keys, unique constraints, key columns, included columns, filter definitions, and index statistics.',
        inputSchema: {
          profile: z.string().describe('Connection profile name'),
          schema: z.string().describe('Schema name (e.g., "dbo")'),
          table: z.string().describe('Table name'),
        },
      },
      async (args: any) => {
        try {
          const tool = this.toolRegistry.get('get-indexes');
          if (!tool) throw new Error('Get indexes tool not found');

          const result = await tool.execute(args);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          const errorMessage = JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }, null, 2);

          return {
            content: [
              {
                type: 'text' as const,
                text: errorMessage,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Register run-select-query tool
    this.server.registerTool(
      'run-select-query',
      {
        title: 'Run Select Query',
        description: 'Execute a SELECT query against a database with optional parameters. Only SELECT queries are allowed for security. Results are automatically limited to prevent excessive data transfer.',
        inputSchema: {
          profile: z.string().describe('Connection profile name'),
          query: z.string().describe('SQL SELECT query to execute'),
          parameters: z.record(z.any()).optional().describe('Query parameters as key-value pairs (e.g., { "userId": 123, "status": "active" })'),
          maxRows: z.number().min(1).max(10000).optional().describe('Maximum number of rows to return (default: 1000, max: 10000)'),
        },
      },
      async (args: any) => {
        try {
          const tool = this.toolRegistry.get('run-select-query');
          if (!tool) throw new Error('Run select query tool not found');

          const result = await tool.execute(args);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          const errorMessage = JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }, null, 2);

          return {
            content: [
              {
                type: 'text' as const,
                text: errorMessage,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Register explain-query tool
    this.server.registerTool(
      'explain-query',
      {
        title: 'Explain Query',
        description: 'Get the estimated execution plan for a query without executing it. Returns the execution plan with operator details, estimated costs, and row counts. Useful for query optimization.',
        inputSchema: {
          profile: z.string().describe('Connection profile name'),
          query: z.string().describe('SQL SELECT query to analyze'),
          parameters: z.record(z.any()).optional().describe('Query parameters as key-value pairs (for parameterized queries)'),
        },
      },
      async (args: any) => {
        try {
          const tool = this.toolRegistry.get('explain-query');
          if (!tool) throw new Error('Explain query tool not found');

          const result = await tool.execute(args);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          const errorMessage = JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }, null, 2);

          return {
            content: [
              {
                type: 'text' as const,
                text: errorMessage,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Register estimate-cost tool
    this.server.registerTool(
      'estimate-cost',
      {
        title: 'Estimate Cost',
        description: 'Estimate the execution cost for a query. Returns estimated cost, row counts, operator types, and other performance metrics. Useful for comparing query performance.',
        inputSchema: {
          profile: z.string().describe('Connection profile name'),
          query: z.string().describe('SQL SELECT query to analyze'),
          parameters: z.record(z.any()).optional().describe('Query parameters as key-value pairs (for parameterized queries)'),
        },
      },
      async (args: any) => {
        try {
          const tool = this.toolRegistry.get('estimate-cost');
          if (!tool) throw new Error('Estimate cost tool not found');

          const result = await tool.execute(args);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          const errorMessage = JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }, null, 2);

          return {
            content: [
              {
                type: 'text' as const,
                text: errorMessage,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Register list-materialized-views tool (PostgreSQL only)
    this.server.registerTool(
      'list-materialized-views',
      {
        title: 'List Materialized Views',
        description: 'List materialized views in a PostgreSQL database with schema, definition, size, and population status. PostgreSQL only.',
        inputSchema: {
          profile: z.string().describe('Connection profile name'),
          schema: z.string().optional().describe('Optional schema filter. If not provided, returns materialized views from all schemas.'),
        },
      },
      async (args: any) => {
        try {
          const tool = this.toolRegistry.get('list-materialized-views');
          if (!tool) throw new Error('List materialized views tool not found');

          const result = await tool.execute(args);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          const errorMessage = JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }, null, 2);

          return {
            content: [
              {
                type: 'text' as const,
                text: errorMessage,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Register list-extensions tool (PostgreSQL only)
    this.server.registerTool(
      'list-extensions',
      {
        title: 'List Extensions',
        description: 'List installed and available PostgreSQL extensions with version information. PostgreSQL only.',
        inputSchema: {
          profile: z.string().describe('Connection profile name'),
          installedOnly: z.boolean().optional().describe('Only show installed extensions (default: false, shows both installed and available)'),
        },
      },
      async (args: any) => {
        try {
          const tool = this.toolRegistry.get('list-extensions');
          if (!tool) throw new Error('List extensions tool not found');

          const result = await tool.execute(args);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          const errorMessage = JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }, null, 2);

          return {
            content: [
              {
                type: 'text' as const,
                text: errorMessage,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Register list-enums tool (PostgreSQL only)
    this.server.registerTool(
      'list-enums',
      {
        title: 'List Enums',
        description: 'List user-defined enum types with their allowed values. PostgreSQL only.',
        inputSchema: {
          profile: z.string().describe('Connection profile name'),
          schema: z.string().optional().describe('Optional schema filter. If not provided, returns enums from all user schemas.'),
        },
      },
      async (args: any) => {
        try {
          const tool = this.toolRegistry.get('list-enums');
          if (!tool) throw new Error('List enums tool not found');

          const result = await tool.execute(args);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          const errorMessage = JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }, null, 2);

          return {
            content: [
              {
                type: 'text' as const,
                text: errorMessage,
              },
            ],
            isError: true,
          };
        }
      }
    );
  }

  /**
   * Start the MCP server with stdio transport
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('SQL Server MCP Server started');
    console.error(`Profiles: ${this.connectionManager.getProfileNames().join(', ')}`);
  }

  /**
   * Shutdown the server gracefully
   */
  async shutdown(): Promise<void> {
    console.error('Shutting down SQL Server MCP Server...');
    await this.connectionManager.closeAll();
    await this.server.close();
    console.error('Server shutdown complete');
  }
}
