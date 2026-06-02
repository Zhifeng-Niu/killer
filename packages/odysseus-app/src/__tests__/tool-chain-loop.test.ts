/**
 * Tool Chain Loop Integration Tests
 *
 * 验证多轮工具推理链（runToolChainLoop）：
 * LLM 返回工具调用 → 执行 → 结果反馈给 LLM → 继续推理 → 最终响应
 *
 * 还验证：
 * - 自我收敛：LLM 不再调用工具时自然终止（无硬性上限）
 * - 工具执行后 LLM 的 follow-up 调用
 * - 工具权限拒绝在链中的处理
 */

import { describe, it, expect, afterEach } from 'vitest';
import { OdysseusAgent, type AgentConfig } from '../orchestrator/index.js';
import type { LLMProvider, LLMCompletion, Tool, ToolResult } from '@odysseus/core';

/**
 * 多轮 Mock LLM：按顺序返回不同的响应
 * 支持模拟工具调用 → 推理结果的多轮对话
 */
class MultiTurnMockLLM implements LLMProvider {
  private responses: string[];
  private callIndex = 0;

  constructor(responses: string[]) {
    this.responses = responses;
  }

  async complete(prompt: string): Promise<LLMCompletion> {
    const response = this.responses[Math.min(this.callIndex, this.responses.length - 1)];
    this.callIndex++;
    return { content: response, model: 'multi-turn-mock', finishReason: 'stop' };
  }

  async *stream(prompt: string): AsyncIterable<string> {
    const response = this.responses[Math.min(this.callIndex, this.responses.length - 1)];
    this.callIndex++;
    yield response;
  }

  getModel(): string {
    return 'multi-turn-mock';
  }

  get callCount(): number {
    return this.callIndex;
  }
}

/**
 * 创建测试工具
 */
function createTool(name: string, handler: (params: unknown) => Promise<unknown>): Tool {
  return {
    name,
    description: `Test tool: ${name}`,
    execute: async (params: unknown): Promise<ToolResult> => {
      const result = await handler(params);
      return {
        success: true,
        data: result,
      };
    },
  };
}

