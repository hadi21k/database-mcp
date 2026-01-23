import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';

/**
 * Tool: Get foreign key relationships for a table
 * 
 * Returns both incoming (referenced by other tables) and outgoing (references other tables)
 * foreign key relationships with detailed column mappings for joins.
 */
export class GetTableRelationsTool extends BaseTool {
  readonly name = 'get-table-relations';
  readonly description = 'Get foreign key relationships for a SQL Server table. Returns both incoming relationships (other tables that reference this table) and outgoing relationships (foreign keys from this table to other tables). Includes column mappings for constructing JOIN queries.';
  
  readonly inputSchema = z.object({
    profile: z.string().describe('Connection profile name'),
    schema: z.string().describe('Schema name (e.g., "dbo")'),
    table: z.string().describe('Table name'),
  });

  async execute(input: any) {
    const validated = this.validateInput(input);
    
    const relations = await this.queryExecutor.getTableRelations(
      validated.profile,
      validated.schema,
      validated.table
    );

    return {
      success: true,
      data: {
        schema: validated.schema,
        table: validated.table,
        fullName: `${validated.schema}.${validated.table}`,
        outgoingRelations: relations.outgoing.map((rel) => ({
          foreignKeyName: rel.foreignKeyName,
          referencedSchema: rel.referencedSchema,
          referencedTable: rel.referencedTable,
          referencedFullName: `${rel.referencedSchema}.${rel.referencedTable}`,
          columns: rel.columns,
          joinHint: `JOIN ${rel.referencedSchema}.${rel.referencedTable} ON ${rel.columns.map(c => `${validated.schema}.${validated.table}.${c.fromColumn} = ${rel.referencedSchema}.${rel.referencedTable}.${c.toColumn}`).join(' AND ')}`,
        })),
        incomingRelations: relations.incoming.map((rel) => ({
          foreignKeyName: rel.foreignKeyName,
          referencingSchema: rel.referencingSchema,
          referencingTable: rel.referencingTable,
          referencingFullName: `${rel.referencingSchema}.${rel.referencingTable}`,
          columns: rel.columns,
          joinHint: `JOIN ${rel.referencingSchema}.${rel.referencingTable} ON ${validated.schema}.${validated.table}.${rel.columns.map(c => c.toColumn).join(', ')} = ${rel.referencingSchema}.${rel.referencingTable}.${rel.columns.map(c => c.fromColumn).join(', ')}`,
        })),
        summary: {
          totalOutgoing: relations.outgoing.length,
          totalIncoming: relations.incoming.length,
          totalRelationships: relations.outgoing.length + relations.incoming.length,
        },
      },
    };
  }
}
