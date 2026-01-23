/**
 * Test fixtures for table-related data
 * Use these fixtures in unit tests for consistent mock data
 */

export const mockTableList = [
  { schema: 'dbo', table: 'Users', rowCount: 100, type: 'USER_TABLE' },
  { schema: 'dbo', table: 'Orders', rowCount: 500, type: 'USER_TABLE' },
  { schema: 'sales', table: 'Products', rowCount: 50, type: 'USER_TABLE' },
];

export const mockTableSchema = [
  {
    columnName: 'Id',
    ordinalPosition: 1,
    dataType: 'int',
    maxLength: null,
    precision: 10,
    scale: 0,
    isNullable: false,
    isPrimaryKey: true,
    isIdentity: true,
    isComputed: false,
    defaultValue: null,
    description: 'Primary key identifier',
  },
  {
    columnName: 'Name',
    ordinalPosition: 2,
    dataType: 'nvarchar',
    maxLength: 100,
    precision: null,
    scale: null,
    isNullable: false,
    isPrimaryKey: false,
    isIdentity: false,
    isComputed: false,
    defaultValue: null,
    description: 'User full name',
  },
  {
    columnName: 'Email',
    ordinalPosition: 3,
    dataType: 'nvarchar',
    maxLength: 255,
    precision: null,
    scale: null,
    isNullable: true,
    isPrimaryKey: false,
    isIdentity: false,
    isComputed: false,
    defaultValue: null,
    description: 'Email address',
  },
];

export const mockRelationships = {
  outgoing: [
    {
      foreignKeyName: 'FK_Orders_Users',
      referencedSchema: 'dbo',
      referencedTable: 'Users',
      columns: [
        { fromColumn: 'UserId', toColumn: 'Id' },
      ],
    },
  ],
  incoming: [
    {
      foreignKeyName: 'FK_OrderItems_Orders',
      referencingSchema: 'dbo',
      referencingTable: 'OrderItems',
      columns: [
        { fromColumn: 'OrderId', toColumn: 'Id' },
      ],
    },
  ],
};

export const mockIndexes = [
  {
    indexName: 'PK_Users',
    type: 'CLUSTERED',
    isUnique: true,
    isPrimaryKey: true,
    isUniqueConstraint: false,
    isDisabled: false,
    fillFactor: null,
    filterDefinition: null,
    keyColumns: [
      { columnName: 'Id', isDescending: false, keyOrdinal: 1 },
    ],
    includedColumns: [],
  },
  {
    indexName: 'IX_Users_Email',
    type: 'NONCLUSTERED',
    isUnique: true,
    isPrimaryKey: false,
    isUniqueConstraint: true,
    isDisabled: false,
    fillFactor: 90,
    filterDefinition: null,
    keyColumns: [
      { columnName: 'Email', isDescending: false, keyOrdinal: 1 },
    ],
    includedColumns: ['Name'],
  },
];

export const mockQueryResult = {
  rows: [
    { Id: 1, Name: 'John Doe', Email: 'john@example.com' },
    { Id: 2, Name: 'Jane Smith', Email: 'jane@example.com' },
  ],
  rowCount: 2,
  columns: ['Id', 'Name', 'Email'],
  limited: false,
};
