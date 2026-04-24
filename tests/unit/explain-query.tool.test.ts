import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExplainQueryTool } from '../../src/tools/explain-query.tool.js';
import type { IDatabaseDriver } from '../../src/database/interfaces/database-driver.js';

describe('ExplainQueryTool', () => {
  let tool: ExplainQueryTool;
  let mockDriver: IDatabaseDriver;

  beforeEach(() => {
    mockDriver = {
      dialect: 'postgresql',
      executeQuery: vi.fn(),
    } as any;

    const mockConnectionManager = {
      getDriver: vi.fn().mockResolvedValue(mockDriver),
    } as any;

    tool = new ExplainQueryTool(mockConnectionManager);
  });

  describe('Tool Properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('explain-query');
    });

    it('should have descriptive description', () => {
      expect(tool.description).toContain('execution plan');
    });

    it('should have proper input schema', () => {
      const definition = tool.getDefinition();
      expect(definition.inputSchema.properties).toHaveProperty('profile');
      expect(definition.inputSchema.properties).toHaveProperty('query');
      expect(definition.inputSchema.properties).toHaveProperty('parameters');
      expect(definition.inputSchema.required).toContain('profile');
      expect(definition.inputSchema.required).toContain('query');
      expect(definition.inputSchema.required).not.toContain('parameters');
    });
  });

  describe('execute', () => {
    it('should prepend EXPLAIN for PostgreSQL', async () => {
      vi.mocked(mockDriver.executeQuery).mockResolvedValue({
        rows: [{ 'QUERY PLAN': [{ Plan: { 'Node Type': 'Seq Scan', 'Total Cost': 10.5 } }] }],
        rowCount: 1,
        columns: ['QUERY PLAN'],
      });

      const result = await tool.execute({
        profile: 'test',
        query: 'SELECT * FROM users',
      });

      expect(result.success).toBe(true);
      expect(result.data.dialect).toBe('postgresql');
      expect(mockDriver.executeQuery).toHaveBeenCalledWith(
        'EXPLAIN (FORMAT JSON) SELECT * FROM users',
        undefined
      );
    });

    it('should use SHOWPLAN_TEXT for SQL Server', async () => {
      (mockDriver as any).dialect = 'sqlserver';
      vi.mocked(mockDriver.executeQuery).mockResolvedValue({
        rows: [{ StmtText: 'Clustered Index Scan' }],
        rowCount: 1,
        columns: ['StmtText'],
      });

      const result = await tool.execute({
        profile: 'test',
        query: 'SELECT * FROM users',
      });

      expect(result.success).toBe(true);
      expect(result.data.dialect).toBe('sqlserver');
      expect(mockDriver.executeQuery).toHaveBeenCalledWith(
        'SET SHOWPLAN_TEXT ON; SELECT * FROM users; SET SHOWPLAN_TEXT OFF',
        undefined
      );
    });

    it('should pass parameters through', async () => {
      vi.mocked(mockDriver.executeQuery).mockResolvedValue({
        rows: [],
        rowCount: 0,
        columns: [],
      });

      await tool.execute({
        profile: 'test',
        query: 'SELECT * FROM users WHERE id = @id',
        parameters: { id: 1 },
      });

      expect(mockDriver.executeQuery).toHaveBeenCalledWith(
        'EXPLAIN (FORMAT JSON) SELECT * FROM users WHERE id = @id',
        { id: 1 }
      );
    });

    it('should reject non-SELECT queries', async () => {
      await expect(
        tool.execute({
          profile: 'test',
          query: 'DELETE FROM users',
        })
      ).rejects.toThrow('Only SELECT queries');
    });

    it('should reject INSERT queries', async () => {
      await expect(
        tool.execute({
          profile: 'test',
          query: 'INSERT INTO users VALUES (1)',
        })
      ).rejects.toThrow('Only SELECT queries');
    });

    it('should reject missing profile', async () => {
      await expect(tool.execute({ query: 'SELECT 1' })).rejects.toThrow();
    });

    it('should reject missing query', async () => {
      await expect(tool.execute({ profile: 'test' })).rejects.toThrow();
    });

    it('should propagate driver errors', async () => {
      vi.mocked(mockDriver.executeQuery).mockRejectedValue(new Error('Connection lost'));

      await expect(
        tool.execute({ profile: 'test', query: 'SELECT 1' })
      ).rejects.toThrow('Connection lost');
    });
  });
});
