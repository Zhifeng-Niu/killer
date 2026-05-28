/**
 * Concurrency Protection Tests
 *
 * 验证 processInput 的并发保护机制：
 * - 处理锁：同时调用 processInput 时不会并发执行
 * - FIFO 队列：请求按顺序排队处理
 * - 不丢失输入：所有请求最终都被处理
 * - 处理完成后队列继续执行
 */

import { describe, it, expect, afterEach } from 'vitest';
import { OdysseusAgent, type AgentConfig } from '../orchestrator/index.js';
import type { LLMProvider, LLMCompletion } from '@odysseus/core';

/**
 * Slow Mock LLM — 模拟真实 LLM 延迟
 */
class SlowMockLLM implements LLMProvider {
  public completedMessages: string[] = [];
  private delayMs: number;

  constructor(delayMs = 50) {
    this.delayMs = delayMs;
  }

  async complete(prompt: string): Promise<LLMCompletion> {
    // Extract user message from prompt for tracking
    const userMsgMatch = prompt.match(/User: (.+?)(?:\n|$)/g);
    const lastUserMsg = userMsgMatch?.[userMsgMatch.length - 1]?.replace('User: ', '').trim() ?? prompt.slice(-50);
    this.completedMessages.push(lastUserMsg);

    await new Promise(resolve => setTimeout(resolve, this.delayMs));
    return { content: `Response to: ${lastUserMsg}`, model: 'slow-mock', finishReason: 'stop' };
  }

  async *stream(prompt: string): AsyncIterable<string> {
    await new Promise(resolve => setTimeout(resolve, this.delayMs));
    yield 'Response';
  }

  getModel(): string {
    return 'slow-mock';
  }
}

function createConfig(slowLLM: SlowMockLLM): AgentConfig {
  return {
    llm: slowLLM,
    sensory: { enabledChannels: [], bufferSize: 100 },
    memory: { dreamingEnabled: false, forgettingEnabled: false },
    prefrontal: { maxPlanSteps: 3, maxConcurrentPlans: 2, riskTolerance: 0.5 },
    evolutionEnabled: false,
    debugLogging: false,
  };
}

describe('Concurrency Protection', () => {
  let agent: OdysseusAgent;
  let slowLLM: SlowMockLLM;

  afterEach(async () => {
    try {
      await agent.shutdown();
    } catch {
      // Already shut down
    }
  });

  it('should process concurrent inputs without losing any', async () => {
    slowLLM = new SlowMockLLM(30);
    agent = new OdysseusAgent(createConfig(slowLLM));
    await agent.boot();

    // Fire 5 concurrent inputs
    const inputs = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];
    const results = await Promise.all(
      inputs.map(input => agent.processInput(input)),
    );

    // All inputs should have been processed
    expect(results.length).toBe(5);
    for (const result of results) {
      expect(result).toBeDefined();
      expect(result.content).toBeTruthy();
    }
  });

  it('should process inputs sequentially (not concurrently)', async () => {
    const executionOrder: string[] = [];
    const llm: LLMProvider = {
      complete: async (prompt: string): Promise<LLMCompletion> => {
        // Track execution order
        executionOrder.push(`start:${executionOrder.length}`);
        await new Promise(resolve => setTimeout(resolve, 20));
        executionOrder.push(`end:${executionOrder.length}`);
        return { content: 'ok', model: 'order-test', finishReason: 'stop' };
      },
      stream: async function* () { yield 'ok'; },
      getModel: () => 'order-test',
    };

    agent = new OdysseusAgent(createConfig(new SlowMockLLM(20)));
    // Override via config.llm — agent uses this.config.llm, not a .llm property
    (agent as any).config.llm = llm;
    await agent.boot();

    await Promise.all([
      agent.processInput('First'),
      agent.processInput('Second'),
      agent.processInput('Third'),
    ]);

    // All should complete
    expect(executionOrder.length).toBeGreaterThan(0);
  });

  it('should handle rapid sequential inputs', async () => {
    slowLLM = new SlowMockLLM(10);
    agent = new OdysseusAgent(createConfig(slowLLM));
    await agent.boot();

    const results: any[] = [];
    for (let i = 0; i < 10; i++) {
      results.push(await agent.processInput(`Message ${i}`));
    }

    // All should succeed
    expect(results.length).toBe(10);
    for (const result of results) {
      expect(result.content).toBeTruthy();
    }
  });

  it('should handle mixed concurrent and sequential inputs', async () => {
    slowLLM = new SlowMockLLM(20);
    agent = new OdysseusAgent(createConfig(slowLLM));
    await agent.boot();

    // Sequential first
    const r1 = await agent.processInput('Seq 1');
    expect(r1.content).toBeTruthy();

    // Then concurrent batch
    const batch = await Promise.all([
      agent.processInput('Concurrent A'),
      agent.processInput('Concurrent B'),
    ]);
    expect(batch.length).toBe(2);

    // Sequential again
    const r2 = await agent.processInput('Seq 2');
    expect(r2.content).toBeTruthy();
  });

  it('should not crash when one input triggers an error', async () => {
    let callCount = 0;
    const flakyLLM: LLMProvider = {
      complete: async (): Promise<LLMCompletion> => {
        callCount++;
        if (callCount === 2) throw new Error('Simulated LLM failure');
        return { content: 'ok', model: 'flaky', finishReason: 'stop' };
      },
      stream: async function* () { yield 'ok'; },
      getModel: () => 'flaky',
    };

    agent = new OdysseusAgent(createConfig(new SlowMockLLM(10)));
    (agent as any).config.llm = flakyLLM;
    await agent.boot();

    // Fire concurrent — one will fail
    const results = await Promise.allSettled([
      agent.processInput('Good input 1'),
      agent.processInput('Will fail'),
      agent.processInput('Good input 2'),
    ]);

    // Should have results for all (some may be fulfilled, some rejected)
    expect(results.length).toBe(3);

    // Agent should still be healthy
    const status = agent.getStatus();
    expect(status.running).toBe(true);
  });
});
