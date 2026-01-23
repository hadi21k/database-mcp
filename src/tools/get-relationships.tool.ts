import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';

/**
 * Tool to get foreign key relationships for a table
 * Returns both outgoing (this table references others) and incoming (others reference this table) relationships
 */
export class GetRelationshipsTool extends BaseTool {
  readonly name = 'get-relationships';
  readonly description = 'Get foreign key relationships for a SQL Server table. Returns both outgoing relationships (this table references other tables) and incoming relationships (other tables reference this table) with column mappings and suggested JOIN syntax.';
  
  readonly inputSchema = z.object({
    profile: z.string().describe('Connection profile name'),
    schema: z.string().describe('Schema name (e.g., "dbo")'),
    table: z.string().describe('Table name'),
  });

  async execute(input: any) {
    const validatedInput = this.validateInput(input);
    const { profile, schema, table } = validatedInput;

    const relations = await this.queryExecutor.getTableRelations(profile, schema, table);

    // Add helper information for JOINs
    const outgoingWithHints = relations.outgoing.map(rel => ({
      ...rel,
      referencedFullName: `${rel.referencedSchema}.${rel.referencedTable}`,
      joinHint: this.generateJoinHint(schema, table, rel.referencedSchema, rel.referencedTable, rel.columns),
    }));

    const incomingWithHints = relations.incoming.map(rel => ({
      ...rel,
      referencingFullName: `${rel.referencingSchema}.${rel.referencingTable}`,
      joinHint: this.generateJoinHint(rel.referencingSchema, rel.referencingTable, schema, table, rel.columns),
    }));

    return {
      success: true,
      data: {
        schema,
        table,
        fullName: `${schema}.${table}`,
        outgoingRelations: outgoingWithHints,
        incomingRelations: incomingWithHints,
        summary: {
          totalOutgoing: outgoingWithHints.length,
          totalIncoming: incomingWithHints.length,
          totalRelationships: outgoingWithHints.length + incomingWithHints.length,
        },
      },
    };
  }

  /**
   * Generate SQL JOIN hint for a relationship
   */
  private generateJoinHint(
    fromSchema: string,
    fromTable: string,
    toSchema: string,
    toTable: string,
    columns: Array<{ fromColumn: string; toColumn: string }>
  ): string {
    const joinConditions = columns
      .map(col => `${fromSchema}.${fromTable}.${col.fromColumn} = ${toSchema}.${toTable}.${col.toColumn}`)
      .join(' AND ');

    return `JOIN ${toSchema}.${toTable} ON ${joinConditions}`;
  }
}
