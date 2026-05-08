/**
 * Response Processor Tests
 *
 * Tests for tool call extraction and execution from LLM responses.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  executeToolCalls,
  DEFAULT_TOOL_TIMEOUT_MS,
  type ResponseProcessorDeps,
  type ToolChainResult,
} from '../orchestrator/response-processor.js';

function createMockDeps(overrides: Partial<ResponseProcessorDeps> = {}): ResponseProcessorDeps {
  const tools = new Map<string, (params: unknown) => Promise<unknown>>();
  return {
    tools: {
      has: (name: string) => tools.has(name),
      execute: (name: string, params: unknown) => {
        const fn = tools.get(name);
        if (!fn) return Promise.reject(new Error(`Unknown tool: ${name}`));
        return fn(params);
      },
      register: vi.fn(),
      list: vi.fn().mockReturnValue(Array.from(tools.keys())),
      getInfo: vi.fn().mockReturnValue(null),
      unregister: vi.fn(),
    } as never,
    toolPermissions: {
      check: vi.fn().mockReturnValue({ allowed: true }),
      approve: vi.fn(),
      deny: vi.fn(),
      getRules: vi.fn().mockReturnValue([]),
    } as never,
    logger: { info: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

describe('response-processor', () => {
  describe('constants', () => {
    it('should have 30s default timeout', () => {
      expect(DEFAULT_TOOL_TIMEOUT_MS).toBe(30_000);
    });
  });

  describe('executeToolCalls', () => {
    it('should return response unchanged when no tool calls', async () => {
      const deps = createMockDeps();
      const result = await executeToolCalls('Hello world', deps);
      expect(result.response).toBe('Hello world');
      expect(result.toolsExecuted).toBe(false);
      expect(result.executedToolNames).toEqual([]);
    });

    it('should execute code block tool calls', async () => {
      const deps = createMockDeps();
      // Register a tool
      (deps.tools as unknown as Map<string, unknown>).set = vi.fn();
      const toolFn = vi.fn().mockResolvedValue({ success: true, data: 'result' });
      // Re-create with the tool
      const tools = new Map<string, (params: unknown) => Promise<unknown>>();
      tools.set('echo', (params: unknown) => Promise.resolve({ success: true, data: params }));

      const fullDeps = createMockDeps({
        tools: {
          has: (name: string) => tools.has(name),
          execute: (name: string, params: unknown) => tools.get(name)!(params),
          register: vi.fn(),
          list: vi.fn().mockReturnValue([]),
          getInfo: vi.fn().mockReturnValue(null),
          unregister: vi.fn(),
        } as never,
      });

      const response = 'Here is the result:\n```tool\n{"tool":"echo","params":{"msg":"hello"}}\n```';
      const result = await executeToolCalls(response, fullDeps);

      expect(result.response).toContain('[Tool Result: echo]');
      expect(result.response).toContain('"msg":"hello"');
      expect(result.response).not.toContain('```tool');
      expect(result.toolsExecuted).toBe(true);
      expect(result.executedToolNames).toContain('echo');
    });

    it('should execute inline tool calls', async () => {
      const tools = new Map<string, (params: unknown) => Promise<unknown>>();
      tools.set('add', (params: unknown) => Promise.resolve({ success: true, data: ((params as {a:number;b:number}).a + (params as {a:number;b:number}).b) }));

      const deps = createMockDeps({
        tools: {
          has: (name: string) => tools.has(name),
          execute: (name: string, params: unknown) => tools.get(name)!(params),
          register: vi.fn(),
          list: vi.fn().mockReturnValue([]),
          getInfo: vi.fn().mockReturnValue(null),
          unregister: vi.fn(),
        } as never,
      });

      const response = 'Result: [TOOL: add]({"a":1,"b":2})';
      const result = await executeToolCalls(response, deps);

      expect(result.response).toContain('[Tool Result: add]');
      expect(result.response).toContain('3');
      expect(result.response).not.toContain('[TOOL: add]');
    });

    it('should block tool calls when permission denied', async () => {
      const tools = new Map<string, (params: unknown) => Promise<unknown>>();
      tools.set('danger', vi.fn().mockResolvedValue({ success: true }) as never);

      const deps = createMockDeps({
        tools: {
          has: (name: string) => tools.has(name),
          execute: (name: string, params: unknown) => tools.get(name)!(params),
          register: vi.fn(),
          list: vi.fn().mockReturnValue([]),
          getInfo: vi.fn().mockReturnValue(null),
          unregister: vi.fn(),
        } as never,
        toolPermissions: {
          check: vi.fn().mockReturnValue({ allowed: false, reason: 'Dangerous operation' }),
          approve: vi.fn(),
          deny: vi.fn(),
          getRules: vi.fn().mockReturnValue([]),
        } as never,
      });

      const response = '```tool\n{"tool":"danger","params":{}}\n```';
      const result = await executeToolCalls(response, deps);

      expect(result.response).toContain('[Tool Blocked: danger]');
      expect(result.response).toContain('Dangerous operation');
      expect(result.toolsExecuted).toBe(false); // blocked, not executed
    });

    it('should skip unknown tools silently', async () => {
      const deps = createMockDeps();
      const response = '```tool\n{"tool":"nonexistent","params":{}}\n```';
      const result = await executeToolCalls(response, deps);
      expect(result.response).toBe(response); // unchanged
      expect(result.toolsExecuted).toBe(false);
    });

    it('should skip malformed JSON in tool calls', async () => {
      const deps = createMockDeps();
      const response = '```tool\n{invalid json}\n```';
      const result = await executeToolCalls(response, deps);
      expect(result.response).toBe(response); // unchanged
    });

    it('should call onToken callback with tool results', async () => {
      const tools = new Map<string, (params: unknown) => Promise<unknown>>();
      tools.set('echo', () => Promise.resolve({ success: true, data: 'hello' }));

      const deps = createMockDeps({
        tools: {
          has: (name: string) => tools.has(name),
          execute: (name: string, params: unknown) => tools.get(name)!(params),
          register: vi.fn(),
          list: vi.fn().mockReturnValue([]),
          getInfo: vi.fn().mockReturnValue(null),
          unregister: vi.fn(),
        } as never,
      });

      const onToken = vi.fn();
      const response = '```tool\n{"tool":"echo","params":{}}\n```';
      await executeToolCalls(response, deps, onToken);

      expect(onToken).toHaveBeenCalled();
      expect(onToken.mock.calls[0][0]).toContain('[Tool Result: echo]');
    });

    it('should handle tool execution errors gracefully', async () => {
      const tools = new Map<string, (params: unknown) => Promise<unknown>>();
      tools.set('fail', () => Promise.reject(new Error('Tool crashed')));

      const deps = createMockDeps({
        tools: {
          has: (name: string) => tools.has(name),
          execute: (name: string, params: unknown) => tools.get(name)!(params),
          register: vi.fn(),
          list: vi.fn().mockReturnValue([]),
          getInfo: vi.fn().mockReturnValue(null),
          unregister: vi.fn(),
        } as never,
      });

      const response = '```tool\n{"tool":"fail","params":{}}\n```';
      const result = await executeToolCalls(response, deps);

      expect(result.response).toContain('[Tool Error: fail]');
      expect(result.response).toContain('Tool crashed');
    });

    it('should handle multiple tool calls in one response', async () => {
      const tools = new Map<string, (params: unknown) => Promise<unknown>>();
      tools.set('echo', (p: unknown) => Promise.resolve(p));
      tools.set('add', (p: unknown) => {
        const params = p as { a: number; b: number };
        return Promise.resolve(params.a + params.b);
      });

      const deps = createMockDeps({
        tools: {
          has: (name: string) => tools.has(name),
          execute: (name: string, params: unknown) => tools.get(name)!(params),
          register: vi.fn(),
          list: vi.fn().mockReturnValue([]),
          getInfo: vi.fn().mockReturnValue(null),
          unregister: vi.fn(),
        } as never,
      });

      const response = [
        '```tool\n{"tool":"echo","params":"test"}\n```',
        'And:',
        '[TOOL: add]({"a":2,"b":3})',
      ].join('\n');
      const result = await executeToolCalls(response, deps);

      expect(result.response).toContain('[Tool Result: echo]');
      expect(result.response).toContain('[Tool Result: add]');
      expect(result.response).toContain('5');
      expect(result.toolsExecuted).toBe(true);
      expect(result.executedToolNames).toContain('echo');
      expect(result.executedToolNames).toContain('add');
    });

    it('should handle tool timeout correctly', async () => {
      const tools = new Map<string, (params: unknown) => Promise<unknown>>();
      // Tool that never resolves
      tools.set('slow', () => new Promise(() => {}));

      const deps = createMockDeps({
        tools: {
          has: (name: string) => tools.has(name),
          execute: (name: string, params: unknown) => tools.get(name)!(params),
          register: vi.fn(),
          list: vi.fn().mockReturnValue([]),
          getInfo: vi.fn().mockReturnValue(null),
          unregister: vi.fn(),
        } as never,
        toolTimeoutMs: 100, // 100ms for fast test
      });

      const response = '```tool\n{"tool":"slow","params":{}}\n```';
      const result = await executeToolCalls(response, deps);

      expect(result.response).toContain('[Tool Error: slow]');
      expect(result.response).toContain('timed out');
    });

    it('should handle mixed success and failure tool calls', async () => {
      const tools = new Map<string, (params: unknown) => Promise<unknown>>();
      tools.set('good', () => Promise.resolve({ success: true, data: 'works' }));
      tools.set('bad', () => Promise.reject(new Error('broken')));

      const deps = createMockDeps({
        tools: {
          has: (name: string) => tools.has(name),
          execute: (name: string, params: unknown) => tools.get(name)!(params),
          register: vi.fn(),
          list: vi.fn().mockReturnValue([]),
          getInfo: vi.fn().mockReturnValue(null),
          unregister: vi.fn(),
        } as never,
      });

      const response = [
        '```tool\n{"tool":"good","params":{}}\n```',
        '[TOOL: bad]({})',
      ].join('\n');
      const result = await executeToolCalls(response, deps);

      expect(result.response).toContain('[Tool Result: good]');
      expect(result.response).toContain('[Tool Error: bad]');
      expect(result.toolsExecuted).toBe(true);
      expect(result.executedToolNames).toEqual(['good']);
    });

    it('should extract tools from inline format with empty params', async () => {
      const tools = new Map<string, (params: unknown) => Promise<unknown>>();
      tools.set('ping', () => Promise.resolve({ success: true, data: 'pong' }));

      const deps = createMockDeps({
        tools: {
          has: (name: string) => tools.has(name),
          execute: (name: string, params: unknown) => tools.get(name)!(params),
          register: vi.fn(),
          list: vi.fn().mockReturnValue([]),
          getInfo: vi.fn().mockReturnValue(null),
          unregister: vi.fn(),
        } as never,
      });

      // Inline format with empty parens
      const response = '[TOOL: ping]()';
      const result = await executeToolCalls(response, deps);
      expect(result.toolsExecuted).toBe(true);
      expect(result.executedToolNames).toContain('ping');
    });
  });
});
