import { BaseResource } from '../core/base-resource.js';

/**
 * Resource: Database information
 * URI pattern: db:///{profile}/info
 */
export class DatabaseInfoResource extends BaseResource {
  readonly uriTemplate = 'db:///{profile}/info';
  readonly name = 'Database Info';
  readonly description = 'Provides general information about the database including name, version, and available tables.';
  readonly mimeType = 'application/json';

  async getContent(uri: string): Promise<string> {
    const params = this.extractParams(uri);
    const { profile } = params;

    if (!profile) {
      throw new Error('Invalid URI format. Expected: db:///{profile}/info');
    }

    const driver = await this.getDriver(profile);
    const [dbInfo, tables] = await Promise.all([
      driver.getDatabaseInfo(),
      driver.listTables(),
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
