import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';

/**
 * Tool to get detailed schema information about a table
 * Returns columns with data types, constraints, defaults, and descriptions
 */
export class DescribeTableTool extends BaseTool {
  readonly name = 'describe-table';
  readonly description = 'Get detailed schema information for a table including columns, data types, nullability, primary keys, defaults, identity columns, computed columns, and column descriptions.';

  readonly inputSchema = z.object({
    profile: z.string().describe('Connection profile name'),
    schema: z.string().describe('Schema name (e.g., "dbo")'),
    table: z.string().describe('Table name'),
  });

  async execute(input: any) {
    const validatedInput = this.validateInput(input);
    const { profile, schema, table } = validatedInput;

    const driver = await this.getDriver(profile);
    const columns = await driver.describeTable(schema, table);

    return {
      success: true,
      data: {
        schema,
        table,
        fullName: `${schema}.${table}`,
        columns,
        summary: {
          totalColumns: columns.length,
          primaryKeyColumns: columns.filter(c => c.isPrimaryKey).length,
          nullableColumns: columns.filter(c => c.isNullable).length,
          identityColumns: columns.filter(c => c.isIdentity).length,
          computedColumns: columns.filter(c => c.isComputed).length,
        },
      },
    };
  }
}
