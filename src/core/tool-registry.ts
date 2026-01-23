import { BaseTool } from './base-tool.js';

/**
 * Registry for managing MCP tools
 */
export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();

  /**
   * Register a tool
   */
  register(tool: BaseTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Get a tool by name
   */
  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAll(): BaseTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tool definitions for MCP protocol
   */
  getDefinitions() {
    return this.getAll().map((tool) => tool.getDefinition());
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }
}
