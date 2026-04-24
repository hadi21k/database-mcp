import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EstimateCostTool } from '../../src/tools/estimate-cost.tool.js';
import type { IDatabaseDriver } from '../../src/database/interfaces/database-driver.js';

describe('EstimateCostTool', () => {
  let tool: EstimateCostTool;
  let mockDriver: IDatabaseDriver;

  beforeEach(() => {
    mockDriver = {
      dialect: 'postgresql',
      executeQuery: vi.fn(),
    } as any;

    const mockConnectionManager = {
      getDriver: vi.fn().mockResolvedValue(mockDriver),
    } as any;

    tool = new EstimateCostTool(mockConnectionManager);
  });

  describe('Tool Properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('estimate-cost');
    });

    it('should have descriptive description', () => {
      expect(tool.description).toContain('cost');
    });

    it('should have proper input schema', () => {
      const definition = tool.getDefinition();
      expect(definition.inputSchema.properties).toHaveProperty('profile');
      expect(definition.inputSchema.properties).toHaveProperty('query');
      expect(definition.inputSchema.required).toContain('profile');
      expect(definition.inputSchema.required).toContain('query');
    });
  });

  describe('execute', () => {
    it('should extract cost metrics from PostgreSQL plan', async () => {
      const pgPlan = [
        {
          Plan: {
            'Node Type': 'Seq Scan',
            'Total Cost': 25.0,
            'Startup Cost': 0.0,
            'Plan Rows': 1000,
            'Plan Width': 64,
          },
        },
      ];

      vi.mocked(mockDriver.executeQuery).mockResolvedValue({
        rows: [{ 'QUERY PLAN': pgPlan }],
        rowCount: 1,
        columns: ['QUERY PLAN'],
      });

      const result = await tool.execute({
        profile: 'test',
        query: 'SELECT * FROM users',
      });

      expect(result.success).toBe(true);
      expect(result.data.estimatedTotalCost).toBe(25.0);
      expect(result.data.estimatedStartupCost).toBe(0.0);
      expect(result.data.estimatedRows).toBe(1000);
      expect(result.data.estimatedWidth).toBe(64);
      expect(result.data.nodeType).toBe('Seq Scan');
    });

    it('should use SHOWPLAN_ALL for SQL Server', async () => {
      (mockDriver as any).dialect = 'sqlserver';
      vi.mocked(mockDriver.executeQuery).mockResolvedValue({
        rows: [{ TotalSubtreeCost: 0.5 }],
        rowCount: 1,
        columns: ['TotalSubtreeCost'],
      });

      const result = await tool.execute({
        profile: 'test',
        query: 'SELECT * FROM users',
      });

      expect(result.success).toBe(true);
      expect(mockDriver.executeQuery).toHaveBeenCalledWith(
        'SET SHOWPLAN_ALL ON; SELECT * FROM users; SET SHOWPLAN_ALL OFF',
        undefined
      );
    });

    it('should handle empty result set', async () => {
      vi.mocked(mockDriver.executeQuery).mockResolvedValue({
        rows: [],
        rowCount: 0,
        columns: [],
      });

      const result = await tool.execute({
        profile: 'test',
        query: 'SELECT * FROM users',
      });

      expect(result.success).toBe(true);
      expect(result.data.plan).toEqual([]);
    });

    it('should reject non-SELECT queries', async () => {
      await expect(
        tool.execute({
          profile: 'test',
          query: 'DROP TABLE users',
        })
      ).rejects.toThrow('Only SELECT queries');
    });

    it('should propagate driver errors', async () => {
      vi.mocked(mockDriver.executeQuery).mockRejectedValue(new Error('Permission denied'));

      await expect(
        tool.execute({ profile: 'test', query: 'SELECT 1' })
      ).rejects.toThrow('Permission denied');
    });
  });
});
