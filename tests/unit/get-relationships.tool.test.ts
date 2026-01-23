import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetRelationshipsTool } from '../../src/tools/get-relationships.tool.js';
import { ConnectionManager } from '../../src/database/connection-manager.js';
import { QueryExecutor } from '../../src/database/query-executor.js';
import { mockRelationships } from '../fixtures/table-data.js';

describe('GetRelationshipsTool', () => {
  let tool: GetRelationshipsTool;
  let mockConnectionManager: ConnectionManager;
  let mockQueryExecutor: QueryExecutor;

  beforeEach(() => {
    mockConnectionManager = {} as ConnectionManager;
    mockQueryExecutor = {
      getTableRelations: vi.fn(),
    } as any;
    tool = new GetRelationshipsTool(mockConnectionManager, mockQueryExecutor);
  });

  describe('Tool Properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('get-relationships');
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
        vi.mocked(mockQueryExecutor.getTableRelations).mockResolvedValue(mockRelationships);

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
        vi.mocked(mockQueryExecutor.getTableRelations).mockResolvedValue(mockRelationships);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
          table: 'Orders',
        });

        expect(result.data.outgoingRelations[0].referencedFullName).toBe('dbo.Users');
        expect(result.data.outgoingRelations[0].joinHint).toContain('JOIN dbo.Users');
        expect(result.data.outgoingRelations[0].joinHint).toContain('dbo.Orders.UserId = dbo.Users.Id');
      });

      it('should include join hints for incoming relationships', async () => {
        vi.mocked(mockQueryExecutor.getTableRelations).mockResolvedValue(mockRelationships);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
          table: 'Orders',
        });

        expect(result.data.incomingRelations[0].referencingFullName).toBe('dbo.OrderItems');
        expect(result.data.incomingRelations[0].joinHint).toContain('JOIN dbo.Orders');
        expect(result.data.incomingRelations[0].joinHint).toContain('dbo.OrderItems.OrderId = dbo.Orders.Id');
      });

      it('should handle composite foreign keys', async () => {
        const compositeRelations = {
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

        vi.mocked(mockQueryExecutor.getTableRelations).mockResolvedValue(compositeRelations);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
          table: 'OrderDetails',
        });

        expect(result.data.outgoingRelations[0].columns).toHaveLength(2);
        expect(result.data.outgoingRelations[0].joinHint).toContain('AND');
        expect(result.data.outgoingRelations[0].joinHint).toContain('ProductId');
        expect(result.data.outgoingRelations[0].joinHint).toContain('WarehouseId');
      });

      it('should handle table with no relationships', async () => {
        const noRelations = {
          outgoing: [],
          incoming: [],
        };

        vi.mocked(mockQueryExecutor.getTableRelations).mockResolvedValue(noRelations);

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
        const multipleOutgoing = {
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

        vi.mocked(mockQueryExecutor.getTableRelations).mockResolvedValue(multipleOutgoing);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
          table: 'Orders',
        });

        expect(result.data.outgoingRelations).toHaveLength(3);
        expect(result.data.summary.totalOutgoing).toBe(3);
      });

      it('should format referenced full names correctly', async () => {
        const crossSchemaRelations = {
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

        vi.mocked(mockQueryExecutor.getTableRelations).mockResolvedValue(crossSchemaRelations);

        const result = await tool.execute({
          profile: 'test',
          schema: 'dbo',
          table: 'Orders',
        });

        expect(result.data.outgoingRelations[0].referencedFullName).toBe('sales.Customers');
        expect(result.data.outgoingRelations[0].joinHint).toContain('sales.Customers');
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
