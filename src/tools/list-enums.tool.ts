import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';

/**
 * Tool to list user-defined enum types in a PostgreSQL database.
 * Queries pg_type + pg_enum for enum types and their values.
 * PostgreSQL-specific — throws an error if used with a non-PostgreSQL profile.
 */
export class ListEnumsTool extends BaseTool {
  readonly name = 'list-enums';
  readonly description =
    'List user-defined enum types with their allowed values. PostgreSQL only.';

  readonly inputSchema = z.object({
    profile: z.string().describe('Connection profile name'),
    schema: z
      .string()
      .optional()
      .describe('Optional schema filter. If not provided, returns enums from all user schemas.'),
  });

  async execute(input: any) {
    const validatedInput = this.validateInput(input);
    const { profile, schema } = validatedInput;

    const driver = await this.getDriver(profile);

    if (driver.dialect !== 'postgresql') {
      throw new Error('list-enums is only available for PostgreSQL databases.');
    }

    let query: string;
    const params: Record<string, any> = {};

    if (schema) {
      query = `
        SELECT
          n.nspname AS "schema",
          t.typname AS "name",
          array_agg(e.enumlabel ORDER BY e.enumsortorder) AS "values"
        FROM pg_catalog.pg_type t
        JOIN pg_catalog.pg_enum e ON t.oid = e.enumtypid
        JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = @schema
        GROUP BY n.nspname, t.typname
        ORDER BY n.nspname, t.typname
      `;
      params.schema = schema;
    } else {
      query = `
        SELECT
          n.nspname AS "schema",
          t.typname AS "name",
          array_agg(e.enumlabel ORDER BY e.enumsortorder) AS "values"
        FROM pg_catalog.pg_type t
        JOIN pg_catalog.pg_enum e ON t.oid = e.enumtypid
        JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        GROUP BY n.nspname, t.typname
        ORDER BY n.nspname, t.typname
      `;
    }

    const result = await driver.executeQuery(query, Object.keys(params).length > 0 ? params : undefined);

    return {
      success: true,
      data: {
        enums: result.rows,
        count: result.rowCount,
      },
    };
  }
}
