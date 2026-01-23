import { BaseResource } from '../core/base-resource.js';

/**
 * Resource: Table schema information
 * URI pattern: sqlserver:///{profile}/tables/{schema}/{table}/schema
 */
export class TableSchemaResource extends BaseResource {
  readonly uriTemplate = 'sqlserver:///{profile}/tables/{schema}/{table}/schema';
  readonly name = 'Table Schema';
  readonly description = 'Provides detailed schema information for a SQL Server table including columns, data types, nullability, and primary keys.';
  readonly mimeType = 'application/json';

  async getContent(uri: string): Promise<string> {
    const params = this.extractParams(uri);
    const { profile, schema, table } = params;

    if (!profile || !schema || !table) {
      throw new Error('Invalid URI format. Expected: sqlserver:///{profile}/tables/{schema}/{table}/schema');
    }

    const schemaInfo = await this.queryExecutor.getTableSchema(profile, schema, table);

    const result = {
      profile,
      schema,
      table,
      columns: schemaInfo.map((col) => ({
        name: col.column,
        dataType: col.dataType,
        maxLength: col.maxLength,
        isNullable: col.isNullable,
        isPrimaryKey: col.isPrimaryKey,
      })),
      primaryKeys: schemaInfo.filter((col) => col.isPrimaryKey).map((col) => col.column),
    };

    return JSON.stringify(result, null, 2);
  }
}
