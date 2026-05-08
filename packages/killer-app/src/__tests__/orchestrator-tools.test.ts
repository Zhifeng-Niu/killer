/**
 * BuiltinTools Unit Tests
 *
 * Tests the 7 built-in tools registered by BuiltinTools class,
 * including the safeEvalMath recursive descent parser.
 */

import { describe, it, expect, vi } from 'vitest';
import { BuiltinTools } from '../orchestrator/tools.js';
import type { ToolExecutor, Tool, ToolResult, HippocampusEngine } from '@killer/core';
import type { AgentStatus } from '../orchestrator/types.js';

function createMockToolExecutor(): ToolExecutor & { registered: Map<string, Tool> } {
  const registered = new Map<string, Tool>();
  return {
    registered,
    register(tool: Tool) { registered.set(tool.name, tool); },
    async execute(name: string, params: Record<string, unknown>): Promise<ToolResult> {
      const tool = registered.get(name);
      if (!tool) return { success: false, error: `Tool not found: ${name}` };
      return tool.execute(params);
    },
    listTools(): Tool[] { return [...registered.values()]; },
    hasTool(name: string): boolean { return registered.has(name); },
  };
}

function createMockHippocampus(): HippocampusEngine {
  const episodes: any[] = [];
  return {
    storeEpisode: vi.fn((ep) => { episodes.push(ep); }),
    associativeRecall: vi.fn(() => ({ episodes, metrics: { recallTime: 1 } })),
    dreamCycle: vi.fn(async () => ({ phases: ['consolidation'], memoriesProcessed: episodes.length })),
    storeSemantic: vi.fn(),
    recallSemantic: vi.fn(() => []),
    getStats: vi.fn(() => ({ totalEpisodes: episodes.length })),
    episodes,
  } as unknown as HippocampusEngine;
}

function createBuiltinTools() {
  const tools = createMockToolExecutor();
  const hippocampus = createMockHippocampus();
  const status: AgentStatus = { running: true, modules: {}, uptime: 1000 };
  const builtin = new BuiltinTools(tools, hippocampus, () => status);
  builtin.registerAll();
  return { tools, hippocampus, builtin };
}

