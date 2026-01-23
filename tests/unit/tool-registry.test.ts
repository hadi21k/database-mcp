import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolRegistry } from '../../src/core/tool-registry.js';
import { BaseTool } from '../../src/core/base-tool.js';
import { z } from 'zod';
import { ConnectionManager } from '../../src/database/connection-manager.js';
import { QueryExecutor } from '../../src/database/query-executor.js';

// Mock tool for testing
class MockTool extends BaseTool {
  readonly name = 'mock-tool';
  readonly description = 'A mock tool for testing';
  readonly inputSchema = z.object({
    param: z.string(),
  });

  async execute(input: any) {
    return { success: true, data: input };
  }
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let mockConnectionManager: ConnectionManager;
  let mockQueryExecutor: QueryExecutor;
  let mockTool: MockTool;

  beforeEach(() => {
    registry = new ToolRegistry();
    mockConnectionManager = {} as ConnectionManager;
    mockQueryExecutor = {} as QueryExecutor;
    mockTool = new MockTool(mockConnectionManager, mockQueryExecutor);
  });

  describe('register', () => {
    it('should register a new tool', () => {
      registry.register(mockTool);
      expect(registry.has('mock-tool')).toBe(true);
    });

    it('should throw error when registering duplicate tool', () => {
      registry.register(mockTool);
      
      expect(() => registry.register(mockTool))
        .toThrow('Tool "mock-tool" is already registered');
    });

    it('should register multiple different tools', () => {
      class AnotherTool extends BaseTool {
        readonly name = 'another-tool';
        readonly description = 'Another tool';
        readonly inputSchema = z.object({});
        async execute() { return {}; }
      }

      registry.register(mockTool);
      registry.register(new AnotherTool(mockConnectionManager, mockQueryExecutor));
      
      expect(registry.getAll()).toHaveLength(2);
    });
  });

  describe('get', () => {
    it('should retrieve registered tool', () => {
      registry.register(mockTool);
      const retrieved = registry.get('mock-tool');
      
      expect(retrieved).toBe(mockTool);
      expect(retrieved?.name).toBe('mock-tool');
    });

    it('should return undefined for non-existent tool', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true for registered tools', () => {
      registry.register(mockTool);
      expect(registry.has('mock-tool')).toBe(true);
    });

    it('should return false for non-registered tools', () => {
      expect(registry.has('nonexistent')).toBe(false);
    });
  });

  describe('getAll', () => {
    it('should return empty array when no tools registered', () => {
      expect(registry.getAll()).toEqual([]);
    });

    it('should return all registered tools', () => {
      class Tool1 extends BaseTool {
        readonly name = 'tool-1';
        readonly description = 'Tool 1';
        readonly inputSchema = z.object({});
        async execute() { return {}; }
      }

      class Tool2 extends BaseTool {
        readonly name = 'tool-2';
        readonly description = 'Tool 2';
        readonly inputSchema = z.object({});
        async execute() { return {}; }
      }

      registry.register(new Tool1(mockConnectionManager, mockQueryExecutor));
      registry.register(new Tool2(mockConnectionManager, mockQueryExecutor));
      registry.register(mockTool);
      
      const tools = registry.getAll();
      expect(tools).toHaveLength(3);
      expect(tools.map(t => t.name)).toContain('tool-1');
      expect(tools.map(t => t.name)).toContain('tool-2');
      expect(tools.map(t => t.name)).toContain('mock-tool');
    });
  });

  describe('getDefinitions', () => {
    it('should return empty array when no tools', () => {
      expect(registry.getDefinitions()).toEqual([]);
    });

    it('should return tool definitions', () => {
      registry.register(mockTool);
      const definitions = registry.getDefinitions();
      
      expect(definitions).toHaveLength(1);
      expect(definitions[0]).toHaveProperty('name');
      expect(definitions[0]).toHaveProperty('description');
      expect(definitions[0]).toHaveProperty('inputSchema');
      expect(definitions[0].name).toBe('mock-tool');
    });

    it('should return definitions for all tools', () => {
      class Tool1 extends BaseTool {
        readonly name = 'tool-1';
        readonly description = 'Description 1';
        readonly inputSchema = z.object({ field: z.string() });
        async execute() { return {}; }
      }

      registry.register(mockTool);
      registry.register(new Tool1(mockConnectionManager, mockQueryExecutor));
      
      const definitions = registry.getDefinitions();
      expect(definitions).toHaveLength(2);
    });
  });
});