describe('Tool Chain Loop', () => {
  let agent: OdysseusAgent;
  let llm: MultiTurnMockLLM;

  afterEach(async () => {
    try {
      await agent.shutdown();
    } catch {
      // Already shut down
    }
  });

  it('should execute a single tool call and return the result', async () => {
    llm = new MultiTurnMockLLM([
      'Let me check that.\n```tool\n{"tool":"lookup","params":{"key":"test"}}\n```',
      'Based on the lookup: the test key has value "hello world".',
    ]);

    const config: AgentConfig = {
      llm,
      sensory: { enabledChannels: [], bufferSize: 100 },
      memory: { dreamingEnabled: false, forgettingEnabled: false },
      prefrontal: { maxPlanSteps: 3, maxConcurrentPlans: 2, riskTolerance: 0.5 },
      evolutionEnabled: false,
      debugLogging: false,
    };
    agent = new OdysseusAgent(config);
    await agent.boot();

    // Register tool after boot and auto-approve
    agent.tools.register(createTool('lookup', async (params: unknown) => {
      const { key } = params as { key: string };
      return { key, value: 'hello world' };
    }));
    agent.toolPermissions.addRule({ tool: 'lookup', permission: 'auto' });

    const result = await agent.processInput('What is the value of test?');

    expect(result).toBeDefined();
    expect(result.content).toBeTruthy();
    expect(llm.callCount).toBeGreaterThanOrEqual(2);
  });

  it('should handle response without tool calls (no loop needed)', async () => {
    llm = new MultiTurnMockLLM(['Just a simple response without any tools.']);

    agent = new OdysseusAgent({
      llm,
      sensory: { enabledChannels: [], bufferSize: 100 },
      memory: { dreamingEnabled: false, forgettingEnabled: false },
      prefrontal: { maxPlanSteps: 3, maxConcurrentPlans: 2, riskTolerance: 0.5 },
      evolutionEnabled: false,
      debugLogging: false,
    });
    await agent.boot();

    const result = await agent.processInput('Hello');

    expect(result.content).toContain('simple response');
    expect(llm.callCount).toBe(1);
  });

  it('should execute multiple tool calls in a single response', async () => {
    llm = new MultiTurnMockLLM([
      '```tool\n{"tool":"add","params":{"a":1,"b":2}}\n```\n```tool\n{"tool":"add","params":{"a":3,"b":4}}\n```',
      'The results are: 1+2=3 and 3+4=7.',
    ]);

    agent = new OdysseusAgent({
      llm,
      sensory: { enabledChannels: [], bufferSize: 100 },
      memory: { dreamingEnabled: false, forgettingEnabled: false },
      prefrontal: { maxPlanSteps: 3, maxConcurrentPlans: 2, riskTolerance: 0.5 },
      evolutionEnabled: false,
      debugLogging: false,
    });
    await agent.boot();

    agent.tools.register(createTool('add', async (params: unknown) => {
      const { a, b } = params as { a: number; b: number };
      return { result: a + b };
    }));
    agent.toolPermissions.addRule({ tool: 'add', permission: 'auto' });

    const result = await agent.processInput('Add some numbers');

    expect(result.content).toBeTruthy();
    // LLM should be called twice: initial (with tool calls) + follow-up
    expect(llm.callCount).toBeGreaterThanOrEqual(2);
  });

  it('should handle tool errors gracefully in the chain', async () => {
    llm = new MultiTurnMockLLM([
      '```tool\n{"tool":"failing_tool","params":{}}\n```',
      'The tool failed, but here is my best answer.',
    ]);

    agent = new OdysseusAgent({
      llm,
      sensory: { enabledChannels: [], bufferSize: 100 },
      memory: { dreamingEnabled: false, forgettingEnabled: false },
      prefrontal: { maxPlanSteps: 3, maxConcurrentPlans: 2, riskTolerance: 0.5 },
      evolutionEnabled: false,
      debugLogging: false,
    });
    await agent.boot();

    agent.tools.register(createTool('failing_tool', async () => {
      throw new Error('Intentional test failure');
    }));
    agent.toolPermissions.addRule({ tool: 'failing_tool', permission: 'auto' });

    const result = await agent.processInput('Use the failing tool');

    expect(result.content).toBeTruthy();
    // LLM follow-up should still work despite tool error
    expect(llm.callCount).toBeGreaterThanOrEqual(2);
  });

  it('should handle inline tool call format', async () => {
    llm = new MultiTurnMockLLM([
      'Let me calculate: [TOOL: calc]({"expression":"2+2"})',
      'The calculation result is 4.',
    ]);

    agent = new OdysseusAgent({
      llm,
      sensory: { enabledChannels: [], bufferSize: 100 },
      memory: { dreamingEnabled: false, forgettingEnabled: false },
      prefrontal: { maxPlanSteps: 3, maxConcurrentPlans: 2, riskTolerance: 0.5 },
      evolutionEnabled: false,
      debugLogging: false,
    });
    await agent.boot();

    agent.tools.register(createTool('calc', async (params: unknown) => {
      const { expression } = params as { expression: string };
      return { expression, result: 4 };
    }));
    agent.toolPermissions.addRule({ tool: 'calc', permission: 'auto' });

    const result = await agent.processInput('Calculate 2+2');

    expect(result.content).toBeTruthy();
    // LLM should have been called twice (initial tool call + follow-up)
    expect(llm.callCount).toBeGreaterThanOrEqual(2);
  });

  it('should respect tool permissions in the chain', async () => {
    llm = new MultiTurnMockLLM([
      '```tool\n{"tool":"dangerous","params":{}}\n```',
      'The dangerous tool was blocked, but I can still help.',
    ]);

    agent = new OdysseusAgent({
      llm,
      sensory: { enabledChannels: [], bufferSize: 100 },
      memory: { dreamingEnabled: false, forgettingEnabled: false },
      prefrontal: { maxPlanSteps: 3, maxConcurrentPlans: 2, riskTolerance: 0.5 },
      evolutionEnabled: false,
      debugLogging: false,
    });
    await agent.boot();

    agent.tools.register(createTool('dangerous', async () => ({ success: true })));
    // Deny the dangerous tool
    agent.toolPermissions.deny('dangerous', 'Too dangerous for testing');

    const result = await agent.processInput('Use the dangerous tool');

    expect(result.content).toBeTruthy();
    expect(result.content).toContain('[Tool Blocked: dangerous]');
  });

  it('should stop tool chain when follow-up has no more tools', async () => {
    llm = new MultiTurnMockLLM([
      '```tool\n{"tool":"lookup","params":{"key":"x"}}\n```',
      'Final answer: the value is found.',
    ]);

    agent = new OdysseusAgent({
      llm,
      sensory: { enabledChannels: [], bufferSize: 100 },
      memory: { dreamingEnabled: false, forgettingEnabled: false },
      prefrontal: { maxPlanSteps: 3, maxConcurrentPlans: 2, riskTolerance: 0.5 },
      evolutionEnabled: false,
      debugLogging: false,
    });
    await agent.boot();

    agent.tools.register(createTool('lookup', async () => ({ key: 'x', value: 'found' })));
    agent.toolPermissions.addRule({ tool: 'lookup', permission: 'auto' });

    const result = await agent.processInput('Look up x');

    expect(result.content).toContain('Final answer');
    // Tool was executed, then LLM follow-up (no more tools) — chain stops
    expect(llm.callCount).toBeGreaterThanOrEqual(2);
  });

  it('should self-converge when LLM stops calling tools', async () => {
    // Two-phase approach: Phase 1 text call + tool execution + Phase 2 follow-up
    const toolResponse = '```tool\n{"tool":"loop_tool","params":{}}\n```';

    llm = new MultiTurnMockLLM([
      toolResponse,  // Phase 1: text response with tool call
      'I have gathered enough information. Here is my final answer.',  // Phase 2: follow-up after tool results
    ]);

    agent = new OdysseusAgent({
      llm,
      sensory: { enabledChannels: [], bufferSize: 100 },
      memory: { dreamingEnabled: false, forgettingEnabled: false },
      prefrontal: { maxPlanSteps: 3, maxConcurrentPlans: 2, riskTolerance: 0.5 },
      evolutionEnabled: false,
      debugLogging: false,
    });
    await agent.boot();

    agent.tools.register(createTool('loop_tool', async () => ({ round: 'processed' })));
    agent.toolPermissions.addRule({ tool: 'loop_tool', permission: 'auto' });

    const result = await agent.processInput('Research this topic');

    expect(result.content).toBeTruthy();
    // Two-phase: Phase 1 (text + tool) + Phase 2 (follow-up) = 2 LLM calls
    expect(llm.callCount).toBe(2);
  });

  it('should skip unknown tools silently without breaking chain', async () => {
    llm = new MultiTurnMockLLM([
      '```tool\n{"tool":"nonexistent","params":{}}\n```',
      'I tried to use a tool but it was not available. Here is my answer anyway.',
    ]);

    agent = new OdysseusAgent({
      llm,
      sensory: { enabledChannels: [], bufferSize: 100 },
      memory: { dreamingEnabled: false, forgettingEnabled: false },
      prefrontal: { maxPlanSteps: 3, maxConcurrentPlans: 2, riskTolerance: 0.5 },
      evolutionEnabled: false,
      debugLogging: false,
    });
    await agent.boot();

    // Don't register 'nonexistent' tool

    const result = await agent.processInput('Use an unknown tool');

    expect(result.content).toBeTruthy();
  });
});
