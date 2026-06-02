/**
 * 端到端集成测试
 *
 * 使用 Mock LLM Provider 测试完整 Agent 流程：
 * Sensory → Agent → Brainstem → Output
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OdysseusAgent, type AgentConfig } from '../orchestrator/index.js';
import { SkillManager } from '../skills/manager.js';
import { createLLMProvider, type LLMProviderConfig } from '../llm/index.js';
import type { SensoryInput } from '../sensory/types.js';
import { SensoryChannel } from '../sensory/types.js';

/**
 * Mock LLM - 模拟有意义的 LLM 响应
 */
class ContextualMockLLM {
  private callCount = 0;

  async complete(prompt: string): Promise<{ content: string; usage: unknown }> {
    this.callCount++;
    const lower = prompt.toLowerCase();

    // 根据输入内容生成有意义的模拟响应
    if (lower.includes('hello') || lower.includes('hi')) {
      return {
        content: 'Hello! I am Killer, your AI assistant. How can I help you today?',
        usage: { promptTokens: prompt.split(' ').length, completionTokens: 15 },
      };
    }

    if (lower.includes('status') || lower.includes('how are')) {
      return {
        content: 'All systems operational. Brainstem loop is running smoothly.',
        usage: { promptTokens: prompt.split(' ').length, completionTokens: 10 },
      };
    }

    if (lower.includes('plan') || lower.includes('goal')) {
      return {
        content: 'I understand your goal. Let me break it down into actionable steps.',
        usage: { promptTokens: prompt.split(' ').length, completionTokens: 12 },
      };
    }

    return {
      content: `Mock response #${this.callCount}: I processed your input (${prompt.slice(0, 30)}...)`,
      usage: { promptTokens: prompt.split(' ').length, completionTokens: 20 },
    };
  }

  getCallCount(): number {
    return this.callCount;
  }
}

function createE2EConfig(): AgentConfig {
  return {
    llm: new ContextualMockLLM() as never,
    sensory: { enabledChannels: ['cli'], bufferSize: 10 },
    memory: { dreamingEnabled: false, forgettingEnabled: false },
    prefrontal: { maxPlanSteps: 5, maxConcurrentPlans: 3, riskTolerance: 0.5 },
    evolutionEnabled: false,
    debugLogging: false,
  };
}

