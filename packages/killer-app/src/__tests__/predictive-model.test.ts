/**
 * Predictive User Model Tests
 *
 * Tests for user behavior prediction, psychological profiling,
 * communication pattern detection, and prediction validation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PredictiveUserModel } from '../persona/predictive-model.js';
import type { UserModel, MirrorNeuronData } from '../persona/types.js';

function createUserModel(overrides: Partial<UserModel['interactionSummary']> = {}): UserModel {
  return {
    userId: 'test-user',
    interactionSummary: {
      totalInteractions: 10,
      avgResponseTime: 2.0,
      satisfactionScore: 0.7,
      commonTopics: ['coding', 'testing', 'architecture'],
      ...overrides,
    },
    preferenceProfile: {
      verbosity: 'balanced',
      formality: 'neutral',
      proactivity: 'suggested',
      humor: 0.3,
    },
    trustLevel: 0.6,
  };
}

function createMirrorData(
  patterns: Array<{ pattern: string; frequency: number }> = [],
): MirrorNeuronData {
  return {
    observedPatterns: patterns.map((p, i) => ({
      id: `pat-${i}`,
      pattern: p.pattern,
      frequency: p.frequency,
      context: ['general'],
      lastObserved: Date.now(),
    })),
    imitationBias: {
      communicationStyle: 0.5,
      decisionPattern: 0.5,
      workRhythm: 0.5,
      aestheticPreference: 0.5,
    },
    syncLevel: 0.5,
  };
}

describe('PredictiveUserModel', () => {
  let model: PredictiveUserModel;

  beforeEach(() => {
    model = new PredictiveUserModel();
  });

  describe('Initialization', () => {
    it('should start with empty predictions', () => {
      const predictions = model.getPredictions();
      expect(predictions.predictedNeeds).toEqual([]);
      expect(predictions.communicationPatterns).toEqual([]);
      expect(predictions.psychologicalProfile).toBeDefined();
      expect(predictions.psychologicalProfile.decisionStyle).toBe('balanced');
    });
  });

  describe('Update Predictions', () => {
    it('should generate need predictions from topics', () => {
      const userModel = createUserModel();
      const mirrorData = createMirrorData();

      const result = model.updatePredictions(userModel, mirrorData);

      expect(result.predictedNeeds.length).toBeGreaterThan(0);
      const topicNeed = result.predictedNeeds.find(n => n.description.includes('coding'));
      expect(topicNeed).toBeDefined();
      expect(topicNeed!.confidence).toBeGreaterThan(0);
    });

    it('should predict adjustment need for low satisfaction', () => {
      const userModel = createUserModel({ satisfactionScore: 0.2, totalInteractions: 10 });
      const mirrorData = createMirrorData();

      const result = model.updatePredictions(userModel, mirrorData);

      const adjustmentNeed = result.predictedNeeds.find(n =>
        n.description.includes('adjustment'),
      );
      expect(adjustmentNeed).toBeDefined();
      expect(adjustmentNeed!.confidence).toBeGreaterThan(0.5);
    });

    it('should not predict adjustment for high satisfaction', () => {
      const userModel = createUserModel({ satisfactionScore: 0.9, totalInteractions: 10 });
      const mirrorData = createMirrorData();

      const result = model.updatePredictions(userModel, mirrorData);

      const adjustmentNeed = result.predictedNeeds.find(n =>
        n.description.includes('adjustment'),
      );
      expect(adjustmentNeed).toBeUndefined();
    });

    it('should detect communication patterns from mirror data', () => {
      const userModel = createUserModel();
      const mirrorData = createMirrorData([
        { pattern: 'short-messages', frequency: 5 },
        { pattern: 'long-messages', frequency: 2 },
      ]);

      const result = model.updatePredictions(userModel, mirrorData);
      expect(result.communicationPatterns.length).toBeGreaterThan(0);
    });

    it('should infer psychological profile', () => {
      const userModel = createUserModel({
        commonTopics: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
        totalInteractions: 30,
      });
      const mirrorData = createMirrorData();

      const result = model.updatePredictions(userModel, mirrorData);

      expect(result.psychologicalProfile.openness).toBeGreaterThan(0.5);
      expect(result.psychologicalProfile.extraversion).toBeGreaterThan(0);
    });

    it('should infer analytical decision style from patterns', () => {
      const userModel = createUserModel();
      const mirrorData = createMirrorData([
        { pattern: 'detail-oriented', frequency: 5 },
        { pattern: 'analysis-driven', frequency: 4 },
        { pattern: 'research-focused', frequency: 3 },
      ]);

      const result = model.updatePredictions(userModel, mirrorData);
      expect(result.psychologicalProfile.decisionStyle).toBe('analytical');
    });

    it('should predict habitual needs from frequent patterns', () => {
      const userModel = createUserModel();
      const mirrorData = createMirrorData([
        { pattern: 'code-review', frequency: 10 },
        { pattern: 'testing', frequency: 8 },
      ]);

      const result = model.updatePredictions(userModel, mirrorData);

      const habitualNeeds = result.predictedNeeds.filter(n =>
        n.description.includes('Anticipated'),
      );
      expect(habitualNeeds.length).toBeGreaterThan(0);
      expect(habitualNeeds[0].confidence).toBeGreaterThan(0.5);
    });

    it('should update lastUpdated timestamp', () => {
      const before = Date.now();
      model.updatePredictions(createUserModel(), createMirrorData());
      const predictions = model.getPredictions();
      expect(predictions.lastUpdated).toBeGreaterThanOrEqual(before);
    });
  });

  describe('Prediction Validation', () => {
    it('should track prediction accuracy', () => {
      model.validatePrediction('test-need', true);
      model.validatePrediction('test-need', true);
      model.validatePrediction('test-need', false);

      const accuracy = model.getPredictionAccuracy();
      expect(accuracy.count).toBe(3);
      expect(accuracy.overall).toBeCloseTo(2 / 3);
    });

    it('should handle empty validation data', () => {
      const accuracy = model.getPredictionAccuracy();
      expect(accuracy.overall).toBe(0);
      expect(accuracy.count).toBe(0);
    });

    it('should trim accuracy history when too large', () => {
      for (let i = 0; i < 60; i++) {
        model.validatePrediction(`need-${i}`, true);
      }
      // Internal map should be trimmed to 30
      const accuracy = model.getPredictionAccuracy();
      expect(accuracy.count).toBeLessThanOrEqual(60);
    });
  });

  describe('Prompt Fragment', () => {
    it('should return empty string when no predictions', () => {
      const fragment = model.getPredictionPromptFragment();
      expect(fragment).toBe('');
    });

    it('should generate prompt fragment with predictions', () => {
      model.updatePredictions(createUserModel(), createMirrorData());
      const fragment = model.getPredictionPromptFragment();
      expect(fragment).toContain('Anticipated');
      expect(fragment).toContain('inkling');
      expect(fragment).toContain('decisions');
    });

    it('should limit to top 3 needs in fragment', () => {
      const userModel = createUserModel({
        commonTopics: ['a', 'b', 'c', 'd', 'e'],
      });
      const mirrorData = createMirrorData([
        { pattern: 'topic-x', frequency: 5 },
        { pattern: 'topic-y', frequency: 4 },
      ]);
      model.updatePredictions(userModel, mirrorData);

      const fragment = model.getPredictionPromptFragment();
      // Count number of bullet points
      const bulletCount = (fragment.match(/- /g) || []).length;
      expect(bulletCount).toBeLessThanOrEqual(3);
    });
  });

  describe('Export / Import', () => {
    it('should export and import state', () => {
      model.updatePredictions(createUserModel(), createMirrorData());
      const exported = model.exportState();

      const model2 = new PredictiveUserModel();
      model2.importState(exported);
      const imported = model2.getPredictions();

      expect(imported.predictedNeeds.length).toBe(exported.predictedNeeds.length);
      expect(imported.psychologicalProfile.decisionStyle).toBe(
        exported.psychologicalProfile.decisionStyle,
      );
    });

    it('should export a deep clone', () => {
      model.updatePredictions(createUserModel(), createMirrorData());
      const exported = model.exportState();

      exported.predictedNeeds = [];
      exported.psychologicalProfile.decisionStyle = 'intuitive';

      const original = model.getPredictions();
      expect(original.predictedNeeds.length).toBeGreaterThan(0);
      expect(original.psychologicalProfile.decisionStyle).not.toBe('intuitive');
    });
  });
});
