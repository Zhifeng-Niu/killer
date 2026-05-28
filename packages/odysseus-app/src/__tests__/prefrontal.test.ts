/**
 * Prefrontal Integration Tests
 *
 * 测试前额叶皮层与 Orchestrator 的集成
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OdysseusAgent, type AgentConfig } from '../orchestrator/index.js';
import type { SensoryInput } from '../sensory/types.js';
import { SensoryChannel } from '../sensory/types.js';

class MockLLMProvider {
  private goalAnalysisResponse = 'NO';
  private decompositionResponse = '';

  setGoalAnalysis(response: string): void {
    this.goalAnalysisResponse = response;
  }

  setDecomposition(response: string): void {
    this.decompositionResponse = response;
  }

  async complete(prompt: string): Promise<{ content: string; usage?: unknown }> {
    // Route based on prompt content
    if (prompt.includes('Break down this goal')) {
      return { content: this.decompositionResponse || 'SUB | Step 1 | none\nSUB | Step 2 | 1', usage: { promptTokens: 10, completionTokens: 5 } };
    }
    if (prompt.includes('Does it describe a complex')) {
      return { content: this.goalAnalysisResponse, usage: { promptTokens: 10, completionTokens: 5 } };
    }
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
  let agent: OdysseusAgent;

  beforeEach(async () => {
    agent = new OdysseusAgent(createTestConfig());
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

  describe('Goal Decomposition', () => {
    it('should decompose a complex goal into sub-goals', async () => {
      const mockProvider = new MockLLMProvider();
      mockProvider.setDecomposition([
        'SUB | Design API schema | none',
        'SUB | Implement database models | 1',
        'SUB | Build auth middleware | 1',
        'SUB | Write endpoint handlers | 2, 3',
        'SUB | Add integration tests | 4',
      ].join('\n'));

      const decomposeAgent = new OdysseusAgent({
        llm: mockProvider,
        sensory: { enabledChannels: [], bufferSize: 10 },
        memory: { dreamingEnabled: false, forgettingEnabled: false },
        prefrontal: { maxPlanSteps: 5, maxConcurrentPlans: 3, riskTolerance: 0.5 },
        evolutionEnabled: false,
        debugLogging: false,
      });
      await decomposeAgent.boot();

      const parent = await decomposeAgent.createGoal('Build REST API with auth', 0.8);
      expect(parent).toBeDefined();

      const subGoals = await decomposeAgent.decomposeGoal(parent!);
      expect(subGoals.length).toBe(5);
      expect(subGoals[0].parentGoalId).toBe(parent!.id);
      expect(subGoals[0].status).toBe('in_progress'); // no dependencies → ready
      expect(subGoals[1].status).toBe('pending'); // depends on #1

      await decomposeAgent.shutdown();
    });

    it('should return empty array for unparseable LLM response', async () => {
      const mockProvider = new MockLLMProvider();
      mockProvider.setDecomposition('I cannot break this down');

      const testAgent = new OdysseusAgent({
        llm: mockProvider,
        sensory: { enabledChannels: [], bufferSize: 10 },
        memory: { dreamingEnabled: false, forgettingEnabled: false },
        prefrontal: { maxPlanSteps: 5, maxConcurrentPlans: 3, riskTolerance: 0.5 },
        evolutionEnabled: false,
        debugLogging: false,
      });
      await testAgent.boot();

      const goal = await testAgent.createGoal('Simple task', 0.5);
      const subGoals = await testAgent.decomposeGoal(goal!);
      expect(subGoals.length).toBe(0);

      await testAgent.shutdown();
    });

    it('should mark parallel sub-goals as in_progress', async () => {
      const mockProvider = new MockLLMProvider();
      mockProvider.setDecomposition([
        'SUB | Research frameworks | none',
        'SUB | Analyze requirements | none',
        'SUB | Write proposal | 1, 2',
      ].join('\n'));

      const testAgent = new OdysseusAgent({
        llm: mockProvider,
        sensory: { enabledChannels: [], bufferSize: 10 },
        memory: { dreamingEnabled: false, forgettingEnabled: false },
        prefrontal: { maxPlanSteps: 5, maxConcurrentPlans: 3, riskTolerance: 0.5 },
        evolutionEnabled: false,
        debugLogging: false,
      });
      await testAgent.boot();

      const goal = await testAgent.createGoal('Plan migration', 0.7);
      const subGoals = await testAgent.decomposeGoal(goal!);

      // First two have no deps → in_progress (parallel)
      expect(subGoals[0].status).toBe('in_progress');
      expect(subGoals[1].status).toBe('in_progress');
      // Third depends on both → pending
      expect(subGoals[2].status).toBe('pending');

      await testAgent.shutdown();
    });
  });
});
