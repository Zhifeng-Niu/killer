/**
 * Tool Executor Tests
 */

import { describe, it, expect } from 'vitest';
import { ToolExecutor, type Tool, type ToolResult } from '../brainstem/tool-executor.js';
import { ReadFileTool, WriteFileTool, DeleteFileTool, ExecuteShellTool } from '../brainstem/builtin-tools.js';

function createTool(name: string, executeImpl?: (params: unknown) => Promise<ToolResult>): Tool {
  return {
    name,
    description: `Test tool: ${name}`,
    execute: executeImpl ?? (async () => ({ success: true, data: `${name} executed` })),
  };
}

describe('ToolExecutor', () => {
  it('should register a tool', () => {
    const executor = new ToolExecutor();
    executor.register(createTool('read'));

    expect(executor.has('read')).toBe(true);
    expect(executor.size()).toBe(1);
  });

  it('should throw on duplicate registration', () => {
    const executor = new ToolExecutor();
    executor.register(createTool('read'));

    expect(() => executor.register(createTool('read'))).toThrow('Tool already registered: read');
  });

  it('should unregister a tool', () => {
    const executor = new ToolExecutor();
    executor.register(createTool('read'));

    const removed = executor.unregister('read');

    expect(removed).toBe(true);
    expect(executor.has('read')).toBe(false);
  });

  it('should return false for unregistering non-existent tool', () => {
    const executor = new ToolExecutor();

    expect(executor.unregister('ghost')).toBe(false);
  });

  it('should execute a registered tool', async () => {
    const executor = new ToolExecutor();
    executor.register(createTool('greet', async (params) => ({
      success: true,
      data: `Hello, ${params}!`,
    })));

    const result = await executor.execute('greet', 'World');

    expect(result.success).toBe(true);
    expect(result.data).toBe('Hello, World!');
  });

  it('should return error for non-existent tool', async () => {
    const executor = new ToolExecutor();

    const result = await executor.execute('ghost', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Tool not found: ghost');
  });

  it('should catch tool execution errors', async () => {
    const executor = new ToolExecutor();
    executor.register(createTool('fail', async () => {
      throw new Error('Tool crashed');
    }));

    const result = await executor.execute('fail', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Tool execution failed: Tool crashed');
  });

  it('should list registered tool names', () => {
    const executor = new ToolExecutor();
    executor.register(createTool('read'));
    executor.register(createTool('write'));

    expect(executor.list()).toEqual(['read', 'write']);
  });

  it('should return tool info', () => {
    const executor = new ToolExecutor();
    executor.register(createTool('search'));

    const info = executor.getInfo('search');

    expect(info).toEqual({ name: 'search', description: 'Test tool: search', readOnly: false });
  });

  it('should return null for non-existent tool info', () => {
    const executor = new ToolExecutor();

    expect(executor.getInfo('ghost')).toBeNull();
  });

  it('should report correct size', () => {
    const executor = new ToolExecutor();

    expect(executor.size()).toBe(0);

    executor.register(createTool('a'));
    executor.register(createTool('b'));
    executor.register(createTool('c'));

    expect(executor.size()).toBe(3);

    executor.unregister('b');

    expect(executor.size()).toBe(2);
  });

  it('should register multiple tools at once', () => {
    const executor = new ToolExecutor();

    executor.registerAll([
      createTool('a'),
      createTool('b'),
      createTool('c'),
    ]);

    expect(executor.size()).toBe(3);
    expect(executor.list()).toEqual(['a', 'b', 'c']);
  });

  it('should handle non-Error throws in tool execution', async () => {
    const executor = new ToolExecutor();
    executor.register(createTool('string-throw', async () => {
      throw 'string error'; // eslint-disable-line no-throw-literal
    }));

    const result = await executor.execute('string-throw', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('string error');
  });
});

describe('Builtin Tool Security', () => {
  describe('Sensitive path protection', () => {
    it('should deny reading sensitive paths', async () => {
      const tool = new ReadFileTool();
      const result = await tool.execute({ path: '~/.ssh/id_rsa' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Access denied');
    });

    it('should deny writing to sensitive paths', async () => {
      const tool = new WriteFileTool();
      const result = await tool.execute({ path: '~/.ssh/authorized_keys', content: 'test' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Access denied');
    });

    it('should deny deleting sensitive paths', async () => {
      const tool = new DeleteFileTool();
      const result = await tool.execute({ path: '~/.env' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Access denied');
    });

    it('should deny reading /etc/shadow', async () => {
      const tool = new ReadFileTool();
      const result = await tool.execute({ path: '/etc/shadow' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Access denied');
    });

    it('should deny .aws credentials', async () => {
      const tool = new ReadFileTool();
      const result = await tool.execute({ path: '~/.aws/credentials' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Access denied');
    });
  });

  describe('Output truncation', () => {
    it('should truncate long shell output', async () => {
      const tool = new ExecuteShellTool();
      // Generate 40KB of output — should be truncated to 30KB
      const result = await tool.execute({ command: 'python3 -c "print(\'x\' * 40000)"' });
      expect(result.success).toBe(true);
      const stdout = (result.data as { stdout: string }).stdout;
      expect(stdout.length).toBeLessThan(35_000);
      expect(stdout).toContain('[truncated');
    });
  });
});
