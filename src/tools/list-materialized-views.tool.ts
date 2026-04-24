import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';

/**
 * Tool to list materialized views in a PostgreSQL database.
 * Queries pg_matviews for materialized view listing with size and population status.
 * PostgreSQL-specific — throws an error if used with a non-PostgreSQL profile.
 */
export class ListMaterializedViewsTool extends BaseTool {
  readonly name = 'list-materialized-views';
  readonly description =
    'List materialized views in a PostgreSQL database with schema, definition, size, and population status. PostgreSQL only.';

  readonly inputSchema = z.object({
    profile: z.string().describe('Connection profile name'),
    schema: z
      .string()
      .optional()
      .describe('Optional schema filter. If not provided, returns materialized views from all schemas.'),
  });

  async execute(input: any) {
    const validatedInput = this.validateInput(input);
    const { profile, schema } = validatedInput;

    const driver = await this.getDriver(profile);

    if (driver.dialect !== 'postgresql') {
      throw new Error('list-materialized-views is only available for PostgreSQL databases.');
    }

    let query: string;
    const params: Record<string, any> = {};

    if (schema) {
      query = `
        SELECT
          mv.schemaname AS "schema",
          mv.matviewname AS "name",
          mv.matviewowner AS "owner",
          mv.ispopulated AS "isPopulated",
          mv.definition AS "definition",
          pg_size_pretty(pg_relation_size(quote_ident(mv.schemaname) || '.' || quote_ident(mv.matviewname))) AS "size",
          pg_relation_size(quote_ident(mv.schemaname) || '.' || quote_ident(mv.matviewname)) AS "sizeBytes"
        FROM pg_catalog.pg_matviews mv
        WHERE mv.schemaname = @schema
        ORDER BY mv.schemaname, mv.matviewname
      `;
      params.schema = schema;
    } else {
      query = `
        SELECT
          mv.schemaname AS "schema",
          mv.matviewname AS "name",
          mv.matviewowner AS "owner",
          mv.ispopulated AS "isPopulated",
          mv.definition AS "definition",
          pg_size_pretty(pg_relation_size(quote_ident(mv.schemaname) || '.' || quote_ident(mv.matviewname))) AS "size",
          pg_relation_size(quote_ident(mv.schemaname) || '.' || quote_ident(mv.matviewname)) AS "sizeBytes"
        FROM pg_catalog.pg_matviews mv
        WHERE mv.schemaname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY mv.schemaname, mv.matviewname
      `;
    }

    const result = await driver.executeQuery(query, Object.keys(params).length > 0 ? params : undefined);

    return {
      success: true,
      data: {
        materializedViews: result.rows,
        count: result.rowCount,
      },
    };
  }
}
