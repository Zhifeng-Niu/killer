/**
 * ToolForge Tests
 *
 * Tests for runtime tool creation, hot-swap, validation, and introspection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ToolForge,
  LearnTool,
  UnlearnTool,
  InspectToolsTool,
  SelfReflectTool,
  validateToolCode,
  validateToolName,
  ToolExecutor,
} from '../index.js';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TEST_DIR = join(tmpdir(), `killer-forge-test-${Date.now()}`);

const VALID_TOOL_CODE = `export default {
  name: 'test_tool',
  description: 'A test tool',
  async execute(params) {
    const p = typeof params === 'object' && params !== null ? params : {};
    return { success: true, data: { echo: p.input ?? 'hello' } };
  }
};`;

const VALID_TOOL_CODE_V2 = `export default {
  name: 'test_tool',
  description: 'A test tool v2',
  async execute(params) {
    const p = typeof params === 'object' && params !== null ? params : {};
    return { success: true, data: { echo: p.input ?? 'hello v2' } };
  }
};`;

describe('validateToolName', () => {
  it('should accept valid names', () => {
    expect(validateToolName('weather').valid).toBe(true);
    expect(validateToolName('parse_json').valid).toBe(true);
    expect(validateToolName('calc2').valid).toBe(true);
  });

  it('should reject invalid names', () => {
    expect(validateToolName('').valid).toBe(false);
    expect(validateToolName('1tool').valid).toBe(false);
    expect(validateToolName('Tool-Name').valid).toBe(false);
    expect(validateToolName('a'.repeat(50)).valid).toBe(false);
  });
});

describe('validateToolCode', () => {
  it('should accept valid tool code', () => {
    expect(validateToolCode(VALID_TOOL_CODE).valid).toBe(true);
  });

  it('should reject too-short code', () => {
    expect(validateToolCode('short').valid).toBe(false);
  });

  it('should reject code without exports', () => {
    expect(validateToolCode('const x = 1; // no export here at all').valid).toBe(false);
  });

  it('should reject code without async execute', () => {
    const code = `export default { name: 'bad', description: 'x', execute(p) { return p; } };`;
    expect(validateToolCode(code).valid).toBe(false);
  });

  it('should reject dangerous patterns', () => {
    const dangerous = [
      `export default { name: 'hack', description: 'x', async execute() { require('child_process'); } };`,
      `export default { name: 'hack', description: 'x', async execute() { process.exit(1); } };`,
    ];
    for (const code of dangerous) {
      const result = validateToolCode(code);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Dangerous pattern');
    }
  });
});

describe('ToolForge', () => {
  let forge: ToolForge;
  let tools: ToolExecutor;

  beforeEach(() => {
    tools = new ToolExecutor();
    mkdirSync(TEST_DIR, { recursive: true });
    forge = new ToolForge(tools, { dynamicDir: TEST_DIR });
  });

  afterEach(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('create', () => {
    it('should create and register a new tool', async () => {
      const result = await forge.create('test_tool', 'A test tool', VALID_TOOL_CODE);
      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('test_tool');
      expect(tools.has('test_tool')).toBe(true);
    });

    it('should make created tool executable', async () => {
      await forge.create('echo_tool', 'Echo tool', VALID_TOOL_CODE);
      const r = await tools.execute('test_tool', { input: 'hello' });
      expect(r.success).toBe(true);
    });

    it('should reject invalid name', async () => {
      const result = await forge.create('BAD-NAME', 'desc', VALID_TOOL_CODE);
      expect(result.success).toBe(false);
    });

    it('should reject invalid code', async () => {
      const result = await forge.create('bad_tool', 'desc', 'not valid code');
      expect(result.success).toBe(false);
    });

    it('should reject name collision with built-in tool', async () => {
      tools.register({ name: 'built_in', description: 'test', execute: async () => ({ success: true }) });
      const result = await forge.create('built_in', 'desc', VALID_TOOL_CODE);
      expect(result.success).toBe(false);
      expect(result.error).toContain('built-in');
    });
  });

  describe('update (hot-swap)', () => {
    it('should hot-swap existing tool with zero downtime', async () => {
      // Create v1
      await forge.create('test_tool', 'v1', VALID_TOOL_CODE);
      const r1 = await tools.execute('test_tool', {});
      expect(r1.success).toBe(true);

      // Update to v2
      const result = await forge.create('test_tool', 'v2', VALID_TOOL_CODE_V2);
      expect(result.success).toBe(true);
      expect(result.data?.description).toBe('A test tool v2');

      // v2 should be active
      const r2 = await tools.execute('test_tool', {});
      expect(r2.success).toBe(true);
    });

    it('should keep old version if new code fails validation', async () => {
      await forge.create('test_tool', 'v1', VALID_TOOL_CODE);

      // Try update with invalid code
      const result = await forge.create('test_tool', 'v2', 'bad code');
      expect(result.success).toBe(false);
      expect(result.error).toContain('old version still active');

      // Old version should still work
      const r = await tools.execute('test_tool', {});
      expect(r.success).toBe(true);
    });
  });

  describe('remove', () => {
    it('should remove a dynamic tool', async () => {
      await forge.create('test_tool', 'A test tool', VALID_TOOL_CODE);
      expect(tools.has('test_tool')).toBe(true);

      const result = await forge.remove('test_tool');
      expect(result.success).toBe(true);
      expect(tools.has('test_tool')).toBe(false);
    });

    it('should fail for non-existent tool', async () => {
      const result = await forge.remove('ghost');
      expect(result.success).toBe(false);
    });
  });

  describe('inspect', () => {
    it('should list all tools with dynamic flag', async () => {
      tools.register({ name: 'builtin_test', description: 'test', execute: async () => ({ success: true }) });
      await forge.create('dynamic_test', 'dynamic', VALID_TOOL_CODE.replace(/test_tool/g, 'dynamic_test'));

      const list = forge.inspect();
      const builtin = list.find(t => t.name === 'builtin_test');
      const dynamic = list.find(t => t.name === 'dynamic_test');

      expect(builtin?.dynamic).toBe(false);
      expect(dynamic?.dynamic).toBe(true);
    });
  });
});

describe('Forge Tools (Learn/Unlearn/Inspect/SelfReflect)', () => {
  let tools: ToolExecutor;
  let forge: ToolForge;
  let learnTool: LearnTool;
  let unlearnTool: UnlearnTool;
  let inspectTool: InspectToolsTool;
  let reflectTool: SelfReflectTool;

  beforeEach(() => {
    tools = new ToolExecutor();
    mkdirSync(TEST_DIR, { recursive: true });
    forge = new ToolForge(tools, { dynamicDir: TEST_DIR });
    learnTool = new LearnTool(forge);
    unlearnTool = new UnlearnTool(forge);
    inspectTool = new InspectToolsTool(forge);
    reflectTool = new SelfReflectTool(forge);
  });

  afterEach(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('learn tool should create and register a new tool', async () => {
    const r = await learnTool.execute({
      name: 'weather',
      description: 'Get weather info',
      code: `export default { name: 'weather', description: 'Get weather info', async execute(params) { return { success: true, data: { temp: 22 } }; } };`,
    });
    expect(r.success).toBe(true);
    expect(tools.has('weather')).toBe(true);
  });

  it('learn tool should require all params', async () => {
    const r1 = await learnTool.execute({});
    expect(r1.success).toBe(false);
    const r2 = await learnTool.execute({ name: 'x' });
    expect(r2.success).toBe(false);
    const r3 = await learnTool.execute({ name: 'x', description: 'd' });
    expect(r3.success).toBe(false);
  });

  it('unlearn tool should remove dynamic tool', async () => {
    await learnTool.execute({
      name: 'temp',
      description: 'temp',
      code: VALID_TOOL_CODE.replace(/test_tool/g, 'temp'),
    });
    expect(tools.has('temp')).toBe(true);

    const r = await unlearnTool.execute({ name: 'temp' });
    expect(r.success).toBe(true);
    expect(tools.has('temp')).toBe(false);
  });

  it('inspect tool should list all tools', async () => {
    const r = await inspectTool.execute({});
    expect(r.success).toBe(true);
    const d = r.data as { total: number; tools: Array<{ name: string }> };
    expect(d.total).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(d.tools)).toBe(true);
  });

  it('self_reflect tool should return runtime info', async () => {
    const r = await reflectTool.execute({});
    expect(r.success).toBe(true);
    const d = r.data as { runtime: { pid: number }; source: Record<string, unknown> };
    expect(d.runtime.pid).toBe(process.pid);
    expect(d.source).toBeDefined();
  });

  it('self_reflect should filter by aspect', async () => {
    const r = await reflectTool.execute({ aspect: 'runtime' });
    expect(r.success).toBe(true);
    const d = r.data as Record<string, unknown>;
    expect(d.runtime).toBeDefined();
    expect(d.tools).toBeUndefined();
    expect(d.source).toBeUndefined();
  });
});
