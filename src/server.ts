import { createRequire } from 'module';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ConnectionManager } from './database/connection-manager.js';
import { ToolRegistry } from './core/tool-registry.js';
import { ResourceRegistry } from './core/resource-registry.js';
import { ListSchemasTool, ListTablesTool, DescribeTableTool, GetRelationshipsTool, GetIndexesTool, RunSelectQueryTool, ExplainQueryTool, EstimateCostTool, ListMaterializedViewsTool, ListExtensionsTool, ListEnumsTool } from './tools/index.js';
import { TableSchemaResource, DatabaseInfoResource, ConnectionProfilesResource } from './resources/index.js';
import { ServerConfig } from './config/types.js';

const pkg = createRequire(import.meta.url)('../package.json') as { name: string; version: string };

/**
 * Turn a kebab-case tool name into a Title Case display title.
 * e.g. 'list-schemas' -> 'List Schemas'
 */
function toTitle(name: string): string {
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

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
      name: pkg.name,
      version: pkg.version,
    });

    // Initialize managers
    this.connectionManager = new ConnectionManager();
    this.toolRegistry = new ToolRegistry();
    this.resourceRegistry = new ResourceRegistry();

    // Load connection profiles
    this.loadProfiles(config);

    // Register built-in tools and resources
    this.registerBuiltins();

    // Wire tools and resources into the MCP server
    this.setupTools();
    this.setupResources();
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
   * Wire every registered tool into the MCP server. Each tool exposes its own
   * name/description/Zod input schema, so registration is a single loop instead
   * of per-tool boilerplate. Every tool here is read-only, advertised via the
   * readOnlyHint annotation.
   */
  private setupTools(): void {
    for (const tool of this.toolRegistry.getAll()) {
      this.server.registerTool(
        tool.name,
        {
          title: toTitle(tool.name),
          description: tool.description,
          inputSchema: tool.inputSchema.shape,
          annotations: { readOnlyHint: true },
        },
        async (args: unknown) => {
          try {
            const result = await tool.execute(args);
            return {
              content: [{ type: 'text' as const, text: JSON.stringify(result) }],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                  }),
                },
              ],
              isError: true,
            };
          }
        }
      );
    }
  }

  /**
   * Wire every registered resource into the MCP server so clients can list and
   * read them. Resources with `{param}` placeholders are registered as URI
   * templates; the rest as static URIs.
   */
  private setupResources(): void {
    for (const resource of this.resourceRegistry.getAll()) {
      const read = async (uri: URL) => {
        const text = await resource.getContent(uri.href);
        return {
          contents: [{ uri: uri.href, mimeType: resource.mimeType, text }],
        };
      };

      const config = { description: resource.description, mimeType: resource.mimeType };

      if (resource.uriTemplate.includes('{')) {
        this.server.registerResource(
          resource.name,
          new ResourceTemplate(resource.uriTemplate, { list: undefined }),
          config,
          read
        );
      } else {
        this.server.registerResource(resource.name, resource.uriTemplate, config, read);
      }
    }
  }

  /**
   * Start the MCP server with stdio transport
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error(`${pkg.name} v${pkg.version} started`);
    console.error(`Profiles: ${this.connectionManager.getProfileNames().join(', ')}`);
  }

  /**
   * Shutdown the server gracefully
   */
  async shutdown(): Promise<void> {
    console.error('Shutting down database MCP server...');
    await this.connectionManager.closeAll();
    await this.server.close();
    console.error('Server shutdown complete');
  }
}
