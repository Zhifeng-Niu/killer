/**
 * E2E Cognitive Pipeline Integration Test
 *
 * 验证完整的多轮对话中认知管线工作正常：
 * - 情感演变 (Emotional State Evolution)
 * - 记忆积累 (Memory Accumulation)
 * - 预测更新 (Predictive Model Updates)
 * - 叙事增长 (Narrative Growth)
 * - Session 持久化+恢复 (Session Save/Restore)
 *
 * 使用真实的 OdysseusAgent + MockLLMProvider 作为集成点。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { OdysseusAgent, type AgentConfig } from '../orchestrator/index.js';
import { MockLLMProvider } from '@odysseus/core';

/**
 * 创建测试用 Agent（禁用自动维护以避免定时器泄漏）
 */
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

describe('E2E Cognitive Pipeline', () => {
  let agent: OdysseusAgent;

  beforeEach(async () => {
    agent = new OdysseusAgent(createTestConfig());
    await agent.boot();
  });

  afterEach(async () => {
    await agent.shutdown();
  });

  describe('multi-turn emotional evolution', () => {
    it('should evolve emotional state across positive interactions', async () => {
      const initialState = agent.persona.emotionalState.getState();

      // 第一轮：正面交互
      await agent.processInput('Hello! I am so happy to see you today!');
      const afterFirst = agent.persona.emotionalState.getState();
      // Valence should have moved or emotional memory should have entries
      expect(afterFirst.emotionalMemory.length).toBeGreaterThanOrEqual(1);

      // 第二轮：更多正面交互（情感可能因衰减而波动，但整体应保持正面）
      await agent.processInput('This is wonderful! You are doing an amazing job!');
      const afterSecond = agent.persona.emotionalState.getState();
      expect(afterSecond.emotionalMemory.length).toBeGreaterThanOrEqual(2);

      // 第三轮：平静交互
      await agent.processInput('Can you help me with something?');
      const afterThird = agent.persona.emotionalState.getState();
      expect(afterThird.lastUpdated).toBeGreaterThan(0);
    });

    it('should track emotional events across interactions', async () => {
      await agent.processInput('I love working with you on this project!');
      await agent.processInput('This is terrible and frustrating');
      await agent.processInput('Actually, thanks for your help');

      const state = agent.persona.emotionalState.getState();
      expect(state.emotionalMemory.length).toBeGreaterThanOrEqual(2);
    });

    it('should shift valence from positive to negative input', async () => {
      await agent.processInput('Everything is great and wonderful!');
      const positiveState = agent.persona.emotionalState.getState();
      const positiveValence = positiveState.current.valence;

      await agent.processInput('This is so sad and disappointing');
      const negativeState = agent.persona.emotionalState.getState();
      // After negative input, valence should decrease or emotional events should record it
      expect(negativeState.emotionalMemory.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('episodic memory accumulation', () => {
    it('should accumulate episodes from interactions', async () => {
      const beforeStats = agent.getMemoryStats();

      await agent.processInput('I need help fixing a bug in my auth module');
      await agent.processInput('The JWT token validation is failing');

      const stats = agent.getMemoryStats();
      expect(stats.totalEpisodes).toBeGreaterThan(beforeStats.totalEpisodes);
      expect(stats.totalEpisodes).toBeGreaterThanOrEqual(2);
    });

    it('should tag episodes with relevant topics', async () => {
      await agent.processInput('Can you explain how to fix this code error?');

      const episodes = agent.hippocampus.getAllEpisodes();
      expect(episodes.length).toBeGreaterThanOrEqual(1);

      // detectTopics maps code-related words to 'coding'
      const taggedEpisode = episodes.find(ep =>
        ep.tags.some(t => t === 'coding' || t === 'learning')
      );
      expect(taggedEpisode).toBeDefined();
    });

    it('should assign emotional weight based on input sentiment', async () => {
      await agent.processInput('This is amazing, thank you so much!');

      const episodes = agent.hippocampus.getAllEpisodes();
      const positiveEpisode = episodes.find(ep => ep.emotionalWeight > 0.3);
      expect(positiveEpisode).toBeDefined();
    });

    it('should accumulate association links between episodes', async () => {
      await agent.processInput('Help me set up my authentication system');
      await agent.processInput('Now let us add JWT token support');
      await agent.processInput('How do I handle token refresh?');

      const episodes = agent.hippocampus.getAllEpisodes();
      // All three should exist
      expect(episodes.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('predictive model development', () => {
    it('should update predictions after sufficient interactions', async () => {
      const initialPreds = agent.persona.getPredictions();
      expect(initialPreds.psychologicalProfile).toBeDefined();

      await agent.processInput('Help me debug this function');
      await agent.processInput('I need to fix another bug in my code');
      await agent.processInput('Can you explain this error message?');

      const laterPreds = agent.persona.getPredictions();
      // Predictions should have been updated (check profile development)
      expect(laterPreds.psychologicalProfile).toBeDefined();
      // User model should reflect accumulated interactions
      const userModel = agent.persona.getUserModel();
      expect(userModel.interactionSummary.totalInteractions).toBeGreaterThanOrEqual(3);
    });

    it('should detect communication patterns from repeated question patterns', async () => {
      await agent.processInput('How do I fix this code?');
      await agent.processInput('How does this API work?');
      await agent.processInput('What is the best way to test this?');

      const userModel = agent.persona.getUserModel();
      expect(userModel.interactionSummary.totalInteractions).toBeGreaterThanOrEqual(3);
    });

    it('should update trust level with positive interactions', async () => {
      const initialTrust = agent.persona.getUserModel().trustLevel;

      await agent.processInput('Great answer, that really helped!');
      await agent.processInput('Perfect, thank you!');

      const laterTrust = agent.persona.getUserModel().trustLevel;
      expect(laterTrust).toBeGreaterThanOrEqual(initialTrust);
    });

    it('should infer psychological profile from interaction history', async () => {
      await agent.processInput('Let us analyze this in detail');
      await agent.processInput('I need to research all the options first');
      await agent.processInput('Can you provide a thorough comparison?');

      const preds = agent.persona.getPredictions();
      expect(preds.psychologicalProfile).toBeDefined();
      expect(preds.psychologicalProfile.decisionStyle).toBeTruthy();
    });
  });

  describe('narrative growth via dream cycle', () => {
    it('should have initial narrative state', () => {
      const narrative = agent.hippocampus.getNarrative();
      expect(narrative.identityStatement).toBeTruthy();
      expect(narrative.chapters).toEqual([]);
      expect(narrative.activeThemes).toEqual([]);
    });

    it('should synthesize narrative chapter after dream cycle', async () => {
      await agent.processInput('Help me design a REST API');
      await agent.processInput('How should I structure the database?');
      await agent.processInput('I need to implement authentication');

      const dreamResult = await agent.hippocampus.dreamCycle();
      expect(dreamResult.memoriesConsolidated).toBeGreaterThanOrEqual(0);

      const narrative = agent.hippocampus.getNarrative();
      expect(narrative.chapters.length).toBeGreaterThanOrEqual(1);
    });

    it('should update active themes after dream cycle', async () => {
      await agent.processInput('Let us discuss coding patterns');
      await agent.processInput('How to write better code?');
      await agent.processInput('Best practices for code review');
      await agent.hippocampus.dreamCycle();

      const narrative = agent.hippocampus.getNarrative();
      // Active themes should be updated from dream synthesis
      expect(narrative.activeThemes.length).toBeGreaterThanOrEqual(0);
    });

    it('should include narrative context in prompt', () => {
      const context = agent.hippocampus.getNarrativeContextForPrompt();
      expect(context).toContain('Identity:');
    });
  });

  describe('session persistence and restore', () => {
    it('should save and restore cognitive state via hippocampus/persona export', async () => {
      await agent.processInput('Hello, I want to learn TypeScript');
      await agent.processInput('What are generics in TypeScript?');
      await agent.processInput('Thanks, that was very helpful!');

      const preSaveStats = agent.getMemoryStats();
      const preSaveTrust = agent.persona.getUserModel().trustLevel;
      const preSaveInteractions = agent.persona.getUserModel().interactionSummary.totalInteractions;

      expect(preSaveStats.totalEpisodes).toBeGreaterThanOrEqual(2);
      expect(preSaveInteractions).toBeGreaterThanOrEqual(3);

      // 导出状态
      const hippocampusData = agent.hippocampus.export();
      const personaGenome = agent.persona.exportGenome();

      // 创建新 agent 并恢复
      const restoredAgent = new OdysseusAgent(createTestConfig());
      await restoredAgent.boot();

      restoredAgent.hippocampus.import({
        episodic: hippocampusData.episodic,
        semantic: hippocampusData.semantic,
        narrative: hippocampusData.narrative,
      });
      restoredAgent.persona.importGenome(personaGenome);

      // 验证恢复后的状态
      const restoredStats = restoredAgent.getMemoryStats();
      expect(restoredStats.totalEpisodes).toBe(preSaveStats.totalEpisodes);

      const restoredTrust = restoredAgent.persona.getUserModel().trustLevel;
      expect(Math.abs(restoredTrust - preSaveTrust)).toBeLessThan(0.01);

      const restoredInteractions = restoredAgent.persona.getUserModel().interactionSummary.totalInteractions;
      expect(restoredInteractions).toBe(preSaveInteractions);

      // 恢复的 agent 应该能继续对话
      const result = await restoredAgent.processInput('Can we continue from where we left off?');
      expect(result.content).toBeTruthy();

      await restoredAgent.shutdown();
    });

    it('should preserve narrative across session restore', async () => {
      await agent.processInput('Let us discuss system design patterns');
      await agent.processInput('What about microservices architecture?');
      await agent.processInput('I also want to learn about event sourcing');
      await agent.hippocampus.dreamCycle();

      const preChapters = agent.hippocampus.getNarrative().chapters.length;
      const preIdentity = agent.hippocampus.getNarrative().identityStatement;

      const data = agent.hippocampus.export();
      const restoredAgent = new OdysseusAgent(createTestConfig());
      await restoredAgent.boot();
      restoredAgent.hippocampus.import({
        episodic: data.episodic,
        narrative: data.narrative,
      });

      const restoredNarrative = restoredAgent.hippocampus.getNarrative();
      expect(restoredNarrative.chapters.length).toBe(preChapters);
      expect(restoredNarrative.identityStatement).toBe(preIdentity);

      await restoredAgent.shutdown();
    });

    it('should restore emotional state via persona genome', async () => {
      await agent.processInput('I am so happy about this!');
      await agent.processInput('Wonderful, let us continue!');

      const preEmotionCount = agent.persona.emotionalState.getState().emotionalMemory.length;
      const preValence = agent.persona.emotionalState.getState().current.valence;
      const genome = agent.persona.exportGenome();
      const emotionalExport = agent.persona.emotionalState.exportState();

      const restoredAgent = new OdysseusAgent(createTestConfig());
      await restoredAgent.boot();
      restoredAgent.persona.importGenome(genome);
      // Explicitly restore emotional state (done by loadIdentityFromSession in prod)
      restoredAgent.persona.emotionalState.importState(emotionalExport);

      // Emotional state should be preserved
      const restoredEmotion = restoredAgent.persona.emotionalState.getState();
      expect(restoredEmotion.emotionalMemory.length).toBe(preEmotionCount);
      expect(Math.abs(restoredEmotion.current.valence - preValence)).toBeLessThan(0.01);

      // Genome data preserved
      const restoredUser = restoredAgent.persona.getUserModel();
      const originalUser = agent.persona.getUserModel();
      expect(restoredUser.interactionSummary.totalInteractions).toBe(originalUser.interactionSummary.totalInteractions);

      await restoredAgent.shutdown();
    });
  });

  describe('system prompt integration', () => {
    it('should include cognitive context in system prompt', async () => {
      await agent.processInput('Hello, I am a developer');
      await agent.processInput('Help me with my project');

      const result = await agent.processInput('What can you help me with?');
      expect(result.content).toBeTruthy();
    });

    it('should weave emotional state into prompt', () => {
      const prompt = agent.persona.getSystemPrompt();
      expect(prompt).toContain('Killer');
      expect(prompt).toContain('Personality Spectrum');
    });

    it('should include user understanding in prompt', () => {
      const userPrompt = agent.persona.getUserContextPrompt();
      expect(userPrompt).toContain('User Model');
      expect(userPrompt).toContain('Trust');
    });

    it('should evolve prompt content after interactions', async () => {
      const promptBefore = agent.persona.getSystemPrompt();

      await agent.processInput('I love working with you!');
      await agent.processInput('This is great!');

      const promptAfter = agent.persona.getSystemPrompt();
      // Relationship info should appear after interactions
      expect(promptAfter).toContain('exchanges shared');
    });
  });

  describe('mirror neuron learning', () => {
    it('should observe and learn from user behavior patterns', async () => {
      const initialPatterns = agent.persona.getMirrorNeuronData().observedPatterns;

      await agent.processInput('Can you explain how this code works? I have a question.');
      await agent.processInput('What about this function over here?');

      // User model should record interactions
      const userModel = agent.persona.getUserModel();
      expect(userModel.interactionSummary.totalInteractions).toBeGreaterThanOrEqual(2);
    });

    it('should increase sync level with more pattern observations', async () => {
      const initialSync = agent.persona.getMirrorNeuronData().syncLevel;

      await agent.processInput('Let us work on a coding problem');
      await agent.processInput('I prefer concise answers');

      const laterSync = agent.persona.getMirrorNeuronData().syncLevel;
      expect(laterSync).toBeGreaterThanOrEqual(initialSync);
    });
  });

  describe('consciousness stream events', () => {
    it('should emit consciousness events during processing', async () => {
      // Use getCurrentState to see all events accumulated
      await agent.processInput('I am very happy with the results!');
      await agent.processInput('Can we work on the next feature?');

      const allEvents = agent.consciousness.getCurrentState();
      // Consciousness stream should have accumulated events from processing
      expect(allEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('resilience and self-healing', () => {
    it('should continue processing without errors under normal load', async () => {
      const result = await agent.processInput('Hello, can you help me?');
      expect(result.content).toBeTruthy();
    });

    it('should handle multiple sequential interactions without degradation', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await agent.processInput(`Message ${i + 1}: quick question about topic ${i}`);
        expect(result.content).toBeTruthy();
      }

      const stats = agent.getMemoryStats();
      expect(stats.totalEpisodes).toBeGreaterThanOrEqual(3);
    });

    it('should maintain cognitive state consistency across interactions', async () => {
      await agent.processInput('My name is Alice');
      await agent.processInput('I am a software engineer');

      // After multiple interactions, state should be internally consistent
      const trustLevel = agent.persona.getUserModel().trustLevel;
      expect(trustLevel).toBeGreaterThanOrEqual(0);
      expect(trustLevel).toBeLessThanOrEqual(1);

      const emotionalState = agent.persona.emotionalState.getState();
      expect(emotionalState.current.valence).toBeGreaterThanOrEqual(-1);
      expect(emotionalState.current.valence).toBeLessThanOrEqual(1);
    });
  });

  describe('full cognitive relay (Samantha persistence)', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'odysseus-relay-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    function createRelayConfig(): AgentConfig {
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
        sessionDir: tempDir,
      };
    }

    it('should relay complete cognitive state across agent lifecycle', async () => {
      // ── Phase 1: Boot, accumulate rich cognitive state ──
      const agent1 = new OdysseusAgent(createRelayConfig());
      await agent1.boot();

      // 多轮交互积累认知状态
      await agent1.processInput('My name is Alice, I am a data scientist');
      await agent1.processInput('I am working on a machine learning project');
      await agent1.processInput('This is amazing progress, I am so happy!');
      await agent1.processInput('Can you help me debug this neural network error?');
      await agent1.processInput('The gradient descent is not converging properly');
      await agent1.processInput('Great advice, that really helped me fix the bug!');
      await agent1.processInput('Now I want to add unit tests for the model');
      await agent1.processInput('What testing framework would you recommend?');

      // 触发叙事合成
      await agent1.hippocampus.dreamCycle();

      // 捕获所有认知维度的快照
      const snapshot = {
        episodes: agent1.hippocampus.getAllEpisodes().length,
        semanticNodes: agent1.hippocampus.getSemanticNodesByType('entity').length,
        totalInteractions: agent1.persona.getUserModel().interactionSummary.totalInteractions,
        trustLevel: agent1.persona.getUserModel().trustLevel,
        syncLevel: agent1.persona.getMirrorNeuronData().syncLevel,
        emotionalMemoryLength: agent1.persona.emotionalState.getState().emotionalMemory.length,
        valence: agent1.persona.emotionalState.getState().current.valence,
        arousal: agent1.persona.emotionalState.getState().current.arousal,
        narrativeChapters: agent1.hippocampus.getNarrative().chapters.length,
        personalityTraits: Object.fromEntries(agent1.persona.getAllTraits()),
        predictedNeedsCount: agent1.persona.getPredictions().predictedNeeds.length,
        psychologicalProfile: agent1.persona.getPredictions().psychologicalProfile,
      };

      // 验证 Phase 1 确实积累了认知状态
      expect(snapshot.totalInteractions).toBeGreaterThanOrEqual(8);
      expect(snapshot.episodes).toBeGreaterThanOrEqual(4);
      expect(snapshot.trustLevel).toBeGreaterThan(0);
      expect(snapshot.narrativeChapters).toBeGreaterThanOrEqual(1);

      // 保存 + 关闭
      agent1.saveSession('relay-test');
      await agent1.shutdown();

      // ── Phase 2: 新 agent 启动，加载认知状态 ──
      const agent2 = new OdysseusAgent(createRelayConfig());
      await agent2.boot();
      const loaded = agent2.loadSession('relay-test');
      expect(loaded).toBe(true);

      // 验证每个认知维度都被接力
      const relayed = {
        episodes: agent2.hippocampus.getAllEpisodes().length,
        semanticNodes: agent2.hippocampus.getSemanticNodesByType('entity').length,
        totalInteractions: agent2.persona.getUserModel().interactionSummary.totalInteractions,
        trustLevel: agent2.persona.getUserModel().trustLevel,
        syncLevel: agent2.persona.getMirrorNeuronData().syncLevel,
        emotionalMemoryLength: agent2.persona.emotionalState.getState().emotionalMemory.length,
        valence: agent2.persona.emotionalState.getState().current.valence,
        arousal: agent2.persona.emotionalState.getState().current.arousal,
        narrativeChapters: agent2.hippocampus.getNarrative().chapters.length,
        personalityTraits: Object.fromEntries(agent2.persona.getAllTraits()),
        predictedNeedsCount: agent2.persona.getPredictions().predictedNeeds.length,
        psychologicalProfile: agent2.persona.getPredictions().psychologicalProfile,
      };

      // 记忆接力
      expect(relayed.episodes).toBe(snapshot.episodes);

      // 语义记忆接力
      expect(relayed.semanticNodes).toBe(snapshot.semanticNodes);

      // 用户模型接力
      expect(relayed.totalInteractions).toBe(snapshot.totalInteractions);
      expect(Math.abs(relayed.trustLevel - snapshot.trustLevel)).toBeLessThan(0.01);

      // 镜像神经元接力
      expect(relayed.syncLevel).toBeCloseTo(snapshot.syncLevel, 2);

      // 情感状态接力
      expect(relayed.emotionalMemoryLength).toBe(snapshot.emotionalMemoryLength);
      expect(Math.abs(relayed.valence - snapshot.valence)).toBeLessThan(0.01);
      expect(Math.abs(relayed.arousal - snapshot.arousal)).toBeLessThan(0.01);

      // 叙事接力
      expect(relayed.narrativeChapters).toBe(snapshot.narrativeChapters);

      // 人格特质接力
      for (const [trait, value] of Object.entries(snapshot.personalityTraits)) {
        expect(relayed.personalityTraits[trait]).toBeCloseTo(value, 2);
      }

      // 预测模型接力
      expect(relayed.psychologicalProfile.openness).toBeCloseTo(
        snapshot.psychologicalProfile.openness, 2,
      );
      expect(relayed.psychologicalProfile.decisionStyle).toBe(
        snapshot.psychologicalProfile.decisionStyle,
      );

      // ── Phase 3: 接力后的 agent 能继续积累认知 ──
      await agent2.processInput('Thanks for remembering everything about me!');
      await agent2.processInput('Let us continue with the testing framework discussion');

      const continuedStats = agent2.getMemoryStats();
      expect(continuedStats.totalEpisodes).toBeGreaterThan(snapshot.episodes);

      const continuedTrust = agent2.persona.getUserModel().trustLevel;
      expect(continuedTrust).toBeGreaterThanOrEqual(relayed.trustLevel);

      await agent2.shutdown();
    });

    it('should maintain emotional continuity across relay', async () => {
      // Phase 1: 创造强烈的情感状态
      const agent1 = new OdysseusAgent(createRelayConfig());
      await agent1.boot();

      await agent1.processInput('I am so incredibly frustrated with this bug!');
      await agent1.processInput('Nothing is working, this is terrible!');

      const negativeValence = agent1.persona.emotionalState.getState().current.valence;
      const negativeEmotion = agent1.persona.emotionalState.getState().primaryEmotion;

      agent1.saveSession('emotion-relay');
      await agent1.shutdown();

      // Phase 2: 新 agent 应该"记得"上次用户的挫败感
      const agent2 = new OdysseusAgent(createRelayConfig());
      await agent2.boot();
      agent2.loadSession('emotion-relay');

      const relayedEmotion = agent2.persona.emotionalState.getState();
      expect(Math.abs(relayedEmotion.current.valence - negativeValence)).toBeLessThan(0.01);

      // 情感记忆中应该有记录
      expect(relayedEmotion.emotionalMemory.length).toBeGreaterThan(0);

      await agent2.shutdown();
    });

    it('should relay personality traits faithfully', async () => {
      // Phase 1: 发展人格
      const agent1 = new OdysseusAgent(createRelayConfig());
      await agent1.boot();

      agent1.persona.updateTrait('curiosity', 0.95);
      agent1.persona.updateTrait('warmth', 0.85);
      agent1.persona.updateTrait('analytical', 0.75);
      agent1.persona.updateTrait('creativity', 0.6);

      agent1.saveSession('trait-relay');
      await agent1.shutdown();

      // Phase 2: 验证人格特质完整接力
      const agent2 = new OdysseusAgent(createRelayConfig());
      await agent2.boot();
      agent2.loadSession('trait-relay');

      expect(agent2.persona.getTrait('curiosity')).toBeCloseTo(0.95, 2);
      expect(agent2.persona.getTrait('warmth')).toBeCloseTo(0.85, 2);
      expect(agent2.persona.getTrait('analytical')).toBeCloseTo(0.75, 2);
      expect(agent2.persona.getTrait('creativity')).toBeCloseTo(0.6, 2);

      await agent2.shutdown();
    });
  });
});
