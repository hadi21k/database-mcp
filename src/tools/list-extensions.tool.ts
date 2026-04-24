import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';

/**
 * Tool to list PostgreSQL extensions (installed and available).
 * Queries pg_extension and pg_available_extensions.
 * PostgreSQL-specific — throws an error if used with a non-PostgreSQL profile.
 */
export class ListExtensionsTool extends BaseTool {
  readonly name = 'list-extensions';
  readonly description =
    'List installed and available PostgreSQL extensions with version information. PostgreSQL only.';

  readonly inputSchema = z.object({
    profile: z.string().describe('Connection profile name'),
    installedOnly: z
      .boolean()
      .optional()
      .describe('Only show installed extensions (default: false, shows both installed and available)'),
  });

  async execute(input: any) {
    const validatedInput = this.validateInput(input);
    const { profile, installedOnly } = validatedInput;

    const driver = await this.getDriver(profile);

    if (driver.dialect !== 'postgresql') {
      throw new Error('list-extensions is only available for PostgreSQL databases.');
    }

    let query: string;

    if (installedOnly) {
      query = `
        SELECT
          e.extname AS "name",
          e.extversion AS "installedVersion",
          n.nspname AS "schema",
          true AS "isInstalled",
          c.description AS "comment"
        FROM pg_catalog.pg_extension e
        JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
        LEFT JOIN pg_catalog.pg_description c ON c.objoid = e.oid AND c.classoid = 'pg_extension'::regclass
        ORDER BY e.extname
      `;
    } else {
      query = `
        SELECT
          a.name AS "name",
          a.default_version AS "defaultVersion",
          e.extversion AS "installedVersion",
          COALESCE(n.nspname, '') AS "schema",
          (e.oid IS NOT NULL) AS "isInstalled",
          a.comment AS "comment"
        FROM pg_catalog.pg_available_extensions a
        LEFT JOIN pg_catalog.pg_extension e ON e.extname = a.name
        LEFT JOIN pg_catalog.pg_namespace n ON e.extnamespace = n.oid
        ORDER BY a.name
      `;
    }

    const result = await driver.executeQuery(query);

    const installed = result.rows.filter((r: any) => r.isInstalled);
    const available = result.rows.filter((r: any) => !r.isInstalled);

    return {
      success: true,
      data: {
        extensions: result.rows,
        summary: {
          installed: installed.length,
          available: available.length,
          total: result.rowCount,
        },
      },
    };
  }
}