describe('BuiltinTools', () => {
  it('should register all 10 tools', () => {
    const { tools } = createBuiltinTools();
    expect(tools.registered.size).toBe(10);
    expect(tools.hasTool('memory_store')).toBe(true);
    expect(tools.hasTool('memory_recall')).toBe(true);
    expect(tools.hasTool('agent_status')).toBe(true);
    expect(tools.hasTool('trigger_dream')).toBe(true);
    expect(tools.hasTool('time')).toBe(true);
    expect(tools.hasTool('calculate')).toBe(true);
    expect(tools.hasTool('plan_goal')).toBe(true);
    expect(tools.hasTool('note_save')).toBe(true);
    expect(tools.hasTool('note_read')).toBe(true);
    expect(tools.hasTool('emotion_express')).toBe(true);
  });

  describe('memory_store', () => {
    it('should store an episode in hippocampus', async () => {
      const { tools, hippocampus } = createBuiltinTools();
      const result = await tools.execute('memory_store', {
        content: 'User discussed TypeScript patterns',
        tags: ['typescript', 'patterns'],
        emotionalWeight: 0.8,
      });
      expect(result.success).toBe(true);
      expect(hippocampus.storeEpisode).toHaveBeenCalledOnce();
    });
  });

  describe('memory_recall', () => {
    it('should recall episodes via associative search', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('memory_recall', { query: 'typescript', limit: 3 });
      expect(result.success).toBe(true);
    });
  });

  describe('agent_status', () => {
    it('should return current agent status', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('agent_status', {});
      expect(result.success).toBe(true);
      expect(result.data.running).toBe(true);
    });
  });

  describe('trigger_dream', () => {
    it('should trigger dream cycle', async () => {
      const { tools, hippocampus } = createBuiltinTools();
      const result = await tools.execute('trigger_dream', {});
      expect(result.success).toBe(true);
      expect(hippocampus.dreamCycle).toHaveBeenCalledOnce();
    });
  });

  describe('time', () => {
    it('should return ISO format by default', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('time', {});
      expect(result.success).toBe(true);
      expect(result.data.iso).toBeDefined();
      // ISO format: YYYY-MM-DDTHH:mm:ss.sssZ
      expect(result.data.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should return unix timestamp', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('time', { format: 'unix' });
      expect(result.success).toBe(true);
      expect(typeof result.data.timestamp).toBe('number');
      expect(result.data.timestamp).toBeGreaterThan(0);
    });

    it('should return relative time format', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('time', { format: 'relative' });
      expect(result.success).toBe(true);
      expect(result.data.time).toBeDefined();
      expect(result.data.date).toBeDefined();
      expect(result.data.dayOfWeek).toBeDefined();
    });
  });

  describe('calculate', () => {
    it('should evaluate basic arithmetic', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('calculate', { expression: '2 + 3' });
      expect(result.success).toBe(true);
      expect(result.data.result).toBe(5);
    });

    it('should handle operator precedence', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('calculate', { expression: '2 + 3 * 4' });
      expect(result.success).toBe(true);
      expect(result.data.result).toBe(14);
    });

    it('should handle parentheses', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('calculate', { expression: '(2 + 3) * 4' });
      expect(result.success).toBe(true);
      expect(result.data.result).toBe(20);
    });

    it('should handle exponentiation', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('calculate', { expression: '2 ^ 10' });
      expect(result.success).toBe(true);
      expect(result.data.result).toBe(1024);
    });

    it('should handle modulo', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('calculate', { expression: '10 % 3' });
      expect(result.success).toBe(true);
      expect(result.data.result).toBe(1);
    });

    it('should handle negative numbers', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('calculate', { expression: '-5 + 3' });
      expect(result.success).toBe(true);
      expect(result.data.result).toBe(-2);
    });

    it('should handle decimal numbers', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('calculate', { expression: '0.1 + 0.2' });
      expect(result.success).toBe(true);
      expect(result.data.result).toBeCloseTo(0.3);
    });

    it('should reject expressions with invalid characters', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('calculate', { expression: 'alert("xss")' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid expression');
    });

    it('should reject empty expression', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('calculate', { expression: '' });
      expect(result.success).toBe(false);
    });

    it('should handle division', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('calculate', { expression: '10 / 4' });
      expect(result.success).toBe(true);
      expect(result.data.result).toBe(2.5);
    });

    it('should handle nested parentheses', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('calculate', { expression: '((1 + 2) * (3 + 4))' });
      expect(result.success).toBe(true);
      expect(result.data.result).toBe(21);
    });

    it('should handle right-associative exponentiation', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('calculate', { expression: '2 ^ 3 ^ 2' });
      expect(result.success).toBe(true);
      // 2 ^ (3 ^ 2) = 2 ^ 9 = 512
      expect(result.data.result).toBe(512);
    });
  });

  describe('plan_goal', () => {
    it('should create plan with custom steps', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('plan_goal', {
        goal: 'Build a REST API',
        steps: ['Design endpoints', 'Implement handlers', 'Write tests'],
      });
      expect(result.success).toBe(true);
      expect(result.data.goal).toBe('Build a REST API');
      expect(result.data.steps).toHaveLength(3);
      expect(result.data.totalSteps).toBe(3);
      expect(result.data.steps[0].status).toBe('pending');
    });

    it('should create default steps when no steps provided', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('plan_goal', { goal: 'Learn TypeScript' });
      expect(result.success).toBe(true);
      expect(result.data.steps).toHaveLength(4);
      expect(result.data.steps[0].description).toContain('Learn TypeScript');
    });
  });

  describe('note_save', () => {
    it('should save a note', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('note_save', {
        title: 'meeting-notes',
        content: 'Discussed architecture decisions for Q2',
        tags: ['meeting', 'architecture'],
      });
      expect(result.success).toBe(true);
      expect(result.data.title).toBe('meeting-notes');
      expect(result.data.saved).toBe(true);
    });

    it('should require title and content', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('note_save', { title: '' });
      expect(result.success).toBe(false);
    });

    it('should update existing note', async () => {
      const { tools } = createBuiltinTools();
      await tools.execute('note_save', { title: 'test', content: 'v1' });
      const result = await tools.execute('note_save', { title: 'test', content: 'v2' });
      expect(result.success).toBe(true);
      // Read back to verify update
      const read = await tools.execute('note_read', { title: 'test' });
      expect(read.data.content).toBe('v2');
    });
  });

  describe('note_read', () => {
    it('should list all notes when no title given', async () => {
      const { tools } = createBuiltinTools();
      await tools.execute('note_save', { title: 'list-test-a', content: 'alpha' });
      await tools.execute('note_save', { title: 'list-test-b', content: 'beta' });
      const result = await tools.execute('note_read', {});
      expect(result.success).toBe(true);
      expect(result.data.count).toBeGreaterThanOrEqual(2);
      const titles = result.data.notes.map((n: { title: string }) => n.title);
      expect(titles).toContain('list-test-a');
      expect(titles).toContain('list-test-b');
    });

    it('should return not found for missing note', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('note_read', { title: 'nonexistent' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('emotion_express', () => {
    it('should express an emotion and store it', async () => {
      const { tools, hippocampus } = createBuiltinTools();
      const result = await tools.execute('emotion_express', {
        emotion: 'joy',
        intensity: 0.8,
        reason: 'User solved a hard problem',
      });
      expect(result.success).toBe(true);
      expect(result.data.emotion).toBe('joy');
      expect(hippocampus.storeEpisode).toHaveBeenCalled();
    });

    it('should require emotion parameter', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('emotion_express', {});
      expect(result.success).toBe(false);
    });

    it('should work without reason', async () => {
      const { tools } = createBuiltinTools();
      const result = await tools.execute('emotion_express', { emotion: 'curiosity' });
      expect(result.success).toBe(true);
      expect(result.data.expressed).toBe(true);
    });
  });
});
