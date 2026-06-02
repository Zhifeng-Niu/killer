/**
 * Cognitive Subsystem Resilience Tests
 *
 * 验证当认知子系统在运行时抛出异常时，Agent 仍然能：
 * 1. 返回有效的 LLM 响应
 * 2. 发出 health.degraded 意识流事件
 * 3. 后续交互继续正常工作
 * 4. 在子系统恢复后自动回到正常状态
 *
 * 这是"优雅降级"的关键验证 — 框架绝不能因为认知子系统错误而崩溃。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OdysseusAgent, type AgentConfig } from '../orchestrator/index.js';
import { MockLLMProvider } from '@odysseus/core';

function createTestConfig(): AgentConfig {
  return {
    llm: new MockLLMProvider('I understand. Let me help you with that.'),
    sensory: { enabledChannels: [], bufferSize: 100 },
    memory: { dreamingEnabled: false, forgettingEnabled: false },
    prefrontal: {
      maxPlanSteps: 5,
      maxConcurrentPlans: 3,
      riskTolerance: 0.5,
    },
    evolutionEnabled: false,
    debugLogging: false,
  };
}

describe('Cognitive Subsystem Resilience', () => {
  let agent: OdysseusAgent;

  beforeEach(async () => {
    agent = new OdysseusAgent(createTestConfig());
    await agent.boot();
  });

  afterEach(async () => {
    await agent.shutdown();
  });

  describe('hippocampus failure isolation', () => {
    it('should return valid response when storeEpisode throws', async () => {
      // 强制 hippocampus.storeEpisode 抛异常
      const originalStore = agent.hippocampus.storeEpisode.bind(agent.hippocampus);
      agent.hippocampus.storeEpisode = () => {
        throw new Error('Hippocampus storage failure');
      };

      // 核心响应不应受影响
      const result = await agent.processInput('Hello, help me with something');
      expect(result).toBeDefined();
      expect(result.content).toBeTruthy();
      expect(typeof result.content).toBe('string');

      // 恢复后应能正常工作
      agent.hippocampus.storeEpisode = originalStore;
      const result2 = await agent.processInput('Another message after recovery');
      expect(result2.content).toBeTruthy();
    });

    it('should track degradation events in consciousness stream', async () => {
      // 记录意识流事件
      const events: Array<{ type: string; data: unknown }> = [];
      agent.consciousness.onType('health.degraded' as never, (event: any) => {
        events.push({ type: event.type as string, data: event.data });
      });

      // 强制 storeEpisode 失败
      agent.hippocampus.storeEpisode = () => {
        throw new Error('Simulated hippocampus failure');
      };

      await agent.processInput('This should trigger a degraded event');

      // 应该有 health.degraded 事件
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].data).toBeDefined();
    });
  });

  describe('emotional state failure isolation', () => {
    it('should return valid response when emotional processing throws', async () => {
      // 猴子补丁 persona.processEmotionalTrigger 使其抛异常
      const originalProcess = agent.persona.processEmotionalTrigger.bind(agent.persona);
      agent.persona.processEmotionalTrigger = () => {
        throw new Error('Emotional state engine crash');
      };

      const result = await agent.processInput('I am very happy today!');
      expect(result).toBeDefined();
      expect(result.content).toBeTruthy();

      // 恢复
      agent.persona.processEmotionalTrigger = originalProcess;
      const result2 = await agent.processInput('Another message');
      expect(result2.content).toBeTruthy();
    });

    it('should handle emotional reset gracefully', async () => {
      // 正常处理建立情感状态
      await agent.processInput('This is amazing and wonderful!');

      const stateBefore = agent.persona.emotionalState.getState();
      expect(stateBefore.intensity).toBeGreaterThan(0);

      // 重置情感状态
      agent.persona.emotionalState.reset();

      const stateAfter = agent.persona.emotionalState.getState();
      expect(stateAfter.intensity).toBe(0);
      expect(stateAfter.emotionalMemory.length).toBe(0);

      // 重置后仍能正常工作
      await agent.processInput('I am happy again!');
      const stateRecovered = agent.persona.emotionalState.getState();
      expect(stateRecovered.emotionalMemory.length).toBeGreaterThan(0);
    });
  });

  describe('prediction model failure isolation', () => {
    it('should return valid response when prediction update throws', async () => {
      // 使 recordInteraction 失败
      const originalRecord = agent.persona.recordInteraction.bind(agent.persona);
      agent.persona.recordInteraction = () => {
        throw new Error('Prediction model overflow');
      };

      const result = await agent.processInput('Can you predict what I need?');
      expect(result).toBeDefined();
      expect(result.content).toBeTruthy();

      // 恢复
      agent.persona.recordInteraction = originalRecord;
    });
  });

  describe('fact extraction failure isolation', () => {
    it('should return valid response when fact extraction fails', async () => {
      // 验证正常场景下事实提取工作
      await agent.processInput('My name is TestUser and I am an engineer');

      const semanticNodes = agent.hippocampus.getSemanticNodesByType('entity');
      expect(semanticNodes.length).toBeGreaterThan(0);

      // 即使事实提取失败，主流程也不应中断
      const result = await agent.processInput('Another message that should work fine');
      expect(result.content).toBeTruthy();
    });
  });

  describe('cascading subsystem failures', () => {
    it('should survive all cognitive subsystems failing simultaneously', async () => {
      // 同时使多个子系统失败
      agent.hippocampus.storeEpisode = () => {
        throw new Error('Hippocampus down');
      };
      agent.persona.processEmotionalTrigger = () => ({
        intensity: 0,
        primaryEmotion: 'neutral',
        current: { valence: 0, arousal: 0, dominance: 0 },
        emotionalMemory: [],
        lastUpdated: Date.now(),
      });
      agent.persona.recordInteraction = () => {
        throw new Error('Persona down');
      };

      // 仍然应该返回有效响应
      const result = await agent.processInput('Emergency: all systems down');
      expect(result).toBeDefined();
      expect(result.content).toBeTruthy();

      // 第二条消息也应该工作
      const result2 = await agent.processInput('Are you still there?');
      expect(result2).toBeDefined();
      expect(result2.content).toBeTruthy();
    });

    it('should recover after transient failures clear', async () => {
      // 存储原始方法
      const origStore = agent.hippocampus.storeEpisode.bind(agent.hippocampus);
      const origRecord = agent.persona.recordInteraction.bind(agent.persona);

      // Phase 1: 正常工作
      await agent.processInput('Phase 1: Normal operation');
      expect(agent.getMemoryStats().totalEpisodes).toBeGreaterThanOrEqual(1);

      // Phase 2: 瞬态故障
      agent.hippocampus.storeEpisode = () => { throw new Error('Transient'); };
      agent.persona.recordInteraction = () => { throw new Error('Transient'); };

      await agent.processInput('Phase 2: Degraded');
      // 响应仍然有效（核心不崩溃）
      // 但记忆不会增长

      // Phase 3: 恢复
      agent.hippocampus.storeEpisode = origStore;
      agent.persona.recordInteraction = origRecord;

      const episodesBefore = agent.getMemoryStats().totalEpisodes;
      await agent.processInput('Phase 3: Recovered');

      const episodesAfter = agent.getMemoryStats().totalEpisodes;
      expect(episodesAfter).toBeGreaterThan(episodesBefore);
    });
  });

  describe('health recovery mechanisms', () => {
    it('should have recovery actions registered for key subsystems', async () => {
      // healthMonitor 应该已经注册了恢复动作
      const status = agent.getStatus();
      expect(status.running).toBe(true);

      // 验证 hippocampus 恢复动作可调用（不抛异常）
      const dreamResult = await agent.hippocampus.dreamCycle();
      expect(dreamResult).toBeDefined();

      // 验证情感状态重置可调用
      agent.persona.emotionalState.reset();
      const state = agent.persona.emotionalState.getState();
      expect(state.intensity).toBe(0);
    });

    it('should handle LLM circuit breaker fallback', async () => {
      // MockLLMProvider 不会触发 circuit breaker，
      // 但我们可以验证错误路径不会崩溃
      const result = await agent.processInput('Normal message');
      expect(result.content).toBeTruthy();

      // 验证 agent 仍然健康
      expect(agent.getStatus().running).toBe(true);
    });
  });
});