function makeInput(content: string, opts?: { command?: string; args?: string[] }): SensoryInput {
  return {
    id: `input_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    channel: SensoryChannel.CLI,
    content,
    priority: 'normal',
    metadata: opts?.command ? { command: opts.command, args: opts.args } : {},
  };
}

describe('End-to-End Integration', () => {
  let agent: OdysseusAgent;

  beforeEach(async () => {
    agent = new OdysseusAgent(createE2EConfig());
    await agent.boot();
  });

  afterEach(async () => {
    if (agent.getStatus().running) {
      await agent.shutdown();
    }
  });

  describe('Agent Lifecycle', () => {
    it('should boot and shutdown cleanly', async () => {
      const status = agent.getStatus();
      expect(status.running).toBe(true);
      expect(status.startedAt).toBeGreaterThan(0);

      await agent.shutdown();

      const afterShutdown = agent.getStatus();
      expect(afterShutdown.running).toBe(false);
      expect(afterShutdown.uptime).toBeGreaterThan(0);
    });

    it('should have all core modules initialized', () => {
      expect(agent.consciousness).toBeDefined();
      expect(agent.hippocampus).toBeDefined();
      expect(agent.evolution).toBeDefined();
      expect(agent.skills).toBeDefined();
      expect(agent.synapse).toBeDefined();
      expect(agent.brainstem).toBeDefined();
      expect(agent.tools).toBeDefined();
      expect(agent.planner).toBeDefined();
      expect(agent.riskAssessor).toBeDefined();
      expect(agent.decision).toBeDefined();
      expect(agent.planExecutor).toBeDefined();
      expect(agent.persona).toBeDefined();
    });

    it('should report correct module status', () => {
      const status = agent.getStatus();
      expect(status.modules.brainstem).toBeDefined();
      expect(status.modules.hippocampus).toBeDefined();
      expect(status.modules.prefrontal).toBeDefined();
      expect(status.modules.cortex).toBeDefined();
      expect(status.modules.synapse).toBeDefined();
      expect(status.modules.sensory).toBeDefined();
    });
  });

  describe('Sensory Input Processing', () => {
    it('should handle command inputs', () => {
      const handled = agent.handleCommand(makeInput('/status', { command: 'status' }));
      expect(handled).toBe(true);
    });

    it('should inject non-command input into brainstem', () => {
      const input = makeInput('Hello, how are you?');
      expect(() => agent.injectInput(input)).not.toThrow();
    });

    it('should handle multiple sequential inputs', () => {
      const inputs = [
        makeInput('First message'),
        makeInput('Second message'),
        makeInput('Third message'),
      ];

      for (const input of inputs) {
        agent.injectInput(input);
      }

      // No errors thrown = success
      expect(true).toBe(true);
    });
  });

  describe('Goal Management Flow', () => {
    it('should create and list goals', async () => {
      const goal = await agent.createGoal('Build REST API', 0.8);
      expect(goal).not.toBeNull();
      expect(goal!.description).toBe('Build REST API');

      const goals = agent.listGoals();
      expect(goals.length).toBeGreaterThanOrEqual(1);
    });

    it('should track plan stats', async () => {
      await agent.createGoal('Write tests', 0.7);

      const stats = agent.getPlanStats();
      expect(stats.activePlans).toBeGreaterThanOrEqual(1);
      expect(stats.completedGoals).toBe(0);
    });

    it('should create multiple goals', async () => {
      await agent.createGoal('Task A', 0.5);
      await agent.createGoal('Task B', 0.7);
      await agent.createGoal('Task C', 0.9);

      const goals = agent.listGoals();
      expect(goals.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Persona Integration', () => {
    it('should have persona with DNA', () => {
      const expression = agent.persona.getExpression();
      expect(expression.name).toBe('Killer');
      expect(expression.avatar).toBe('🧠');
    });

    it('should generate system prompt', () => {
      const prompt = agent.persona.getSystemPrompt();
      expect(prompt).toContain('Killer');
      expect(prompt).toContain('The Brain That Never Stops');
    });

    it('should observe user behavior', () => {
      agent.persona.observeUserBehavior('channel:cli', ['test message']);

      const mirrorData = agent.persona.getMirrorNeuronData();
      expect(mirrorData.observedPatterns.length).toBeGreaterThan(0);
    });
  });

  describe('Skill Manager Integration', () => {
    it('should create and execute skills', async () => {
      const skillManager = new SkillManager();
      skillManager.bindLLM(new ContextualMockLLM());

      const skill = skillManager.generate({
        targetDomain: 'coding',
        strategy: 'from_scratch',
        constraints: [{ type: 'max_tokens', value: 2000 }],
      });

      expect(skill).toBeDefined();
      expect(skill.type).toBe('coding');

      const result = await skillManager.execute(skill.id, 'Write a hello world');
      expect(result.success).toBe(true);
      expect(result.output).toBeTruthy();
    });
  });

  describe('Cell Management', () => {
    it('should spawn cells', () => {
      const cellId = agent.spawnCell('researcher', 'Research task');
      expect(cellId).not.toBeNull();
    });

    it('should report cell status', () => {
      const status = agent.getColumnStatus();
      expect(status.length).toBeGreaterThanOrEqual(1); // At least prime cell
    });

    it('should spawn multiple cell types', () => {
      agent.spawnCell('researcher', 'Research');
      agent.spawnCell('artisan', 'Build');

      const status = agent.getColumnStatus();
      const types = status.map(c => c.type);
      expect(types).toContain('researcher');
      expect(types).toContain('artisan');
    });
  });

  describe('Error Recovery', () => {
    it('should recover from middleware pipeline errors', async () => {
      // Register a middleware that throws
      agent.middleware.use(async (_ctx, next) => {
        throw new Error('middleware explosion');
      });

      // processInput should not throw — it recovers gracefully
      const result = await agent.processInput('test message');
      // Humanized error message — no longer exposes internal error details
      expect(result.content).toBeTruthy();
      expect(typeof result.content).toBe('string');
      expect(result.content.length).toBeGreaterThan(0);
    });

    it('should emit error:pipeline hook on pipeline failure', async () => {
      const errors: unknown[] = [];
      agent.hooks.on('error:pipeline', (payload) => { errors.push(payload); });

      agent.middleware.use(async (_ctx, _next) => {
        throw new Error('pipeline kaboom');
      });

      await agent.processInput('trigger error');

      expect(errors.length).toBe(1);
      expect((errors[0] as Record<string, unknown>).error).toBe('pipeline kaboom');
    });

    it('should increment pipeline_errors metric on failure', async () => {
      const { MetricsCollector } = await import('../metrics/index.js');
      const metrics = MetricsCollector.getInstance();
      const before = metrics.counter('pipeline_errors').get();

      agent.middleware.use(async (_ctx, _next) => {
        throw new Error('metrics test');
      });

      await agent.processInput('trigger metric');

      const after = metrics.counter('pipeline_errors').get();
      expect(after).toBeGreaterThan(before);
    });
  });

  describe('Full Pipeline Integration', () => {
    it('should process input through context window', async () => {
      // Add a fact to context window
      agent.contextWindow.addFact('Test fact for E2E');

      const result = await agent.processInput('Hello there!');
      expect(result.content).toBeTruthy();
      expect(agent.contextWindow.getFacts()).toContain('Test fact for E2E');
    });

    it('should emit lifecycle hooks during processing', async () => {
      const events: string[] = [];
      agent.hooks.on('input:received', () => { events.push('received'); });
      agent.hooks.on('input:processed', () => { events.push('processed'); });

      await agent.processInput('Hook test');

      expect(events).toContain('received');
      expect(events).toContain('processed');
    });

    it('should track metrics during processing', async () => {
      const { MetricsCollector } = await import('../metrics/index.js');
      const metrics = MetricsCollector.getInstance();
      const before = metrics.snapshot();

      await agent.processInput('Metrics test');

      const after = metrics.snapshot();
      const llmCallsBefore = before.metrics.find(m => m.name === 'llm_calls_total');
      const llmCallsAfter = after.metrics.find(m => m.name === 'llm_calls_total');

      expect(llmCallsAfter!.value).toBeGreaterThan(llmCallsBefore!.value);
    });

    it('should handle tool permission checks', async () => {
      // Deny a tool
      agent.toolPermissions.deny('nonexistent_tool');

      // processInput should still work fine
      const result = await agent.processInput('permission test');
      expect(result.content).toBeTruthy();
    });
  });

  describe('LLM Provider Factory', () => {
    it('should create mock provider', () => {
      const config: LLMProviderConfig = {
        provider: 'mock',
        apiKey: 'test',
      };
      const provider = createLLMProvider(config);
      expect(provider).toBeDefined();
    });

    it('should throw for unknown provider', () => {
      expect(() => {
        createLLMProvider({ provider: 'unknown' as never, apiKey: 'test' });
      }).toThrow();
    });
  });
});
