import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { isReadOnlyQuery, validateParameters, hasCrossDatabaseQuery } from '../utils/validation.js';

/**
 * Tool to execute SELECT queries against a database
 * Provides safe query execution with parameter support and result limiting
 */
export class RunSelectQueryTool extends BaseTool {
  readonly name = 'run-select-query';
  readonly description = 'Execute a SELECT query against a database with optional parameters. Only SELECT queries are allowed for security. Results are automatically limited to prevent excessive data transfer.';

  readonly inputSchema = z.object({
    profile: z.string().describe('Connection profile name'),
    query: z.string().describe('SQL SELECT query to execute'),
    parameters: z.record(z.any()).optional().describe('Query parameters as key-value pairs (e.g., { "userId": 123, "status": "active" })'),
    maxRows: z.number().min(1).max(10000).optional().describe('Maximum number of rows to return (default: 1000, max: 10000)'),
  });

  async execute(input: any) {
    const validatedInput = this.validateInput(input);
    const { profile, query, parameters, maxRows } = validatedInput;

    // Safety validation (database-agnostic)
    if (!isReadOnlyQuery(query)) {
      throw new Error(
        'Only SELECT queries are allowed. INSERT, UPDATE, DELETE, and DDL statements are not permitted.'
      );
    }
    if (hasCrossDatabaseQuery(query)) {
      throw new Error(
        'Cross-database queries are not allowed. Use single-database queries only (schema.table, not database.schema.table).'
      );
    }
    if (parameters) {
      validateParameters(parameters);
    }

    const driver = await this.getDriver(profile);
    const result = await driver.executeQuery(query, parameters, maxRows || 1000);

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
