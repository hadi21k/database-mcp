import { BaseResource } from '../core/base-resource.js';

/**
 * Resource: Database information
 * URI pattern: sqlserver:///{profile}/info
 */
export class DatabaseInfoResource extends BaseResource {
  readonly uriTemplate = 'sqlserver:///{profile}/info';
  readonly name = 'Database Info';
  readonly description = 'Provides general information about the SQL Server database including name, version, and available tables.';
  readonly mimeType = 'application/json';

  async getContent(uri: string): Promise<string> {
    const params = this.extractParams(uri);
    const { profile } = params;

    if (!profile) {
      throw new Error('Invalid URI format. Expected: sqlserver:///{profile}/info');
    }

    const [dbInfo, tables] = await Promise.all([
      this.queryExecutor.getDatabaseInfo(profile),
      this.queryExecutor.listTables(profile),
    ]);

    const result = {
      profile,
      database: dbInfo.databaseName,
      serverVersion: dbInfo.serverVersion,
      compatibilityLevel: dbInfo.compatibilityLevel,
      tableCount: tables.length,
      tables: tables.map((t) => ({
        schema: t.schema,
        table: t.table,
        rowCount: t.rowCount,
        fullName: `${t.schema}.${t.table}`,
      })),
    };

    return JSON.stringify(result, null, 2);
  }
}
