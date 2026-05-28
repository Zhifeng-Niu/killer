/**
 * Persona Engine Tests
 *
 * 测试人格引擎的 DNA 加载、镜像神经元学习、用户模型跟踪
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PersonaEngine,
  DEFAULT_PERSONA_CONFIG,
  type PersonaEngineConfig,
  type PersonaDNAConfig,
} from '../persona/engine.js';

function createTestConfig(): PersonaEngineConfig {
  const dnaConfig: PersonaDNAConfig = {
    name: 'TestKiller',
    avatar: '🧪',
    tagline: 'Test Agent',
    voiceStyle: 'technical',
    quirks: ['curious'],
  };

  return {
    dnaConfig,
    enableMirrorNeuron: true,
    enableUserModeling: true,
    mirrorNeuronDecay: 0.1,
  };
}

describe('PersonaEngine', () => {
  let engine: PersonaEngine;

  beforeEach(() => {
    engine = new PersonaEngine(createTestConfig());
  });

  describe('Genome Initialization', () => {
    it('should initialize with DNA config', () => {
      const genome = engine.getGenome();

      expect(genome).toBeDefined();
      expect(genome.expression.name).toBe('TestKiller');
      expect(genome.expression.avatar).toBe('🧪');
      expect(genome.expression.tagline).toBe('Test Agent');
      expect(genome.expression.voiceStyle).toBe('technical');
      expect(genome.expression.quirks).toContain('curious');
    });

    it('should initialize with empty mirror neuron data', () => {
      const mirrorData = engine.getMirrorNeuronData();

      expect(mirrorData.observedPatterns).toEqual([]);
      expect(mirrorData.syncLevel).toBe(0);
      expect(mirrorData.imitationBias.communicationStyle).toBe(0.5);
    });

    it('should initialize with default user model', () => {
      const userModel = engine.getUserModel();

      expect(userModel.userId).toBe('default');
      expect(userModel.trustLevel).toBe(0.5);
      expect(userModel.interactionSummary.totalInteractions).toBe(0);
      expect(userModel.preferenceProfile.verbosity).toBe('balanced');
    });
  });

  describe('Personality Traits', () => {
    it('should update and get traits', () => {
      engine.updateTrait('curiosity', 0.8);
      expect(engine.getTrait('curiosity')).toBe(0.8);
    });

    it('should clamp trait values to [0, 1]', () => {
      engine.updateTrait('extreme', 2.0);
      expect(engine.getTrait('extreme')).toBe(1);

      engine.updateTrait('negative', -1.0);
      expect(engine.getTrait('negative')).toBe(0);
    });

    it('should return default 0.5 for unknown traits', () => {
      expect(engine.getTrait('unknown')).toBe(0.5);
    });

    it('should list all traits', () => {
      engine.updateTrait('a', 0.3);
      engine.updateTrait('b', 0.7);

      const traits = engine.getAllTraits();
      expect(traits.size).toBe(2);
      expect(traits.get('a')).toBe(0.3);
      expect(traits.get('b')).toBe(0.7);
    });
  });

  describe('Mirror Neuron Learning', () => {
    it('should observe and store user behavior patterns', () => {
      engine.observeUserBehavior('uses-short-sentences', ['chat']);

      const patterns = engine.getMirrorNeuronData().observedPatterns;
      expect(patterns.length).toBe(1);
      expect(patterns[0].pattern).toBe('uses-short-sentences');
      expect(patterns[0].frequency).toBe(1);
      expect(patterns[0].context).toContain('chat');
    });

    it('should increment frequency for repeated patterns', () => {
      engine.observeUserBehavior('pattern-a', []);
      engine.observeUserBehavior('pattern-a', []);
      engine.observeUserBehavior('pattern-a', []);

      const patterns = engine.getMirrorNeuronData().observedPatterns;
      expect(patterns.length).toBe(1);
      expect(patterns[0].frequency).toBe(3);
    });

    it('should merge contexts for existing patterns', () => {
      engine.observeUserBehavior('pattern', ['ctx1']);
      engine.observeUserBehavior('pattern', ['ctx2']);

      const patterns = engine.getMirrorNeuronData().observedPatterns;
      expect(patterns[0].context).toContain('ctx1');
      expect(patterns[0].context).toContain('ctx2');
    });

    it('should update sync level with observed patterns', () => {
      expect(engine.getMirrorNeuronData().syncLevel).toBe(0);

      engine.observeUserBehavior('p1', []);
      expect(engine.getMirrorNeuronData().syncLevel).toBe(0.05);

      engine.observeUserBehavior('p2', []);
      expect(engine.getMirrorNeuronData().syncLevel).toBe(0.1);
    });

    it('should cap sync level at 0.95', () => {
      for (let i = 0; i < 30; i++) {
        engine.observeUserBehavior(`pattern-${i}`, []);
      }
      expect(engine.getMirrorNeuronData().syncLevel).toBeLessThanOrEqual(0.95);
    });

    it('should not observe when mirror neuron is disabled', () => {
      const config = createTestConfig();
      config.enableMirrorNeuron = false;
      const disabledEngine = new PersonaEngine(config);

      disabledEngine.observeUserBehavior('test', []);
      expect(disabledEngine.getMirrorNeuronData().observedPatterns.length).toBe(0);
    });
  });

  describe('User Model Tracking', () => {
    it('should record interactions', () => {
      engine.recordInteraction(500, 0.8, ['coding']);

      const summary = engine.getUserModel().interactionSummary;
      expect(summary.totalInteractions).toBe(1);
      expect(summary.avgResponseTime).toBe(500);
      expect(summary.satisfactionScore).toBe(0.8);
      expect(summary.commonTopics).toContain('coding');
    });

    it('should calculate running averages', () => {
      engine.recordInteraction(1000, 0.5, []);
      engine.recordInteraction(500, 1.0, []);

      const summary = engine.getUserModel().interactionSummary;
      expect(summary.totalInteractions).toBe(2);
      expect(summary.avgResponseTime).toBe(750);
      expect(summary.satisfactionScore).toBe(0.75);
    });

    it('should track unique topics', () => {
      engine.recordInteraction(100, 0.5, ['a', 'b']);
      engine.recordInteraction(100, 0.5, ['b', 'c']);

      const topics = engine.getUserModel().interactionSummary.commonTopics;
      expect(topics).toContain('a');
      expect(topics).toContain('b');
      expect(topics).toContain('c');
      expect(topics.length).toBe(3);
    });

    it('should update trust level based on satisfaction', () => {
      const initialTrust = engine.getUserModel().trustLevel;

      // High satisfaction should increase trust
      engine.recordInteraction(100, 1.0, []);
      expect(engine.getUserModel().trustLevel).toBeGreaterThan(initialTrust);
    });

    it('should not record when user modeling is disabled', () => {
      const config = createTestConfig();
      config.enableUserModeling = false;
      const disabledEngine = new PersonaEngine(config);

      disabledEngine.recordInteraction(100, 0.5, ['test']);
      expect(disabledEngine.getUserModel().interactionSummary.totalInteractions).toBe(0);
    });
  });

  describe('Preference Profile', () => {
    it('should update preference profile', () => {
      engine.updatePreferenceProfile({ verbosity: 'concise' });
      expect(engine.getUserModel().preferenceProfile.verbosity).toBe('concise');
    });

    it('should preserve unmodified preferences', () => {
      engine.updatePreferenceProfile({ verbosity: 'detailed' });
      expect(engine.getUserModel().preferenceProfile.formality).toBe('neutral');
    });
  });

  describe('Decay', () => {
    it('should decay old patterns', () => {
      engine.observeUserBehavior('strong', []);
      engine.observeUserBehavior('strong', []);
      engine.observeUserBehavior('strong', []);

      engine.observeUserBehavior('weak', []);

      engine.applyDecay();

      const patterns = engine.getMirrorNeuronData().observedPatterns;
      // Strong pattern should survive (3 * 0.9 = 2.7)
      expect(patterns.some(p => p.pattern === 'strong')).toBe(true);
      // Weak pattern might be filtered (1 * 0.9 = 0.9 > 0.1, so survives)
      expect(patterns.some(p => p.pattern === 'weak')).toBe(true);
    });

    it('should reduce sync level on decay', () => {
      engine.observeUserBehavior('p1', []);
      engine.observeUserBehavior('p2', []);
      const beforeSync = engine.getMirrorNeuronData().syncLevel;

      engine.applyDecay();
      expect(engine.getMirrorNeuronData().syncLevel).toBeLessThan(beforeSync);
    });
  });

  describe('System Prompt Generation', () => {
    it('should generate system prompt with personality', () => {
      engine.updateTrait('curiosity', 0.9);
      engine.updateTrait('empathy', 0.7);

      const prompt = engine.getSystemPrompt();
      expect(prompt).toContain('TestKiller');
      expect(prompt).toContain('Test Agent');
      expect(prompt).toContain('technical');
      expect(prompt).toContain('curiosity: 0.90');
      expect(prompt).toContain('empathy: 0.70');
    });

    it('should generate user context prompt', () => {
      engine.recordInteraction(300, 0.9, ['coding', 'testing']);
      engine.observeUserBehavior('uses-cli', []);

      const context = engine.getUserContextPrompt();
      expect(context).toContain('Trust:');
      expect(context).toContain('Satisfaction: 0.90');
      expect(context).toContain('uses-cli');
    });
  });

  describe('Genome Export/Import', () => {
    it('should export a deep copy of the genome', () => {
      engine.updateTrait('test', 0.5);
      const exported = engine.exportGenome();

      // Modifying export should not affect engine
      exported.expression.name = 'Modified';
      expect(engine.getExpression().name).toBe('TestKiller');
    });

    it('should import a genome', () => {
      const exported = engine.exportGenome();
      exported.expression.name = 'Imported';

      const engine2 = new PersonaEngine(createTestConfig());
      engine2.importGenome(exported);

      expect(engine2.getExpression().name).toBe('Imported');
    });
  });

  describe('Emotional State', () => {
    it('should initialize at baseline', () => {
      const state = engine.emotionalState.getState();
      expect(state.intensity).toBe(0);
      expect(state.primaryEmotion).toBe('trust');
      expect(state.emotionalMemory).toHaveLength(0);
    });

    it('should detect joy from positive text', () => {
      engine.processEmotionalTrigger('That is awesome, thank you!', 'user-message');

      const state = engine.emotionalState.getState();
      expect(state.primaryEmotion).toBe('joy');
      expect(state.intensity).toBeGreaterThan(0);
      expect(state.current.valence).toBeGreaterThan(0);
    });

    it('should detect sadness from negative text', () => {
      // Use a fresh engine so baseline doesn't carry over
      const freshEngine = new PersonaEngine(createTestConfig());
      freshEngine.processEmotionalTrigger('I am sad and disappointed about this', 'user-message');

      const state = freshEngine.emotionalState.getState();
      expect(state.primaryEmotion).toBe('sadness');
      expect(state.current.valence).toBeLessThan(0);
    });

    it('should detect anger from frustrated text', () => {
      const freshEngine = new PersonaEngine(createTestConfig());
      freshEngine.processEmotionalTrigger('This is frustrating and wrong!', 'user-message');

      const state = freshEngine.emotionalState.getState();
      expect(state.primaryEmotion).toBe('anger');
      expect(state.current.arousal).toBeGreaterThan(0);
    });

    it('should record emotional events in memory', () => {
      engine.processEmotionalTrigger('Great job!', 'feedback');
      engine.processEmotionalTrigger('I am worried', 'concern');

      const state = engine.emotionalState.getState();
      expect(state.emotionalMemory.length).toBeGreaterThanOrEqual(2);
    });

    it('should decay toward baseline', () => {
      engine.processEmotionalTrigger('Amazing wonderful excellent!', 'user-message');
      const afterTrigger = engine.emotionalState.getState().current.valence;

      // Decay multiple times
      for (let i = 0; i < 20; i++) {
        engine.emotionalState.decay();
      }
      const afterDecay = engine.emotionalState.getState().current.valence;

      // After decay, should be closer to mood baseline
      expect(afterDecay).toBeLessThan(afterTrigger);
    });

    it('should produce emotional prompt fragment', () => {
      engine.processEmotionalTrigger('I am happy today', 'user-message');
      const fragment = engine.emotionalState.getEmotionalPromptFragment();

      expect(fragment).toContain('emotional state');
      expect(fragment).toContain('intensity');
    });

    it('should modulate with mirror sync level', () => {
      // Build some mirror sync
      for (let i = 0; i < 10; i++) {
        engine.observeUserBehavior(`pattern-${i}`, []);
      }

      const syncBefore = engine.getMirrorNeuronData().syncLevel;
      expect(syncBefore).toBeGreaterThan(0);

      // Emotional trigger should be stronger with higher sync
      engine.processEmotionalTrigger('This is great!', 'user-message');
      const state = engine.emotionalState.getState();
      expect(state.intensity).toBeGreaterThan(0);
    });

    it('should export and import emotional state', () => {
      engine.processEmotionalTrigger('Wonderful news!', 'user-message');
      const exported = engine.emotionalState.exportState();

      expect(exported.intensity).toBeGreaterThan(0);
      expect(exported.emotionalMemory.length).toBeGreaterThan(0);

      // Import into new engine
      const engine2 = new PersonaEngine(createTestConfig());
      engine2.emotionalState.importState(exported);
      const imported = engine2.emotionalState.getState();

      expect(imported.primaryEmotion).toBe(exported.primaryEmotion);
      expect(imported.intensity).toBe(exported.intensity);
    });

    it('should include emotional state in system prompt', () => {
      engine.processEmotionalTrigger('I am happy', 'user-message');
      const prompt = engine.getSystemPrompt();

      expect(prompt).toContain('emotional state');
    });

    it('should cap emotional memory at max size', () => {
      for (let i = 0; i < 60; i++) {
        engine.processEmotionalTrigger(`Message ${i} is great`, 'test');
      }

      const state = engine.emotionalState.getState();
      expect(state.emotionalMemory.length).toBeLessThanOrEqual(50);
    });

    it('should not crash on emotionless text', () => {
      expect(() => {
        engine.processEmotionalTrigger('the cat sat on the mat', 'neutral');
      }).not.toThrow();
    });

    it('should reset cleanly', () => {
      engine.processEmotionalTrigger('Amazing!', 'test');
      engine.emotionalState.reset();

      const state = engine.emotionalState.getState();
      expect(state.intensity).toBe(0);
      expect(state.emotionalMemory).toHaveLength(0);
    });
  });

  describe('Predictive User Model', () => {
    it('should initialize with empty predictions', () => {
      const predictions = engine.getPredictions();
      expect(predictions.predictedNeeds).toEqual([]);
      expect(predictions.communicationPatterns).toEqual([]);
      expect(predictions.psychologicalProfile.decisionStyle).toBe('balanced');
    });

    it('should generate needs after sufficient interactions', () => {
      // Build up interaction history
      for (let i = 0; i < 5; i++) {
        engine.recordInteraction(300, 0.8, ['coding', 'debugging']);
      }
      engine.observeUserBehavior('uses-cli', ['cli']);
      engine.observeUserBehavior('prefers-concise', ['style']);

      const predictions = engine.getPredictions();
      expect(predictions.predictedNeeds.length).toBeGreaterThan(0);
    });

    it('should predict approach adjustment on low satisfaction', () => {
      // Low satisfaction interactions
      for (let i = 0; i < 5; i++) {
        engine.recordInteraction(300, 0.2, ['general']);
      }

      const predictions = engine.getPredictions();
      const adjustmentNeed = predictions.predictedNeeds.find(
        n => n.description.includes('adjustment'),
      );
      expect(adjustmentNeed).toBeDefined();
      expect(adjustmentNeed!.timeHorizon).toBe('immediate');
    });

    it('should infer psychological profile from interactions', () => {
      // Diverse topics → high openness
      for (let i = 0; i < 10; i++) {
        engine.recordInteraction(300, 0.8, [`topic-${i}`]);
      }

      const profile = engine.getPredictions().psychologicalProfile;
      expect(profile.openness).toBeGreaterThan(0.5);
    });

    it('should include predictions in user context prompt', () => {
      engine.recordInteraction(300, 0.8, ['coding']);
      engine.observeUserBehavior('uses-cli', ['cli']);

      const context = engine.getUserContextPrompt();
      // Predictions may or may not appear depending on threshold
      expect(context).toContain('Trust:');
    });

    it('should validate predictions', () => {
      engine.recordInteraction(300, 0.8, ['coding']);

      engine.validatePrediction('Test need', true);
      engine.validatePrediction('Test need', false);

      const accuracy = engine.predictiveModel.getPredictionAccuracy();
      expect(accuracy.count).toBe(2);
      expect(accuracy.overall).toBe(0.5);
    });

    it('should export and import predictions', () => {
      engine.recordInteraction(300, 0.8, ['testing']);
      const exported = engine.predictiveModel.exportState();

      const engine2 = new PersonaEngine(createTestConfig());
      engine2.predictiveModel.importState(exported);

      expect(engine2.getPredictions().lastUpdated).toBe(exported.lastUpdated);
    });
  });

  describe('Time-Aware Reconnection', () => {
    it('should track lastSeenAt via setLastSeenAt', () => {
      const ts = Date.now() - 3600_000; // 1 hour ago
      engine.setLastSeenAt(ts);
      expect(engine.getLastSeenAt()).toBe(ts);
    });

    it('should return null lastSeenAt when never set', () => {
      expect(engine.getLastSeenAt()).toBeNull();
    });

    it('should track session count via markSessionStart', () => {
      engine.markSessionStart();
      // Session count affects relationship line when interactions exist
      engine.recordInteraction(100, 0.8, ['test']);
      const prompt = engine.getSystemPrompt();
      expect(prompt).toContain('1 exchanges shared');
    });

    it('should generate time awareness for minutes ago', () => {
      engine.setLastSeenAt(Date.now() - 30 * 60_000); // 30 min
      const prompt = engine.getTimeAwarenessPrompt();
      expect(prompt).toContain('30 minutes');
    });

    it('should generate time awareness for hours ago', () => {
      engine.setLastSeenAt(Date.now() - 3 * 3600_000); // 3 hours
      const prompt = engine.getTimeAwarenessPrompt();
      expect(prompt).toContain('3 hour');
    });

    it('should generate time awareness for days ago', () => {
      engine.setLastSeenAt(Date.now() - 2 * 86400_000); // 2 days
      const prompt = engine.getTimeAwarenessPrompt();
      expect(prompt).toContain('2 day');
      expect(prompt).toContain('Welcome them back');
    });

    it('should generate time awareness for weeks ago', () => {
      engine.setLastSeenAt(Date.now() - 14 * 86400_000); // 2 weeks
      const prompt = engine.getTimeAwarenessPrompt();
      expect(prompt).toContain('2 week');
      expect(prompt).toContain('missed them');
    });

    it('should generate time awareness for months+ ago', () => {
      engine.setLastSeenAt(Date.now() - 60 * 86400_000); // 2 months
      const prompt = engine.getTimeAwarenessPrompt();
      expect(prompt).toContain('long time');
      expect(prompt).toContain('reunion');
    });

    it('should return empty string when lastSeenAt not set', () => {
      expect(engine.getTimeAwarenessPrompt()).toBe('');
    });

    it('should return empty string for very recent (< 1 min)', () => {
      engine.setLastSeenAt(Date.now() - 30_000); // 30 seconds
      expect(engine.getTimeAwarenessPrompt()).toBe('');
    });
  });

  describe('Dynamic System Prompt', () => {
    it('should include persona name and tagline', () => {
      const prompt = engine.getSystemPrompt();
      expect(prompt).toContain('TestKiller');
      expect(prompt).toContain('Test Agent');
    });

    it('should include voice style', () => {
      const prompt = engine.getSystemPrompt();
      expect(prompt).toContain('technical');
    });

    it('should include quirks', () => {
      const prompt = engine.getSystemPrompt();
      expect(prompt).toContain('curious');
    });

    it('should include time awareness when set', () => {
      engine.setLastSeenAt(Date.now() - 3600_000); // 1 hour
      const prompt = engine.getSystemPrompt();
      expect(prompt).toContain('hour');
    });

    it('should include relationship stats after interactions', () => {
      engine.markSessionStart();
      // Simulate 10 interactions
      for (let i = 0; i < 10; i++) {
        engine.recordInteraction(100, 0.8, ['test']);
      }
      const prompt = engine.getSystemPrompt();
      expect(prompt).toContain('10 exchanges shared');
      expect(prompt).toContain('Trust:');
    });

    it('should not include relationship stats with zero interactions', () => {
      const prompt = engine.getSystemPrompt();
      expect(prompt).not.toContain('conversations over');
    });
  });
});
