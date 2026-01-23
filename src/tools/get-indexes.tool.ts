import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';

/**
 * Tool to get all indexes for a table
 * Returns detailed index information including type, columns, uniqueness, and statistics
 */
export class GetIndexesTool extends BaseTool {
  readonly name = 'get-indexes';
  readonly description = 'Get all indexes for a SQL Server table including clustered/non-clustered indexes, primary keys, unique constraints, key columns, included columns, filter definitions, and index statistics.';

  readonly inputSchema = z.object({
    profile: z.string().describe('Connection profile name'),
    schema: z.string().describe('Schema name (e.g., "dbo")'),
    table: z.string().describe('Table name'),
  });

  async execute(input: any) {
    const validatedInput = this.validateInput(input);
    const { profile, schema, table } = validatedInput;

    const indexes = await this.queryExecutor.getTableIndexes(profile, schema, table);

    return {
      success: true,
      data: {
        schema,
        table,
        fullName: `${schema}.${table}`,
        indexes,
        summary: {
          totalIndexes: indexes.length,
          clusteredIndexes: indexes.filter(i => i.type === 'CLUSTERED').length,
          nonClusteredIndexes: indexes.filter(i => i.type === 'NONCLUSTERED').length,
          uniqueIndexes: indexes.filter(i => i.isUnique).length,
          primaryKeyIndexes: indexes.filter(i => i.isPrimaryKey).length,
          disabledIndexes: indexes.filter(i => i.isDisabled).length,
        },
      },
    };
  }
}
