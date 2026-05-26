/**
 * CellRuntime Tests
 *
 * 测试 Cell 独立执行引擎和 CellRuntimePool
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SynapseProtocol, CellType, type CellId, type LLMProvider, type LLMCompletion } from '@killer/core';
import { MockLLMProvider } from '@killer/core';
import { CellRuntime, CellRuntimePool } from '../orchestrator/cell-runtime.js';

/**
 * 会抛错的 Mock LLM
 */
class FailingLLMProvider implements LLMProvider {
  async complete(): Promise<LLMCompletion> {
    throw new Error('LLM unavailable');
  }
  async *stream(): AsyncIterable<string> {
    throw new Error('LLM unavailable');
  }
  getModel(): string { return 'failing-llm'; }
}

/**
 * 永远不返回的 Mock LLM（用于测试超时）
 */
class HangingLLMProvider implements LLMProvider {
  async complete(): Promise<LLMCompletion> {
    return new Promise<LLMCompletion>(() => {}); // never resolves
  }
  async *stream(): AsyncIterable<string> {
    yield ''; // silence lint
  }
  getModel(): string { return 'hanging-llm'; }
}

describe('CellRuntime', () => {
  let synapse: SynapseProtocol;
  let llm: MockLLMProvider;
  let cellId: CellId;
  const logs: string[] = [];

  beforeEach(() => {
    synapse = new SynapseProtocol();
    llm = new MockLLMProvider('Research complete');
    logs.length = 0;

    cellId = { id: 'test-researcher', type: CellType.Researcher, instance: 0 };
    synapse.registerCell(cellId, {
      name: 'test-researcher',
      capabilities: ['research'],
      maxLoad: 5,
    });
  });

  describe('Lifecycle', () => {
    it('should start and stop', () => {
      const runtime = new CellRuntime(cellId, synapse, llm, {}, (msg) => logs.push(msg));

      expect(runtime.isRunning()).toBe(false);
      expect(runtime.getCellId()).toBe(cellId);

      runtime.start();
      expect(runtime.isRunning()).toBe(true);

      runtime.stop();
      expect(runtime.isRunning()).toBe(false);
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should not double-start', () => {
      const runtime = new CellRuntime(cellId, synapse, llm);
      runtime.start();
      runtime.start(); // no-op
      expect(runtime.isRunning()).toBe(true);
      runtime.stop();
    });

    it('should not double-stop', () => {
      const runtime = new CellRuntime(cellId, synapse, llm);
      runtime.start();
      runtime.stop();
      runtime.stop(); // no-op
      expect(runtime.isRunning()).toBe(false);
    });
  });

  describe('Direct Execution', () => {
    it('should execute a task and return result', async () => {
      const runtime = new CellRuntime(cellId, synapse, llm);
      const result = await runtime.execute('Analyze code patterns');

      expect(result.success).toBe(true);
      expect(result.output).toContain('Research complete');
      expect(result.cellId).toBe(cellId);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle LLM errors gracefully', async () => {
      const failingLlm = new FailingLLMProvider();
      const runtime = new CellRuntime(cellId, synapse, failingLlm);

      const result = await runtime.execute('Analyze patterns');

      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM unavailable');
    });

    it('should respect timeout config', async () => {
      const hangingLlm = new HangingLLMProvider();
      const runtime = new CellRuntime(cellId, synapse, hangingLlm, { timeoutMs: 100 });

      const result = await runtime.execute('Slow task');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Timeout');
    }, 5000);

    it('should produce unique task IDs', async () => {
      const runtime = new CellRuntime(cellId, synapse, llm);

      const r1 = await runtime.execute('task1');
      const r2 = await runtime.execute('task2');

      expect(r1.taskId).not.toBe(r2.taskId);
    });
  });

  describe('Message-Driven Execution', () => {
    it('should handle incoming Synapse messages', async () => {
      const primeCellId: CellId = { id: 'prime', type: CellType.Prime, instance: 0 };
      synapse.registerCell(primeCellId, { name: 'prime', capabilities: [], maxLoad: 10 });

      const runtime = new CellRuntime(cellId, synapse, llm, {}, (msg) => logs.push(msg));
      runtime.start();

      // Send a request message to the cell
      synapse.send(primeCellId.id, cellId.id, {
        id: 'msg-1',
        timestamp: Date.now(),
        type: 'request',
        payload: { task: 'Investigate the anomaly' },
        priority: 'normal',
      });

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Cell should have processed and stored a result
      const results = runtime.drainResults();
      expect(results.length).toBe(1);
      expect(results[0].success).toBe(true);
      expect(results[0].output).toContain('Research complete');

      runtime.stop();
    });

    it('should ignore messages without task payload', async () => {
      const primeCellId: CellId = { id: 'prime', type: CellType.Prime, instance: 0 };
      synapse.registerCell(primeCellId, { name: 'prime', capabilities: [], maxLoad: 10 });

      const runtime = new CellRuntime(cellId, synapse, llm);
      runtime.start();

      // Send a message without task
      synapse.send(primeCellId.id, cellId.id, {
        id: 'msg-2',
        timestamp: Date.now(),
        type: 'request',
        payload: { foo: 'bar' }, // no task field
        priority: 'normal',
      });

      await new Promise((resolve) => setTimeout(resolve, 200));

      const results = runtime.drainResults();
      expect(results.length).toBe(0);

      runtime.stop();
    });
  });

  describe('Result Management', () => {
    it('should store results from message-driven execution', async () => {
      const primeCellId: CellId = { id: 'prime', type: CellType.Prime, instance: 0 };
      synapse.registerCell(primeCellId, { name: 'prime', capabilities: [], maxLoad: 10 });

      const runtime = new CellRuntime(cellId, synapse, llm);
      runtime.start();

      synapse.send(primeCellId.id, cellId.id, {
        id: 'msg-r1',
        timestamp: Date.now(),
        type: 'request',
        payload: { task: 'task1' },
        priority: 'normal',
      });

      synapse.send(primeCellId.id, cellId.id, {
        id: 'msg-r2',
        timestamp: Date.now(),
        type: 'request',
        payload: { task: 'task2' },
        priority: 'normal',
      });

      await new Promise((resolve) => setTimeout(resolve, 400));

      const results = runtime.drainResults();
      expect(results.length).toBe(2);

      // Second drain should be empty
      expect(runtime.drainResults().length).toBe(0);

      runtime.stop();
    });

    it('should get result by taskId', async () => {
      const primeCellId: CellId = { id: 'prime', type: CellType.Prime, instance: 0 };
      synapse.registerCell(primeCellId, { name: 'prime', capabilities: [], maxLoad: 10 });

      const runtime = new CellRuntime(cellId, synapse, llm);
      runtime.start();

      synapse.send(primeCellId.id, cellId.id, {
        id: 'msg-r3',
        timestamp: Date.now(),
        type: 'request',
        payload: { task: 'task1' },
        priority: 'normal',
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      const allResults = runtime.drainResults();
      expect(allResults.length).toBe(1);

      // drainResults already consumed, so getResult returns undefined
      expect(runtime.getResult(allResults[0].taskId)).toBeUndefined();

      runtime.stop();
    });
  });
});

describe('CellRuntimePool', () => {
  let synapse: SynapseProtocol;
  let llm: MockLLMProvider;
  const logs: string[] = [];

  beforeEach(() => {
    synapse = new SynapseProtocol();
    llm = new MockLLMProvider('Cell output');
    logs.length = 0;
  });

  describe('Pool Management', () => {
    it('should spawn and track cells', () => {
      const pool = new CellRuntimePool(synapse, llm, {}, (msg) => logs.push(msg));

      const r1 = pool.spawn(CellType.Researcher);
      const r2 = pool.spawn(CellType.Artisan);

      expect(pool.size).toBe(2);
      expect(r1.isRunning()).toBe(true);
      expect(r2.isRunning()).toBe(true);
      expect(pool.getActive().length).toBe(2);

      pool.stopAll();
    });

    it('should retire individual cells', () => {
      const pool = new CellRuntimePool(synapse, llm);

      const runtime = pool.spawn(CellType.Researcher);
      const id = runtime.getCellId();

      expect(pool.size).toBe(1);

      pool.retire(id.id);
      expect(pool.size).toBe(0);
      expect(runtime.isRunning()).toBe(false);
    });

    it('should stop all cells', () => {
      const pool = new CellRuntimePool(synapse, llm);

      pool.spawn(CellType.Researcher);
      pool.spawn(CellType.Artisan);
      pool.spawn(CellType.Negotiator);

      expect(pool.size).toBe(3);

      pool.stopAll();
      expect(pool.size).toBe(0);
    });

    it('should get a cell by id', () => {
      const pool = new CellRuntimePool(synapse, llm);
      const runtime = pool.spawn(CellType.Evolver);

      const found = pool.get(runtime.getCellId().id);
      expect(found).toBe(runtime);

      pool.stopAll();
    });

    it('should return undefined for unknown cell', () => {
      const pool = new CellRuntimePool(synapse, llm);
      expect(pool.get('nonexistent')).toBeUndefined();
    });
  });

  describe('Pool Execution', () => {
    it('should execute tasks via spawned cells', async () => {
      const pool = new CellRuntimePool(synapse, llm);
      const r1 = pool.spawn(CellType.Researcher);
      const r2 = pool.spawn(CellType.Artisan);

      const result1 = await r1.execute('Research task');
      const result2 = await r2.execute('Build task');

      expect(result1.success).toBe(true);
      expect(result1.output).toContain('Cell output');
      expect(result2.success).toBe(true);
      expect(result2.output).toContain('Cell output');

      pool.stopAll();
    });
  });

  describe('Capabilities', () => {
    it('should assign correct capabilities per cell type', () => {
      const pool = new CellRuntimePool(synapse, llm);

      pool.spawn(CellType.Researcher);
      pool.spawn(CellType.Artisan);

      const cells = synapse.getAllCells();
      const researcher = cells.find((c) => c.id.type === CellType.Researcher);
      const artisan = cells.find((c) => c.id.type === CellType.Artisan);

      expect(researcher?.config.capabilities).toContain('research');
      expect(artisan?.config.capabilities).toContain('coding');

      pool.stopAll();
    });

    it('should spawn critic and explorer with correct capabilities', () => {
      const pool = new CellRuntimePool(synapse, llm, {}, (msg) => logs.push(msg));
      pool.spawn(CellType.Critic);
      pool.spawn(CellType.Explorer);

      const cells = synapse.getAllCells();
      const critic = cells.find((c) => c.id.type === CellType.Critic);
      const explorer = cells.find((c) => c.id.type === CellType.Explorer);

      expect(critic).toBeDefined();
      expect(critic?.config.capabilities).toContain('evaluation');
      expect(critic?.config.capabilities).toContain('verification');

      expect(explorer).toBeDefined();
      expect(explorer?.config.capabilities).toContain('hypothesis-generation');
      expect(explorer?.config.capabilities).toContain('novelty-detection');

      pool.stopAll();
    });
  });
});
