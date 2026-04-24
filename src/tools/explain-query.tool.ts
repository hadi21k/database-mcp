import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { isReadOnlyQuery } from '../utils/validation.js';

/**
 * Tool to get the execution plan for a query.
 * PostgreSQL: uses EXPLAIN (FORMAT JSON)
 * SQL Server: uses SET SHOWPLAN_TEXT ON
 */
export class ExplainQueryTool extends BaseTool {
  readonly name = 'explain-query';
  readonly description =
    'Get the estimated execution plan for a query without executing it. Returns the execution plan with operator details, estimated costs, and row counts. Useful for query optimization.';

  readonly inputSchema = z.object({
    profile: z.string().describe('Connection profile name'),
    query: z.string().describe('SQL SELECT query to analyze'),
    parameters: z
      .record(z.any())
      .optional()
      .describe('Query parameters as key-value pairs (for parameterized queries)'),
  });

  async execute(input: any) {
    const validatedInput = this.validateInput(input);
    const { profile, query, parameters } = validatedInput;

    if (!isReadOnlyQuery(query)) {
      throw new Error(
        'Only SELECT queries can be explained. INSERT, UPDATE, DELETE, and DDL statements are not permitted.'
      );
    }

    const driver = await this.getDriver(profile);

    let explainQuery: string;
    if (driver.dialect === 'postgresql') {
      explainQuery = `EXPLAIN (FORMAT JSON) ${query}`;
    } else {
      explainQuery = `SET SHOWPLAN_TEXT ON; ${query}; SET SHOWPLAN_TEXT OFF`;
    }

    const result = await driver.executeQuery(explainQuery, parameters);

    return {
      success: true,
      data: {
        dialect: driver.dialect,
        plan: result.rows,
        rowCount: result.rowCount,
      },
    };
  }
}
