import { z } from 'zod';
import { ConnectionManager } from '../database/connection-manager.js';
import { QueryExecutor } from '../database/query-executor.js';

/**
 * Base class for all MCP tools
 * Provides structure and shared functionality for tool implementations
 */
export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: z.ZodObject<any>;

  constructor(
    protected connectionManager: ConnectionManager,
    protected queryExecutor: QueryExecutor
  ) {}

  /**
   * Execute the tool with validated input
   */
  abstract execute(input: any): Promise<any>;

  /**
   * Validate input against schema
   */
  protected validateInput(input: any): any {
    return this.inputSchema.parse(input);
  }

  /**
   * Get tool definition for MCP protocol
   */
  getDefinition() {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.zodToJsonSchema(this.inputSchema),
    };
  }

  /**
   * Convert Zod schema to JSON Schema for MCP protocol
   */
  private zodToJsonSchema(schema: z.ZodObject<any>): any {
    const shape = schema.shape;
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodType = value as z.ZodTypeAny;
      properties[key] = this.zodTypeToJsonSchema(zodType);

      // Check if field is required (not optional)
      if (!zodType.isOptional()) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required,
    };
  }

  /**
   * Convert individual Zod type to JSON Schema type
   */
  private zodTypeToJsonSchema(zodType: z.ZodTypeAny): any {
    const typeName = zodType._def.typeName;

    switch (typeName) {
      case 'ZodString':
        return { type: 'string' };
      case 'ZodNumber':
        return { type: 'number' };
      case 'ZodBoolean':
        return { type: 'boolean' };
      case 'ZodObject':
        return this.zodToJsonSchema(zodType as z.ZodObject<any>);
      case 'ZodArray':
        return {
          type: 'array',
          items: this.zodTypeToJsonSchema((zodType as z.ZodArray<any>)._def.type),
        };
      case 'ZodRecord':
        return {
          type: 'object',
          additionalProperties: true,
        };
      case 'ZodOptional':
        return this.zodTypeToJsonSchema((zodType as z.ZodOptional<any>)._def.innerType);
      default:
        return { type: 'string' };
    }
  }
}
