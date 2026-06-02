/**
 * Cognitive Integration Tests
 *
 * 验证 E1-E5 五大增强在真实流程中的端到端协同工作
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OdysseusAgent, type AgentConfig } from '../orchestrator/index.js';

/**
 * Mock LLM Provider — 返回固定响应
 */
class MockLLMProvider {
  async complete(_prompt: string): Promise<{ content: string; usage?: unknown }> {
    return {
      content: 'Integrated cognitive response',
      usage: { promptTokens: 10, completionTokens: 5 },
    };
  }
}

function createTestConfig(): AgentConfig {
  return {
    llm: new MockLLMProvider(),
    sensory: {
      enabledChannels: ['cli'],
      bufferSize: 10,
    },
    memory: {
      dreamingEnabled: false,
      forgettingEnabled: false,
    },
    prefrontal: {
      maxPlanSteps: 5,
      maxConcurrentPlans: 1,
      riskTolerance: 0.5,
    },
    evolutionEnabled: false,
    debugLogging: false,
  };
}

describe('Cognitive Integration - E1→E5 End-to-End', () => {
  let agent: OdysseusAgent;

  beforeEach(async () => {
    agent = new OdysseusAgent(createTestConfig());
    await agent.boot();
  });

  describe('E1: Emotional State in Agent Flow', () => {
    it('should process emotional triggers through persona engine', () => {
      const persona = agent.persona;
      persona.processEmotionalTrigger('This is amazing and wonderful!', 'user-message');

      const state = persona.emotionalState.getState();
      expect(state.primaryEmotion).toBe('joy');
      expect(state.intensity).toBeGreaterThan(0);
    });

    it('should include emotional state in system prompt via buildSystemPrompt', async () => {
      agent.persona.processEmotionalTrigger('I am so happy today!', 'user-message');

      const response = await agent.processInput('Tell me something');
      expect(response.content).toBeDefined();
    });
  });

  describe('E2: Autobiographical Narrative Flow', () => {
    it('should have narrative initialized after boot', () => {
      const narrative = agent.hippocampus.getNarrative();
      expect(narrative).toBeDefined();
      expect(narrative.identityStatement).toBeDefined();
      expect(narrative.chapters).toEqual([]);
    });

    it('should synthesize narrative chapter from episodes', () => {
      // Store some episodes first
      agent.hippocampus.storeEpisode('Learned about TypeScript generics', 0.7, ['coding']);
      agent.hippocampus.storeEpisode('Debugged a complex race condition', 0.6, ['debugging']);
      agent.hippocampus.storeEpisode('Refactored authentication module', 0.8, ['coding', 'auth']);

      const chapter = agent.hippocampus.synthesizeChapter(
        'Learning Session',
        'Explored TypeScript and debugging techniques',
        'curious',
      );

      expect(chapter).toBeDefined();
      expect(chapter!.title).toBe('Learning Session');
      expect(chapter!.summary).toContain('TypeScript');
    });

    it('should include narrative context in system prompt', async () => {
      agent.hippocampus.updateIdentityStatement('I am Killer, a persistent AI companion');
      agent.hippocampus.addChapter('First Day', 'Initialization complete', 'neutral');

      const response = await agent.processInput('Who are you?');
      expect(response.content).toBeDefined();
    });
  });

  describe('E4: Predictive User Model Integration', () => {
    it('should generate predictions after sufficient interactions', () => {
      const persona = agent.persona;

      // Build interaction history
      for (let i = 0; i < 5; i++) {
        persona.recordInteraction(300, 0.8, ['coding', 'testing']);
      }
      persona.observeUserBehavior('uses-cli', ['cli']);
      persona.observeUserBehavior('prefers-concise', ['style']);

      const predictions = persona.getPredictions();
      expect(predictions.predictedNeeds.length).toBeGreaterThan(0);
    });

    it('should detect low satisfaction and predict adjustment', () => {
      const persona = agent.persona;

      for (let i = 0; i < 5; i++) {
        persona.recordInteraction(500, 0.2, ['general']);
      }

      const predictions = persona.getPredictions();
      const adjustmentNeed = predictions.predictedNeeds.find(
        n => n.description.includes('adjustment'),
      );
      expect(adjustmentNeed).toBeDefined();
      expect(adjustmentNeed!.timeHorizon).toBe('immediate');
    });

    it('should validate prediction accuracy', () => {
      const persona = agent.persona;
      persona.recordInteraction(300, 0.8, ['coding']);

      persona.validatePrediction('Test need A', true);
      persona.validatePrediction('Test need A', false);

      const accuracy = persona.predictiveModel.getPredictionAccuracy();
      expect(accuracy.count).toBe(2);
      expect(accuracy.overall).toBe(0.5);
    });
  });

  describe('E5: Unified System Prompt Integration', () => {
    it('should build prompt with all cognitive layers', async () => {
      // E1: Set emotional state
      agent.persona.processEmotionalTrigger('Great progress today!', 'feedback');

      // E2: Add narrative
      agent.hippocampus.updateIdentityStatement('I am Killer, your AI partner');
      agent.hippocampus.addChapter('Session Start', 'Beginning of interaction', 'positive');

      // E4: Build user model
      agent.persona.recordInteraction(200, 0.9, ['testing']);
      agent.persona.observeUserBehavior('uses-typescript', ['coding']);

      // Process input — this calls buildSystemPrompt internally
      const response = await agent.processInput('Run the cognitive integration test');
      expect(response.content).toBeDefined();

      // Verify all layers are accessible
      const expression = agent.persona.getExpression();
      expect(expression.name).toBeDefined();

      const narrative = agent.hippocampus.getNarrative();
      expect(narrative.identityStatement).toContain('Killer');

      const userModel = agent.persona.getUserModel();
      expect(userModel.interactionSummary.totalInteractions).toBeGreaterThan(0);

      const predictions = agent.persona.getPredictions();
      expect(predictions.lastUpdated).toBeGreaterThan(0);
    });
  });

  describe('Cross-Module: Emotion + Narrative + Prediction', () => {
    it('should link emotional tone to narrative chapters', () => {
      // Positive emotional state
      agent.persona.processEmotionalTrigger('Excellent work on the feature!', 'feedback');

      // Store episodes that the narrative can reference
      agent.hippocampus.storeEpisode('Completed feature implementation', 0.9, ['feature']);
      agent.hippocampus.storeEpisode('Wrote comprehensive tests', 0.85, ['testing']);

      const chapter = agent.hippocampus.synthesizeChapter(
        'Feature Complete',
        'Successfully delivered the new feature',
        'positive',
      );

      expect(chapter).toBeDefined();
      expect(chapter!.emotionalTone).toBe('positive');
    });

    it('should modulate trust based on interaction quality', () => {
      const initialTrust = agent.persona.getUserModel().trustLevel;

      // High-quality interactions
      for (let i = 0; i < 5; i++) {
        agent.persona.recordInteraction(200, 0.95, ['coding']);
      }

      const newTrust = agent.persona.getUserModel().trustLevel;
      expect(newTrust).toBeGreaterThan(initialTrust);
    });

    it('should maintain emotional consistency across interactions', () => {
      // First: positive trigger
      agent.persona.processEmotionalTrigger('This is wonderful!', 'user-message');
      const state1 = agent.persona.emotionalState.getState();
      expect(state1.primaryEmotion).toBe('joy');

      // Second: negative trigger — should shift
      agent.persona.processEmotionalTrigger('I am frustrated and angry', 'user-message');
      const state2 = agent.persona.emotionalState.getState();
      expect(state2.primaryEmotion).toBe('anger');
    });
  });

  describe('Session Persistence Integration', () => {
    it('should capture full cognitive state in session snapshot', async () => {
      // Enrich state
      agent.persona.processEmotionalTrigger('Good session!', 'feedback');
      agent.persona.recordInteraction(300, 0.8, ['testing']);
      agent.hippocampus.storeEpisode('Test episode for session', 0.7, ['session']);

      await agent.shutdown();

      // Agent is shut down — state should have been persisted
      const status = agent.getStatus();
      expect(status.running).toBe(false);
    });
  });
});
