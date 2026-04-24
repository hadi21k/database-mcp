import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { isReadOnlyQuery } from '../utils/validation.js';

/**
 * Tool to estimate the execution cost for a query.
 * PostgreSQL: uses EXPLAIN (FORMAT JSON) and extracts cost metrics
 * SQL Server: uses SET SHOWPLAN_ALL ON for detailed cost breakdown
 */
export class EstimateCostTool extends BaseTool {
  readonly name = 'estimate-cost';
  readonly description =
    'Estimate the execution cost for a query. Returns estimated cost, row counts, operator types, and other performance metrics. Useful for comparing query performance.';

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
        'Only SELECT queries can be analyzed. INSERT, UPDATE, DELETE, and DDL statements are not permitted.'
      );
    }

    const driver = await this.getDriver(profile);

    let costQuery: string;
    if (driver.dialect === 'postgresql') {
      costQuery = `EXPLAIN (FORMAT JSON) ${query}`;
    } else {
      costQuery = `SET SHOWPLAN_ALL ON; ${query}; SET SHOWPLAN_ALL OFF`;
    }

    const result = await driver.executeQuery(costQuery, parameters);

    if (driver.dialect === 'postgresql' && result.rows.length > 0) {
      const plan = result.rows[0]?.['QUERY PLAN'] || result.rows[0];
      const topNode = Array.isArray(plan) ? plan[0]?.Plan : plan?.Plan;

      if (topNode) {
        return {
          success: true,
          data: {
            dialect: driver.dialect,
            estimatedTotalCost: topNode['Total Cost'],
            estimatedStartupCost: topNode['Startup Cost'],
            estimatedRows: topNode['Plan Rows'],
            estimatedWidth: topNode['Plan Width'],
            nodeType: topNode['Node Type'],
            fullPlan: plan,
          },
        };
      }
    }

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
