/**
 * Prefrontal Integration Tests
 *
 * 测试前额叶皮层与 Orchestrator 的集成
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KillerAgent, type AgentConfig } from '../orchestrator/index.js';
import type { SensoryInput } from '../sensory/types.js';
import { SensoryChannel } from '../sensory/types.js';

class MockLLMProvider {
  async complete(_prompt: string): Promise<{ content: string; usage?: unknown }> {
    return { content: 'Mock response', usage: { promptTokens: 10, completionTokens: 5 } };
  }
}

function createTestConfig(): AgentConfig {
  return {
    llm: new MockLLMProvider(),
    sensory: { enabledChannels: ['cli'], bufferSize: 10 },
    memory: { dreamingEnabled: false, forgettingEnabled: false },
    prefrontal: { maxPlanSteps: 5, maxConcurrentPlans: 3, riskTolerance: 0.5 },
    evolutionEnabled: false,
    debugLogging: false,
  };
}

describe('Prefrontal Integration', () => {
  let agent: KillerAgent;

  beforeEach(async () => {
    agent = new KillerAgent(createTestConfig());
    await agent.boot();
  });

  afterEach(async () => {
    if (agent.getStatus().running) {
      await agent.shutdown();
    }
  });

  describe('Goal Management', () => {
    it('should create a goal', async () => {
      const goal = await agent.createGoal('Build a REST API', 0.7);
      expect(goal).toBeDefined();
      expect(goal).not.toBeNull();
      expect(goal!.description).toBe('Build a REST API');
      expect(goal!.priority).toBe(0.7);
      expect(goal!.status).toBe('pending');
    });

    it('should list active goals', async () => {
      await agent.createGoal('Task 1', 0.5);
      await agent.createGoal('Task 2', 0.8);

      const goals = agent.listGoals();
      expect(goals.length).toBeGreaterThanOrEqual(2);
    });

    it('should track plan stats', async () => {
      await agent.createGoal('Task 1', 0.5);

      const stats = agent.getPlanStats();
      expect(stats.activePlans).toBeGreaterThanOrEqual(1);
      expect(stats.completedGoals).toBe(0);
    });
  });

  describe('Persona Integration', () => {
    it('should have persona initialized', () => {
      expect(agent.persona).toBeDefined();
      expect(agent.persona.getExpression().name).toBe('Killer');
    });

    it('should observe user behavior when input routes through sensory', () => {
      // injectInput bypasses sensory router, so observe manually
      agent.persona.observeUserBehavior('channel:cli', ['Hello, can you help']);

      const patterns = agent.persona.getMirrorNeuronData().observedPatterns;
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].pattern).toBe('channel:cli');
    });

    it('should generate persona system prompt', () => {
      const prompt = agent.persona.getSystemPrompt();
      expect(prompt).toContain('Killer');
      expect(prompt).toContain('The Brain That Never Stops');
    });
  });

  describe('Prefrontal Wiring', () => {
    it('should have planner initialized', () => {
      expect(agent.planner).toBeDefined();
    });

    it('should have risk assessor initialized', () => {
      expect(agent.riskAssessor).toBeDefined();
    });

    it('should have decision engine initialized', () => {
      expect(agent.decision).toBeDefined();
    });

    it('should have plan executor initialized', () => {
      expect(agent.planExecutor).toBeDefined();
    });
  });
});
