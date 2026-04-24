import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';

/**
 * Tool to list all tables in a database
 * Returns tables with schema, name, row count, and type information
 */
export class ListTablesTool extends BaseTool {
  readonly name = 'list-tables';
  readonly description = 'List all tables in the database with schema, row counts, and type information (user tables only, excludes system tables).';

  readonly inputSchema = z.object({
    profile: z.string().describe('Connection profile name'),
    schema: z.string().optional().describe('Optional schema filter (e.g., "dbo"). If not provided, returns tables from all schemas'),
  });

  async execute(input: any) {
    const validatedInput = this.validateInput(input);
    const { profile, schema } = validatedInput;

    const driver = await this.getDriver(profile);
    const result = await driver.listTables(schema);

    return {
      success: true,
      data: {
        tables: result,
        summary: {
          totalTables: result.length,
          schemas: [...new Set(result.map(t => t.schema))].sort(),
          totalRows: result.reduce((sum, t) => sum + t.rowCount, 0),
        },
      },
    };
  }
}
