import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';

/**
 * Tool: List all tables in the database
 */
export class ListTablesTool extends BaseTool {
  readonly name = 'list-tables';
  readonly description = 'List all tables in the specified SQL Server database with their schemas and row counts.';
  
  readonly inputSchema = z.object({
    profile: z.string().describe('Connection profile name'),
  });

  async execute(input: any) {
    const validated = this.validateInput(input);
    
    const tables = await this.queryExecutor.listTables(validated.profile);

    return {
      success: true,
      data: {
        tables: tables.map((t) => ({
          schema: t.schema,
          table: t.table,
          rowCount: t.rowCount,
          fullName: `${t.schema}.${t.table}`,
        })),
        count: tables.length,
      },
    };
  }
}
