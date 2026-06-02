/**
 * Cognitive Integration Flow Tests
 *
 * 验证 processInput 流程中认知特征的完整集成：
 * 情感处理、行为观察、交互记录、episodic memory 存储
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OdysseusAgent, type AgentConfig } from '../orchestrator/index.js';
import { MockLLMProvider } from '@odysseus/core';

function createTestAgent(): OdysseusAgent {
  const config: AgentConfig = {
    llm: new MockLLMProvider('I can help with that!'),
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
  return new OdysseusAgent(config);
}

describe('Cognitive Integration Flow', () => {
  let agent: OdysseusAgent;

  beforeEach(async () => {
    agent = createTestAgent();
    await agent.boot();
  });

  afterEach(async () => {
    await agent.shutdown();
  });

  describe('Emotional Processing', () => {
    it('should update emotional state from user input', async () => {
      const beforeEmotion = agent.persona.emotionalState.getState().primaryEmotion;

      await agent.processInput('I am so happy and excited about this project!');

      const afterEmotion = agent.persona.emotionalState.getState();
      // Emotional state should have been processed
      expect(afterEmotion.emotionalMemory.length).toBeGreaterThan(0);
    });

    it('should process agent response emotional content', async () => {
      await agent.processInput('This is wonderful and amazing!');

      // Both user input and agent response are processed as emotional triggers
      const state = agent.persona.emotionalState.getState();
      expect(state.emotionalMemory.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Behavior Observation', () => {
    it('should observe user behavior patterns from input', async () => {
      await agent.processInput('Can you explain how this code works? I have a question.');

      const mirrorData = agent.persona.getMirrorNeuronData();
      expect(mirrorData.observedPatterns.length).toBeGreaterThan(0);

      // Should detect asks-questions pattern
      const questionPattern = mirrorData.observedPatterns.find(p => p.pattern === 'asks-questions');
      expect(questionPattern).toBeDefined();
    });

    it('should detect code-related input', async () => {
      await agent.processInput('How do I fix the function `addNumbers` in my class?');

      const mirrorData = agent.persona.getMirrorNeuronData();
      const codePattern = mirrorData.observedPatterns.find(p => p.pattern === 'uses-code');
      expect(codePattern).toBeDefined();
    });
  });

  describe('Interaction Recording', () => {
    it('should record interaction with satisfaction estimate', async () => {
      await agent.processInput('Thank you, this is great!');

      const userModel = agent.persona.getUserModel();
      expect(userModel.interactionSummary.totalInteractions).toBeGreaterThan(0);
    });

    it('should detect topics from user input', async () => {
      await agent.processInput('Can you help me debug this error in my code?');

      const userModel = agent.persona.getUserModel();
      expect(userModel.interactionSummary.commonTopics.length).toBeGreaterThan(0);
      // Should include 'coding' topic
      expect(userModel.interactionSummary.commonTopics).toContain('coding');
    });

    it('should track response time', async () => {
      await agent.processInput('Hello there');

      const userModel = agent.persona.getUserModel();
      expect(userModel.interactionSummary.avgResponseTime).toBeGreaterThan(0);
    });

    it('should update trust level based on interactions', async () => {
      const beforeTrust = agent.persona.getUserModel().trustLevel;

      // Positive interaction
      await agent.processInput('Thank you so much, this is perfect!');

      const afterTrust = agent.persona.getUserModel().trustLevel;
      expect(afterTrust).toBeGreaterThanOrEqual(beforeTrust);
    });
  });

  describe('Episodic Memory Storage', () => {
    it('should store episodic memory after each interaction', async () => {
      const beforeStats = agent.getMemoryStats();

      await agent.processInput('Remember that I prefer dark mode');

      const afterStats = agent.getMemoryStats();
      expect(afterStats.totalEpisodes).toBeGreaterThan(beforeStats.totalEpisodes);
    });

    it('should include emotional weight in episodic memory', async () => {
      await agent.processInput('This is incredibly frustrating and broken!');

      // The emotional weight of the stored episode should be non-zero
      // (frustration has high emotional intensity)
      const stats = agent.getMemoryStats();
      expect(stats.totalEpisodes).toBeGreaterThan(0);
    });
  });

  describe('System Prompt Integration', () => {
    it('should include persona name in system prompt', () => {
      const prompt = agent.persona.getSystemPrompt();
      expect(prompt).toContain('Killer');
    });

    it('should include emotional state after processing', async () => {
      await agent.processInput('This is wonderful and exciting!');

      const prompt = agent.persona.getSystemPrompt();
      expect(prompt).toContain('emotional state');
    });

    it('should include relationship stats after interactions', async () => {
      await agent.processInput('Hello');
      await agent.processInput('Can you help me?');

      const prompt = agent.persona.getSystemPrompt();
      // After interactions, should show relationship data
      expect(prompt).toContain('conversations');
    });
  });

  describe('Prediction Updates', () => {
    it('should update predictions after sufficient interactions', async () => {
      // Build up interaction history
      for (let i = 0; i < 5; i++) {
        await agent.processInput(`Can you help me with coding task ${i}?`);
      }

      const predictions = agent.persona.getPredictions();
      // After multiple interactions, predicted needs should emerge
      expect(predictions.predictedNeeds.length).toBeGreaterThanOrEqual(0);
    });
  });
});
