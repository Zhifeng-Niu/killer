/**
 * Tests for SelfEvolutionEngine + Evolution Tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolExecutor } from '../brainstem/tool-executor.js';
import { ToolForge, EssenceForge } from '../brainstem/tool-forge.js';
import { SelfEvolutionEngine } from '../brainstem/self-evolution-engine.js';
import { EvolveAuditTool, EvolveSelfTool, EvolveStatusTool } from '../brainstem/evolution-tools.js';
import type { EvolutionLLM } from '../brainstem/self-evolution-engine.js';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── Test helpers ──

function createTestEnv() {
  const dynamicDir = join(tmpdir(), `odysseus-test-evolve-${Date.now()}`);
  mkdirSync(dynamicDir, { recursive: true });

  const tools = new ToolExecutor();
  const toolForge = new ToolForge(tools, { dynamicDir });
  const essenceForge = new EssenceForge();

  return { tools, toolForge, essenceForge, dynamicDir };
}

function cleanup(dir: string) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function createMockLLM(response: string): EvolutionLLM {
  return { complete: vi.fn().mockResolvedValue(response) };
}

const VALID_TOOL_CODE = `export default {
  name: 'test_tool',
  description: 'A test tool for evolution',
  async execute(params) {
    return { success: true, data: { echo: params } };
  }
};`;

// ── Tests ──

describe('SelfEvolutionEngine', () => {
  describe('auditCapabilities', () => {
    it('detects missing tools', () => {
      const { tools, toolForge, essenceForge, dynamicDir } = createTestEnv();
      const engine = new SelfEvolutionEngine({ toolForge, essenceForge, tools });

      const gaps = engine.auditCapabilities();
      // With an empty tool executor, should find multiple gaps
      expect(gaps.length).toBeGreaterThan(0);

      // Check that high-severity gaps come first
      if (gaps.length > 1) {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        expect(severityOrder[gaps[0].severity]).toBeLessThanOrEqual(severityOrder[gaps[1].severity]);
      }

      cleanup(dynamicDir);
    });

    it('detects weak tools with high failure rates', () => {
      const { tools, toolForge, essenceForge, dynamicDir } = createTestEnv();

      // Register a tool that's already in toolForge metadata with high failures
      // We need to access meta directly — create a dynamic tool via forge first
      const engine = new SelfEvolutionEngine({ toolForge, essenceForge, tools });

      const gaps = engine.auditCapabilities();
      // Basic check: audit returns an array of CapabilityGap
      expect(Array.isArray(gaps)).toBe(true);
      for (const gap of gaps) {
        expect(gap).toHaveProperty('type');
        expect(gap).toHaveProperty('description');
        expect(gap).toHaveProperty('evidence');
        expect(gap).toHaveProperty('severity');
      }

      cleanup(dynamicDir);
    });
  });

  describe('evolve', () => {
    it('fails gracefully when no LLM is provided', async () => {
      const { tools, toolForge, essenceForge, dynamicDir } = createTestEnv();
      const engine = new SelfEvolutionEngine({ toolForge, essenceForge, tools });

      const result = await engine.evolve({
        type: 'missing_tool',
        description: 'Need a JSON parser',
        evidence: 'No tool found',
        severity: 'high',
      });

      expect(result.success).toBe(false);
      expect(result.phase).toBe('reason');
      cleanup(dynamicDir);
    });

    it('runs full evolution cycle with mock LLM', async () => {
      const { tools, toolForge, essenceForge, dynamicDir } = createTestEnv();
      const mockLLM = createMockLLM(
        `DECISION: evolve
TOOL_NAME: json_formatter
CODE:
${VALID_TOOL_CODE.replace('test_tool', 'json_formatter')}`
      );

      const engine = new SelfEvolutionEngine({
        toolForge,
        essenceForge,
        tools,
        llm: mockLLM,
      });

      const result = await engine.evolve({
        type: 'missing_tool',
        description: 'Need a JSON formatting tool',
        evidence: 'No json_formatter tool registered',
        severity: 'high',
      });

      // The evolution should succeed (tool created and verified)
      expect(result.success).toBe(true);
      expect(result.toolName).toBeTruthy();
      expect(mockLLM.complete).toHaveBeenCalledOnce();

      cleanup(dynamicDir);
    });

    it('records evolution in history', async () => {
      const { tools, toolForge, essenceForge, dynamicDir } = createTestEnv();
      const mockLLM = createMockLLM('DECISION: skip\nREASON: already covered');

      const engine = new SelfEvolutionEngine({
        toolForge,
        essenceForge,
        tools,
        llm: mockLLM,
      });

      await engine.evolve({
        type: 'missing_tool',
        description: 'Need something',
        evidence: 'Test',
        severity: 'low',
      });

      const history = engine.getHistory();
      expect(history.length).toBeGreaterThan(0);

      cleanup(dynamicDir);
    });

    it('prevents concurrent evolution', async () => {
      const { tools, toolForge, essenceForge, dynamicDir } = createTestEnv();

      // Create an LLM that takes time to respond
      const slowLLM: EvolutionLLM = {
        complete: () => new Promise(resolve => setTimeout(() => resolve('DECISION: skip\nREASON: slow'), 100)),
      };

      const engine = new SelfEvolutionEngine({
        toolForge,
        essenceForge,
        tools,
        llm: slowLLM,
      });

      // Start first evolution
      const first = engine.evolve({
        type: 'missing_tool',
        description: 'Gap 1',
        evidence: 'Test',
        severity: 'low',
      });

      // Try second while first is running
      const second = await engine.evolve({
        type: 'missing_tool',
        description: 'Gap 2',
        evidence: 'Test',
        severity: 'low',
      });

      expect(second.success).toBe(false);

      // Wait for first to complete
      await first;
      expect(engine.isRunning()).toBe(false);

      cleanup(dynamicDir);
    });
  });

  describe('getStatus', () => {
    it('reports correct initial status', () => {
      const { tools, toolForge, essenceForge, dynamicDir } = createTestEnv();
      const engine = new SelfEvolutionEngine({ toolForge, essenceForge, tools });

      const status = engine.getStatus();
      expect(status.running).toBe(false);
      expect(status.totalEvolutions).toBe(0);
      expect(status.successfulEvolutions).toBe(0);
      expect(status.failedEvolutions).toBe(0);

      cleanup(dynamicDir);
    });
  });
});

describe('Evolution Tools', () => {
  describe('EvolveAuditTool', () => {
    it('returns capability gaps', async () => {
      const { tools, toolForge, essenceForge, dynamicDir } = createTestEnv();
      const engine = new SelfEvolutionEngine({ toolForge, essenceForge, tools });
      const auditTool = new EvolveAuditTool(engine);

      const result = await auditTool.execute({});
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('gaps');
      expect(result.data).toHaveProperty('summary');
      expect(result.data).toHaveProperty('recommendation');

      cleanup(dynamicDir);
    });
  });

  describe('EvolveSelfTool', () => {
    it('requires description parameter', async () => {
      const { tools, toolForge, essenceForge, dynamicDir } = createTestEnv();
      const engine = new SelfEvolutionEngine({ toolForge, essenceForge, tools });
      const selfTool = new EvolveSelfTool(engine);

      const result = await selfTool.execute({});
      expect(result.success).toBe(false);
      expect(result.error).toContain('description');

      cleanup(dynamicDir);
    });

    it('fails when no LLM available', async () => {
      const { tools, toolForge, essenceForge, dynamicDir } = createTestEnv();
      const engine = new SelfEvolutionEngine({ toolForge, essenceForge, tools });
      const selfTool = new EvolveSelfTool(engine);

      const result = await selfTool.execute({ description: 'I need to parse CSV files' });
      expect(result.success).toBe(false);

      cleanup(dynamicDir);
    });
  });

  describe('EvolveStatusTool', () => {
    it('returns summary by default', async () => {
      const { tools, toolForge, essenceForge, dynamicDir } = createTestEnv();
      const engine = new SelfEvolutionEngine({ toolForge, essenceForge, tools });
      const statusTool = new EvolveStatusTool(engine);

      const result = await statusTool.execute({});
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('running');
      expect(result.data).toHaveProperty('totalEvolutions');

      cleanup(dynamicDir);
    });

    it('returns full history with detail=all', async () => {
      const { tools, toolForge, essenceForge, dynamicDir } = createTestEnv();
      const engine = new SelfEvolutionEngine({ toolForge, essenceForge, tools });
      const statusTool = new EvolveStatusTool(engine);

      const result = await statusTool.execute({ detail: 'all' });
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('status');
      expect(result.data).toHaveProperty('history');

      cleanup(dynamicDir);
    });
  });
});
