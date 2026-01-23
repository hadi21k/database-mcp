import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';

/**
 * Tool to execute SELECT queries against SQL Server
 * Provides safe query execution with parameter support and result limiting
 */
export class RunSelectQueryTool extends BaseTool {
  readonly name = 'run-select-query';
  readonly description = 'Execute a SELECT query against a SQL Server database with optional parameters. Only SELECT queries are allowed for security. Results are automatically limited to prevent excessive data transfer.';
  
  readonly inputSchema = z.object({
    profile: z.string().describe('Connection profile name'),
    query: z.string().describe('SQL SELECT query to execute'),
    parameters: z.record(z.any()).optional().describe('Query parameters as key-value pairs (e.g., { "userId": 123, "status": "active" })'),
    maxRows: z.number().min(1).max(10000).optional().describe('Maximum number of rows to return (default: 1000, max: 10000)'),
  });

  async execute(input: any) {
    const validatedInput = this.validateInput(input);
    const { profile, query, parameters, maxRows } = validatedInput;

    const result = await this.queryExecutor.executeQuerySafe(profile, query, {
      parameters,
      maxRows: maxRows || 1000,
    });

    return {
      success: true,
      data: {
        rows: result.rows,
        rowCount: result.rowCount,
        columns: result.columns,
        limited: result.limited || false,
        summary: {
          totalRows: result.rowCount,
          columnCount: result.columns.length,
          wasLimited: result.limited || false,
        },
      },
    };
  }
}
