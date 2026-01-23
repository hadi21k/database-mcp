import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';

/**
 * Tool to list all schemas in a SQL Server database
 * Returns schemas with owner information and table counts
 */
export class ListSchemasTool extends BaseTool {
  readonly name = 'list-schemas';
  readonly description = 'List all schemas in the SQL Server database with owner information and table counts. Excludes system schemas by default.';

  readonly inputSchema = z.object({
    profile: z.string().describe('Connection profile name'),
    includeSystem: z.boolean().optional().describe('Include system schemas (default: false)'),
  });

  async execute(input: any) {
    const validatedInput = this.validateInput(input);
    const { profile, includeSystem } = validatedInput;

    const result = await this.queryExecutor.listSchemas(profile, includeSystem || false);

    return {
      success: true,
      data: {
        schemas: result,
        summary: {
          totalSchemas: result.length,
          userSchemas: result.filter(s => !s.isSystemSchema).length,
          systemSchemas: result.filter(s => s.isSystemSchema).length,
          totalTables: result.reduce((sum, s) => sum + s.tableCount, 0),
        },
      },
    };
  }
}
