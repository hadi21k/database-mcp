import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';

/**
 * Tool: Get preview data from a table
 */
export class GetTablePreviewTool extends BaseTool {
  readonly name = 'get-table-preview';
  readonly description = 'Get a preview of data from a SQL Server table. Returns the first N rows (default 10, max 100).';
  
  readonly inputSchema = z.object({
    profile: z.string().describe('Connection profile name'),
    schema: z.string().describe('Schema name (e.g., "dbo")'),
    table: z.string().describe('Table name'),
    limit: z.number().min(1).max(100).optional().describe('Number of rows to return (default 10, max 100)'),
  });

  async execute(input: any) {
    const validated = this.validateInput(input);
    
    const result = await this.queryExecutor.getTablePreview(
      validated.profile,
      validated.schema,
      validated.table,
      validated.limit || 10
    );

    return {
      success: true,
      data: {
        schema: validated.schema,
        table: validated.table,
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount,
      },
    };
  }
}
