import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TableSchemaResource } from '../../src/resources/table-schema.resource.js';
import { DatabaseInfoResource } from '../../src/resources/database-info.resource.js';
import { ConnectionProfilesResource } from '../../src/resources/connection-profiles.resource.js';
import type { IDatabaseDriver } from '../../src/database/interfaces/database-driver.js';

describe('BaseResource behavior (via TableSchemaResource)', () => {
  let resource: TableSchemaResource;

  beforeEach(() => {
    const mockConnectionManager = {} as any;
    resource = new TableSchemaResource(mockConnectionManager);
  });

  describe('matches', () => {
    it('returns true for a URI fitting the template', () => {
      expect(resource.matches('db:///mydb/tables/dbo/Users/schema')).toBe(true);
    });

    it('returns false for a non-matching URI', () => {
      expect(resource.matches('db:///mydb/info')).toBe(false);
    });
  });

  describe('getDefinition', () => {
    it('returns uri, name, description, and mimeType for the resource', () => {
      const uri = 'db:///mydb/tables/dbo/Users/schema';

      const definition = resource.getDefinition(uri);

      expect(definition).toEqual({
        uri,
        name: 'Table Schema',
        description: resource.description,
        mimeType: 'application/json',
      });
    });
  });
});

describe('ConnectionProfilesResource', () => {
  let resource: ConnectionProfilesResource;
  let mockConnectionManager: { getProfileNames: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockConnectionManager = {
      getProfileNames: vi.fn(),
    };

    resource = new ConnectionProfilesResource(mockConnectionManager as any);
  });

  describe('getContent', () => {
    it('returns profiles with generated info URIs and a count', async () => {
      mockConnectionManager.getProfileNames.mockReturnValue(['db1', 'db2']);

      const content = await resource.getContent('db:///profiles');
      const parsed = JSON.parse(content);

      expect(parsed).toEqual({
        profiles: [
          { name: 'db1', uri: 'db:///db1/info' },
          { name: 'db2', uri: 'db:///db2/info' },
        ],
        count: 2,
      });
    });

    it('returns an empty profile list when no profiles are configured', async () => {
      mockConnectionManager.getProfileNames.mockReturnValue([]);

      const content = await resource.getContent('db:///profiles');
      const parsed = JSON.parse(content);

      expect(parsed).toEqual({ profiles: [], count: 0 });
    });
  });
});

describe('DatabaseInfoResource', () => {
  let resource: DatabaseInfoResource;
  let mockDriver: IDatabaseDriver;
  let mockConnectionManager: { getDriver: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockDriver = {
      dialect: 'sqlserver',
      getDatabaseInfo: vi.fn(),
      listTables: vi.fn(),
    } as any;

    mockConnectionManager = {
      getDriver: vi.fn().mockResolvedValue(mockDriver),
    };

    resource = new DatabaseInfoResource(mockConnectionManager as any);
  });

  describe('getContent', () => {
    it('returns database info and table summary for the requested profile', async () => {
      vi.mocked(mockDriver.getDatabaseInfo).mockResolvedValue({
        databaseName: 'MyDb',
        serverVersion: 'SQL Server 2022',
        compatibilityLevel: 160,
      });
      vi.mocked(mockDriver.listTables).mockResolvedValue([
        { schema: 'dbo', table: 'Users', rowCount: 100, type: 'USER_TABLE' },
        { schema: 'dbo', table: 'Orders', rowCount: 500, type: 'USER_TABLE' },
      ]);

      const content = await resource.getContent('db:///mydb/info');
      const parsed = JSON.parse(content);

      expect(mockConnectionManager.getDriver).toHaveBeenCalledWith('mydb');
      expect(parsed).toEqual({
        profile: 'mydb',
        database: 'MyDb',
        serverVersion: 'SQL Server 2022',
        compatibilityLevel: 160,
        tableCount: 2,
        tables: [
          { schema: 'dbo', table: 'Users', rowCount: 100, fullName: 'dbo.Users' },
          { schema: 'dbo', table: 'Orders', rowCount: 500, fullName: 'dbo.Orders' },
        ],
      });
    });

    it('rejects a URI missing the profile segment', async () => {
      await expect(resource.getContent('db:///')).rejects.toThrow(
        'Invalid URI format. Expected: db:///{profile}/info'
      );
    });
  });
});

describe('TableSchemaResource', () => {
  let resource: TableSchemaResource;
  let mockDriver: IDatabaseDriver;
  let mockConnectionManager: { getDriver: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockDriver = {
      dialect: 'sqlserver',
      getTableSchema: vi.fn(),
    } as any;

    mockConnectionManager = {
      getDriver: vi.fn().mockResolvedValue(mockDriver),
    };

    resource = new TableSchemaResource(mockConnectionManager as any);
  });

  describe('getContent', () => {
    it('returns column info and primary keys parsed from the URI', async () => {
      vi.mocked(mockDriver.getTableSchema).mockResolvedValue([
        { column: 'Id', dataType: 'int', maxLength: null, isNullable: false, isPrimaryKey: true },
        { column: 'Name', dataType: 'nvarchar', maxLength: 100, isNullable: true, isPrimaryKey: false },
      ]);

      const content = await resource.getContent('db:///mydb/tables/dbo/Users/schema');
      const parsed = JSON.parse(content);

      expect(mockConnectionManager.getDriver).toHaveBeenCalledWith('mydb');
      expect(mockDriver.getTableSchema).toHaveBeenCalledWith('dbo', 'Users');
      expect(parsed).toEqual({
        profile: 'mydb',
        schema: 'dbo',
        table: 'Users',
        columns: [
          { name: 'Id', dataType: 'int', maxLength: null, isNullable: false, isPrimaryKey: true },
          { name: 'Name', dataType: 'nvarchar', maxLength: 100, isNullable: true, isPrimaryKey: false },
        ],
        primaryKeys: ['Id'],
      });
    });

    it('rejects a URI missing the table segment', async () => {
      await expect(resource.getContent('db:///mydb/tables/dbo//schema')).rejects.toThrow(
        'Invalid URI format. Expected: db:///{profile}/tables/{schema}/{table}/schema'
      );
    });
  });
});
