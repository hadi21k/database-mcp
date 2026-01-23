import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';

/**
 * Tool: Execute SELECT queries with parameters (with safety features)
 * 
 * Safety features:
 * - Enforces max rows (default 1000) by injecting TOP clause if missing
 * - Query timeout configured at connection profile level (default 30s)
 * - Blocks cross-database queries (three-part names)
 * - Only SELECT statements allowed
 * 
 * Note: Timeout is configured in the connection profile's requestTimeout option.
 * The timeout parameter here is for reference/documentation only.
 */
export class QueryDataTool extends BaseTool {
  readonly name = 'query-data';
  readonly description = 'Execute a SELECT query against a SQL Server database with optional parameters. Only SELECT queries are allowed. Automatically limits results to max 1000 rows for safety. Blocks cross-database queries. Timeout is configured at connection level (default 30s).';
  
  readonly inputSchema = z.object({
    profile: z.string().describe('Connection profile name'),
    query: z.string().describe('SQL SELECT query to execute'),
    parameters: z.record(z.any()).optional().describe('Query parameters as key-value pairs'),
    maxRows: z.number().min(1).max(10000).optional().describe('Maximum rows to return (default 1000, max 10000). TOP clause is auto-injected if missing.'),
  });

  async execute(input: any) {
    const validated = this.validateInput(input);
    
    const result = await this.queryExecutor.executeQuerySafe(
      validated.profile,
      validated.query,
      {
        parameters: validated.parameters,
        maxRows: validated.maxRows || 1000,
      }
    );

    return {
      success: true,
      data: {
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount,
        limited: result.limited,
      },
      metadata: {
        maxRows: validated.maxRows || 1000,
      },
    };
  }
}
