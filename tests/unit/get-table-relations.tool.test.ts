import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetTableRelationsTool } from '../../src/tools/get-table-relations.tool.js';
import { ConnectionManager } from '../../src/database/connection-manager.js';
import { QueryExecutor } from '../../src/database/query-executor.js';

describe('GetTableRelationsTool', () => {
  let tool: GetTableRelationsTool;
  let mockConnectionManager: ConnectionManager;
  let mockQueryExecutor: QueryExecutor;

  beforeEach(() => {
    mockConnectionManager = {} as ConnectionManager;
    mockQueryExecutor = {
      getTableRelations: vi.fn(),
    } as any;
    tool = new GetTableRelationsTool(mockConnectionManager, mockQueryExecutor);
  });

  describe('Tool Properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('get-table-relations');
    });

    it('should have descriptive description', () => {
      expect(tool.description).toContain('foreign key');
      expect(tool.description).toContain('relationships');
    });

    it('should have proper input schema', () => {
      const definition = tool.getDefinition();
      expect(definition.inputSchema.properties).toHaveProperty('profile');
      expect(definition.inputSchema.properties).toHaveProperty('schema');
      expect(definition.inputSchema.properties).toHaveProperty('table');
      expect(definition.inputSchema.required).toContain('profile');
      expect(definition.inputSchema.required).toContain('schema');
      expect(definition.inputSchema.required).toContain('table');
    });
  });

  describe('execute', () => {
    describe('with valid input', () => {
      it('should return outgoing and incoming relationships', async () => {
        const mockRelations = {
          outgoing: [
            {
              foreignKeyName: 'FK_Orders_Customers',
              referencedSchema: 'dbo',
              referencedTable: 'Customers',
              columns: [
                { fromColumn: 'CustomerId', toColumn: 'Id' },
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

        vi.mocked(mockQueryExecutor.getTableRelations).mockResolvedValue(mockRelations);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
          table: 'Orders',
        });

        expect(result.success).toBe(true);
        expect(result.data.schema).toBe('dbo');
        expect(result.data.table).toBe('Orders');
        expect(result.data.fullName).toBe('dbo.Orders');
        expect(result.data.outgoingRelations).toHaveLength(1);
        expect(result.data.incomingRelations).toHaveLength(1);
        expect(result.data.summary.totalOutgoing).toBe(1);
        expect(result.data.summary.totalIncoming).toBe(1);
        expect(result.data.summary.totalRelationships).toBe(2);
      });

      it('should include join hints for outgoing relationships', async () => {
        const mockRelations = {
          outgoing: [
            {
              foreignKeyName: 'FK_Orders_Customers',
              referencedSchema: 'dbo',
              referencedTable: 'Customers',
              columns: [
                { fromColumn: 'CustomerId', toColumn: 'Id' },
              ],
            },
          ],
          incoming: [],
        };

        vi.mocked(mockQueryExecutor.getTableRelations).mockResolvedValue(mockRelations);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
          table: 'Orders',
        });

        expect(result.data.outgoingRelations[0].joinHint).toContain('JOIN dbo.Customers');
        expect(result.data.outgoingRelations[0].joinHint).toContain('dbo.Orders.CustomerId = dbo.Customers.Id');
      });

      it('should handle composite foreign keys', async () => {
        const mockRelations = {
          outgoing: [
            {
              foreignKeyName: 'FK_OrderDetails_Products',
              referencedSchema: 'dbo',
              referencedTable: 'Products',
              columns: [
                { fromColumn: 'ProductId', toColumn: 'Id' },
                { fromColumn: 'WarehouseId', toColumn: 'WarehouseId' },
              ],
            },
          ],
          incoming: [],
        };

        vi.mocked(mockQueryExecutor.getTableRelations).mockResolvedValue(mockRelations);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
          table: 'OrderDetails',
        });

        expect(result.data.outgoingRelations[0].columns).toHaveLength(2);
        expect(result.data.outgoingRelations[0].joinHint).toContain('AND');
      });

      it('should handle table with no relationships', async () => {
        const mockRelations = {
          outgoing: [],
          incoming: [],
        };

        vi.mocked(mockQueryExecutor.getTableRelations).mockResolvedValue(mockRelations);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
          table: 'StandaloneTable',
        });

        expect(result.success).toBe(true);
        expect(result.data.outgoingRelations).toHaveLength(0);
        expect(result.data.incomingRelations).toHaveLength(0);
        expect(result.data.summary.totalRelationships).toBe(0);
      });

      it('should handle multiple outgoing relationships', async () => {
        const mockRelations = {
          outgoing: [
            {
              foreignKeyName: 'FK_Orders_Customers',
              referencedSchema: 'dbo',
              referencedTable: 'Customers',
              columns: [{ fromColumn: 'CustomerId', toColumn: 'Id' }],
            },
            {
              foreignKeyName: 'FK_Orders_Employees',
              referencedSchema: 'dbo',
              referencedTable: 'Employees',
              columns: [{ fromColumn: 'EmployeeId', toColumn: 'Id' }],
            },
            {
              foreignKeyName: 'FK_Orders_Shippers',
              referencedSchema: 'dbo',
              referencedTable: 'Shippers',
              columns: [{ fromColumn: 'ShipperId', toColumn: 'Id' }],
            },
          ],
          incoming: [],
        };

        vi.mocked(mockQueryExecutor.getTableRelations).mockResolvedValue(mockRelations);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
          table: 'Orders',
        });

        expect(result.data.outgoingRelations).toHaveLength(3);
        expect(result.data.summary.totalOutgoing).toBe(3);
      });

      it('should format referenced full names correctly', async () => {
        const mockRelations = {
          outgoing: [
            {
              foreignKeyName: 'FK_Orders_Customers',
              referencedSchema: 'sales',
              referencedTable: 'Customers',
              columns: [{ fromColumn: 'CustomerId', toColumn: 'Id' }],
            },
          ],
          incoming: [],
        };

        vi.mocked(mockQueryExecutor.getTableRelations).mockResolvedValue(mockRelations);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
          table: 'Orders',
        });

        expect(result.data.outgoingRelations[0].referencedFullName).toBe('sales.Customers');
      });
    });

    describe('input validation', () => {
      it('should reject missing profile', async () => {
        await expect(
          tool.execute({
            schema: 'dbo',
            table: 'Orders',
          })
        ).rejects.toThrow();
      });

      it('should reject missing schema', async () => {
        await expect(
          tool.execute({
            profile: 'test',
            table: 'Orders',
          })
        ).rejects.toThrow();
      });

      it('should reject missing table', async () => {
        await expect(
          tool.execute({
            profile: 'test',
            schema: 'dbo',
          })
        ).rejects.toThrow();
      });

      it('should reject invalid input types', async () => {
        await expect(
          tool.execute({
            profile: 123,
            schema: 'dbo',
            table: 'Orders',
          })
        ).rejects.toThrow();
      });
    });

    describe('error handling', () => {
      it('should propagate query executor errors', async () => {
        vi.mocked(mockQueryExecutor.getTableRelations).mockRejectedValue(
          new Error('Database connection failed')
        );

        await expect(
          tool.execute({
            profile: 'test',
            schema: 'dbo',
            table: 'Orders',
          })
        ).rejects.toThrow('Database connection failed');
      });

      it('should handle non-existent tables gracefully', async () => {
        vi.mocked(mockQueryExecutor.getTableRelations).mockRejectedValue(
          new Error('Table or view not found')
        );

        await expect(
          tool.execute({
            profile: 'test',
            schema: 'dbo',
            table: 'NonExistentTable',
          })
        ).rejects.toThrow('Table or view not found');
      });
    });
  });
});
