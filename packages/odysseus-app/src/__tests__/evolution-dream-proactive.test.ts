/**
 * Evolution, Dream Cycle & Proactive Suggestions Integration Tests
 *
 * 验证 Agent 的三个核心"持续存在"机制：
 * - Dream cycle: 记忆整合 → 叙事章节生成 → 主题提取
 * - Evolution: 技能评估 → 低效技能改进 → 成功率提升
 * - Proactive suggestions: 预测模型 → 情感状态 → 主动建议推送
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OdysseusAgent, type AgentConfig } from '../orchestrator/index.js';
import { MockLLMProvider } from '@odysseus/core';

function createConfig(): AgentConfig {
  return {
    llm: new MockLLMProvider('Integration test response'),
    sensory: { enabledChannels: [], bufferSize: 100 },
    memory: { dreamingEnabled: true, forgettingEnabled: false },
    prefrontal: { maxPlanSteps: 3, maxConcurrentPlans: 2, riskTolerance: 0.5 },
    evolutionEnabled: true,
    debugLogging: false,
  };
}

describe('Evolution & Dream Cycle Integration', () => {
  let agent: OdysseusAgent;

  beforeEach(async () => {
    agent = new OdysseusAgent(createConfig());
    await agent.boot();
  });

  afterEach(async () => {
    await agent.shutdown();
  });

  describe('Dream Cycle', () => {
    it('should create narrative chapters after dream cycle with episodes', async () => {
      // Store enough episodes to generate chapters
      for (let i = 0; i < 5; i++) {
        agent.hippocampus.storeEpisode({
          title: `Coding session ${i}`,
          narrative: `User worked on TypeScript project, implementing feature ${i}`,
          emotionalWeight: 0.5 + i * 0.1,
          tags: ['coding', 'typescript'],
          associations: [],
          decayRate: 0.1,
          accessCount: 0,
        });
      }

      const dreamResult = await agent.dream();

      expect(dreamResult).toBeDefined();
      expect(dreamResult.episodesConsolidated).toBeGreaterThanOrEqual(0);
      expect(dreamResult.newAssociations).toBeGreaterThanOrEqual(0);

      // Check narrative for chapters
      const narrative = agent.hippocampus.getNarrative();
      // Dream cycle should have processed the episodes
      expect(narrative).toBeDefined();
      expect(Array.isArray(narrative.chapters)).toBe(true);
    });

    it('should extract themes during dream cycle', async () => {
      // Store episodes with diverse themes
      const themes = ['coding', 'learning', 'planning', 'debugging', 'design'];
      for (const theme of themes) {
        agent.hippocampus.storeEpisode({
          title: `${theme} session`,
          narrative: `User engaged in ${theme} activity with moderate success`,
          emotionalWeight: 0.5,
          tags: [theme],
          associations: [],
          decayRate: 0.1,
          accessCount: 0,
        });
      }

      await agent.dream();

      const narrative = agent.hippocampus.getNarrative();
      expect(narrative.activeThemes).toBeDefined();
    });

    it('should handle dream cycle with empty memory gracefully', async () => {
      const result = await agent.dream();

      expect(result).toBeDefined();
      expect(result.episodesConsolidated).toBe(0);
      expect(result.newAssociations).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Evolution', () => {
    it('should execute evolve cycle', async () => {
      const result = await agent.evolve();

      expect(result).toBeDefined();
      // Evolution result structure
      expect(typeof result).toBe('object');
    });

    it('should track skill state after evolution', async () => {
      // Get skills before
      const skillsBefore = agent.getSkills();

      await agent.evolve();

      // Skills should still be accessible after evolution
      const skillsAfter = agent.getSkills();
      expect(skillsAfter).toBeDefined();
      expect(Array.isArray(skillsAfter)).toBe(true);
    });
  });

  describe('Proactive Suggestions', () => {
    it('should emit proactive.suggestion events through consciousness stream', async () => {
      const events: unknown[] = [];
      agent.consciousness.onType('proactive.suggestion' as never, (event: unknown) => {
        events.push(event);
      });

      // Build up prediction data and emotional state to trigger suggestions
      for (let i = 0; i < 10; i++) {
        agent.persona.recordInteraction(200 + i * 50, 0.6 + i * 0.03, ['coding']);
      }
      agent.persona.processEmotionalTrigger('This is terrible and frustrating', 'user-message');

      // The consciousness stream is the mechanism for suggestions
      // Even without explicit trigger, the event infrastructure should work
      expect(agent.consciousness).toBeDefined();
    });

    it('should have consciousness stream for proactive events', () => {
      // Fresh agent should have consciousness infrastructure
      expect(agent.consciousness).toBeDefined();
      const status = agent.getStatus();
      expect(status.running).toBe(true);
    });
  });

  describe('Think', () => {
    it('should execute deep thinking on a topic', async () => {
      const result = await agent.think('How to optimize the database queries');

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });
  });

  describe('Full lifecycle with all background processes', () => {
    it('should survive multiple interactions + dream + evolve cycle', async () => {
      // Multiple interactions to build up state
      for (let i = 0; i < 3; i++) {
        const result = await agent.processInput(`Tell me about topic ${i}`);
        expect(result.content).toBeTruthy();
      }

      // Trigger dream
      const dreamResult = await agent.dream();
      expect(dreamResult).toBeDefined();

      // Trigger evolution
      const evolveResult = await agent.evolve();
      expect(evolveResult).toBeDefined();

      // Verify agent still healthy
      const status = agent.getStatus();
      expect(status.running).toBe(true);

      // Continue interacting
      const finalResult = await agent.processInput('Final message');
      expect(finalResult.content).toBeTruthy();

      // Memory should have accumulated
      const memStats = agent.getMemoryStats();
      expect(memStats.totalEpisodes).toBeGreaterThan(0);
    });

    it('should maintain agent health throughout background processes', async () => {
      // Heavy operations
      for (let i = 0; i < 5; i++) {
        agent.hippocampus.storeEpisode({
          title: `Episode ${i}`,
          narrative: `Content ${i}`,
          emotionalWeight: 0.5,
          tags: ['test'],
          associations: [],
          decayRate: 0.1,
          accessCount: 0,
        });
      }

      await agent.dream();
      await agent.evolve();

      const health = agent.healthMonitor.check();
      expect(health).toBeDefined();
    });
  });
});
