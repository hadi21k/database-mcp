import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ConnectionManager } from './database/connection-manager.js';
import { QueryExecutor } from './database/query-executor.js';
import { ToolRegistry } from './core/tool-registry.js';
import { ResourceRegistry } from './core/resource-registry.js';
import { QueryDataTool, ListTablesTool, GetTablePreviewTool, GetTableRelationsTool } from './tools/index.js';
import { TableSchemaResource, DatabaseInfoResource, ConnectionProfilesResource } from './resources/index.js';
import { ServerConfig } from './config/types.js';

/**
 * SQL Server MCP Server
 */
export class SqlServerMcpServer {
  private server: McpServer;
  private connectionManager: ConnectionManager;
  private queryExecutor: QueryExecutor;
  private toolRegistry: ToolRegistry;
  private resourceRegistry: ResourceRegistry;

  constructor(config: ServerConfig) {
    this.server = new McpServer({
      name: 'sqlserver-mcp',
      version: '1.0.0',
    });

    // Initialize managers
    this.connectionManager = new ConnectionManager();
    this.queryExecutor = new QueryExecutor(this.connectionManager);
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
    this.toolRegistry.register(new QueryDataTool(this.connectionManager, this.queryExecutor));
    this.toolRegistry.register(new ListTablesTool(this.connectionManager, this.queryExecutor));
    this.toolRegistry.register(new GetTablePreviewTool(this.connectionManager, this.queryExecutor));
    this.toolRegistry.register(new GetTableRelationsTool(this.connectionManager, this.queryExecutor));

    // Register resources
    this.resourceRegistry.register(new TableSchemaResource(this.connectionManager, this.queryExecutor));
    this.resourceRegistry.register(new DatabaseInfoResource(this.connectionManager, this.queryExecutor));
    this.resourceRegistry.register(new ConnectionProfilesResource(this.connectionManager, this.queryExecutor));
  }

  /**
   * Setup MCP tools using the new API
   */
  private setupTools(): void {
    // Register query-data tool
    this.server.registerTool(
      'query-data',
      {
        title: 'Query Data',
        description: 'Execute a SELECT query against a SQL Server database with optional parameters. Only SELECT queries are allowed for security.',
        inputSchema: {
          profile: z.string().describe('Connection profile name'),
          query: z.string().describe('SQL SELECT query to execute'),
          parameters: z.record(z.any()).optional().describe('Query parameters as key-value pairs'),
        },
      },
      async (args: any) => {
        try {
          const queryTool = this.toolRegistry.get('query-data');
          if (!queryTool) throw new Error('Query tool not found');

          const result = await queryTool.execute(args);
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
        description: 'List all tables in the specified SQL Server database with their schemas and row counts.',
        inputSchema: {
          profile: z.string().describe('Connection profile name'),
        },
      },
      async (args: any) => {
        try {
          const listTool = this.toolRegistry.get('list-tables');
          if (!listTool) throw new Error('List tables tool not found');

          const result = await listTool.execute(args);
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

    // Register get-table-preview tool
    this.server.registerTool(
      'get-table-preview',
      {
        title: 'Get Table Preview',
        description: 'Get a preview of data from a SQL Server table. Returns the first N rows (default 10, max 100).',
        inputSchema: {
          profile: z.string().describe('Connection profile name'),
          schema: z.string().describe('Schema name (e.g., "dbo")'),
          table: z.string().describe('Table name'),
          limit: z.number().min(1).max(100).optional().describe('Number of rows to return (default 10, max 100)'),
        },
      },
      async (args: any) => {
        try {
          const previewTool = this.toolRegistry.get('get-table-preview');
          if (!previewTool) throw new Error('Table preview tool not found');

          const result = await previewTool.execute(args);
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

    // Register get-table-relations tool
    this.server.registerTool(
      'get-table-relations',
      {
        title: 'Get Table Relations',
        description: 'Get foreign key relationships for a SQL Server table. Returns both incoming and outgoing relationships with column mappings for JOIN queries.',
        inputSchema: {
          profile: z.string().describe('Connection profile name'),
          schema: z.string().describe('Schema name (e.g., "dbo")'),
          table: z.string().describe('Table name'),
        },
      },
      async (args: any) => {
        try {
          const relationsTool = this.toolRegistry.get('get-table-relations');
          if (!relationsTool) throw new Error('Table relations tool not found');

          const result = await relationsTool.execute(args);
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
