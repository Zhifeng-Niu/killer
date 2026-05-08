/**
 * TaskDelegate Tests
 */

import { describe, it, expect } from 'vitest';
import { SynapseProtocol, CellType, MockLLMProvider } from '@killer/core';
import { TaskDelegate } from '../orchestrator/task-delegate.js';
import type { CellId } from '@killer/core';

describe('TaskDelegate', () => {
  const primeCellId: CellId = { id: 'prime', type: CellType.Prime, instance: 0 };

  function createDelegate(mockResponse?: string): {
    delegate: TaskDelegate;
    synapse: SynapseProtocol;
    logs: string[];
  } {
    const synapse = new SynapseProtocol();
    synapse.registerCell(primeCellId, { name: 'prime', capabilities: ['all'], maxLoad: 10 });

    const logs: string[] = [];
    const llm = new MockLLMProvider(mockResponse ?? 'researcher | Analyze the system\nartisan | Build the feature');

    const delegate = new TaskDelegate(
      synapse,
      llm,
      primeCellId,
      (msg) => logs.push(msg),
    );

    return { delegate, synapse, logs };
  }

  it('should decompose a task into subtasks', async () => {
    const { delegate } = createDelegate();
    const result = await delegate.delegate('Analyze and build a REST API');

    expect(result.subtasks.length).toBeGreaterThanOrEqual(1);
    expect(result.synthesis).toBeTruthy();
    expect(result.taskId).toBeTruthy();
  });

  it('should use a single cell for simple tasks when LLM fails to decompose', async () => {
    const llm = new MockLLMProvider('I cannot decompose this');
    const synapse = new SynapseProtocol();
    synapse.registerCell(primeCellId, { name: 'prime', capabilities: ['all'], maxLoad: 10 });

    const delegate = new TaskDelegate(synapse, llm, primeCellId);
    const result = await delegate.delegate('Simple task');

    // Fallback: single researcher subtask
    expect(result.subtasks.length).toBe(1);
    expect(result.subtasks[0].cellType).toBe(CellType.Researcher);
  });

  it('should track subtask status', async () => {
    const { delegate } = createDelegate();
    const result = await delegate.delegate('Multi-step task');

    for (const subtask of result.subtasks) {
      expect(['completed', 'failed']).toContain(subtask.status);
    }
  });

  it('should report total cells used', async () => {
    const { delegate } = createDelegate();
    const result = await delegate.delegate('Complex task');

    expect(result.totalCellsUsed).toBeGreaterThanOrEqual(1);
    expect(result.totalCellsUsed).toBeLessThanOrEqual(4);
  });

  it('should report duration', async () => {
    const { delegate } = createDelegate();
    const result = await delegate.delegate('Timed task');

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should log activity when onLog is provided', async () => {
    const { delegate, logs } = createDelegate();
    await delegate.delegate('Logged task');

    expect(logs.length).toBeGreaterThan(0);
  });

  it('should clean up spawned cells after delegation', async () => {
    const { delegate, synapse } = createDelegate();
    const cellsBefore = synapse.discoverCells().length;

    await delegate.delegate('Cleanup test');

    // Only prime cell should remain
    const cellsAfter = synapse.discoverCells();
    expect(cellsAfter.length).toBe(cellsBefore);
  });

  it('should handle LLM errors gracefully', async () => {
    const failingLlm = {
      complete: async () => { throw new Error('LLM down'); },
      stream: async function* () { yield 'error'; },
      getModel: () => 'test',
    };

    const synapse = new SynapseProtocol();
    synapse.registerCell(primeCellId, { name: 'prime', capabilities: ['all'], maxLoad: 10 });

    const delegate = new TaskDelegate(synapse, failingLlm, primeCellId);
    const result = await delegate.delegate('Error handling task');

    // Should still produce a result (with fallback)
    expect(result).toBeTruthy();
    expect(result.subtasks.length).toBe(1);
  });

  it('should parse artisan cell type from LLM response', async () => {
    const { delegate } = createDelegate('artisan | Implement the feature');
    const result = await delegate.delegate('Build something');

    const artisanTasks = result.subtasks.filter(st => st.cellType === CellType.Artisan);
    expect(artisanTasks.length).toBeGreaterThanOrEqual(1);
  });

  it('should parse negotiator cell type from LLM response', async () => {
    const { delegate } = createDelegate('negotiator | Coordinate the team');
    const result = await delegate.delegate('Coordinate task');

    expect(result.subtasks[0].cellType).toBe(CellType.Negotiator);
  });

  it('should parse evolver cell type from LLM response', async () => {
    const { delegate } = createDelegate('evolver | Optimize performance');
    const result = await delegate.delegate('Optimize task');

    expect(result.subtasks[0].cellType).toBe(CellType.Evolver);
  });

  it('should parse multiple subtasks from LLM response', async () => {
    const { delegate } = createDelegate(
      'researcher | Investigate the issue\nartisan | Fix the code\nevolver | Optimize the fix',
    );
    const result = await delegate.delegate('Multi-subtask job');

    expect(result.subtasks.length).toBe(3);
    expect(result.subtasks.map(st => st.cellType)).toEqual(
      [CellType.Researcher, CellType.Artisan, CellType.Evolver],
    );
  });

  it('should ignore invalid cell types in LLM response', async () => {
    const { delegate } = createDelegate('wizard | Cast a spell\nresearcher | Real work');
    const result = await delegate.delegate('Mixed validity');

    // 'wizard' is invalid, only 'researcher' should parse
    expect(result.subtasks.length).toBe(1);
    expect(result.subtasks[0].cellType).toBe(CellType.Researcher);
  });

  it('should fallback to researcher when no valid subtasks parsed', async () => {
    const { delegate } = createDelegate('gibberish response');
    const result = await delegate.delegate('Unparseable task');

    expect(result.subtasks.length).toBe(1);
    expect(result.subtasks[0].cellType).toBe(CellType.Researcher);
    expect(result.subtasks[0].description).toBe('Unparseable task');
  });

  it('should assign cell IDs to subtasks', async () => {
    const { delegate } = createDelegate('researcher | Do research');
    const result = await delegate.delegate('Cell ID test');

    const assigned = result.subtasks.filter(st => st.assignedCellId);
    expect(assigned.length).toBeGreaterThanOrEqual(1);
    for (const st of assigned) {
      expect(st.assignedCellId).toBeDefined();
      expect(st.assignedCellId!.type).toBe(CellType.Researcher);
    }
  });

  it('should generate unique task IDs', async () => {
    const { delegate } = createDelegate();
    const r1 = await delegate.delegate('Task 1');
    const r2 = await delegate.delegate('Task 2');

    expect(r1.taskId).not.toBe(r2.taskId);
  });

  it('should mark subtasks as completed on success', async () => {
    const { delegate } = createDelegate('researcher | Research task');
    const result = await delegate.delegate('Success test');

    expect(result.subtasks.every(st => st.status === 'completed')).toBe(true);
  });

  it('should produce a synthesis string', async () => {
    const { delegate } = createDelegate('researcher | Investigate\nartisan | Implement');
    const result = await delegate.delegate('Synthesis test');

    expect(typeof result.synthesis).toBe('string');
    expect(result.synthesis.length).toBeGreaterThan(0);
  });

  it('should work without onLog callback', async () => {
    const synapse = new SynapseProtocol();
    synapse.registerCell(primeCellId, { name: 'prime', capabilities: ['all'], maxLoad: 10 });
    const llm = new MockLLMProvider('researcher | Do work');

    const delegate = new TaskDelegate(synapse, llm, primeCellId);
    const result = await delegate.delegate('No log task');

    expect(result).toBeTruthy();
    expect(result.subtasks.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle LLM fail during synthesize with fallback concatenation', async () => {
    let callCount = 0;
    const partialFailLlm = {
      complete: async () => {
        callCount++;
        if (callCount <= 1) {
          // First call: decompose — return 2 subtasks
          return {
            content: 'researcher | Task A\nartisan | Task B',
            model: 'test',
            finishReason: 'stop',
          };
        }
        if (callCount <= 3) {
          // Next 2 calls: subtask execution — succeed
          return { content: `Result ${callCount}`, model: 'test', finishReason: 'stop' };
        }
        // Final call: synthesis — fail
        throw new Error('Synthesis failed');
      },
      stream: async function* () { yield 'ok'; },
      getModel: () => 'test',
    };

    const synapse = new SynapseProtocol();
    synapse.registerCell(primeCellId, { name: 'prime', capabilities: ['all'], maxLoad: 10 });
    const delegate = new TaskDelegate(synapse, partialFailLlm, primeCellId);

    const result = await delegate.delegate('Synthesis fail test');

    // Should fall back to concatenated results
    expect(result.synthesis).toContain('Subtask');
    expect(result.synthesis).toContain('Result');
  });
});
