/**
 * Emotional State Engine Tests
 *
 * Tests for the Russell circumplex model emotional state engine:
 * initialization, triggers, decay, export/import, prompt fragment
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EmotionalStateEngine } from '../persona/emotional-state.js';

describe('EmotionalStateEngine', () => {
  let engine: EmotionalStateEngine;

  beforeEach(() => {
    engine = new EmotionalStateEngine();
  });

  describe('Initialization', () => {
    it('should start with baseline emotional state', () => {
      const state = engine.getState();
      expect(state.primaryEmotion).toBe('trust');
      expect(state.intensity).toBe(0);
      expect(state.emotionalMemory).toEqual([]);
    });

    it('should accept custom profile', () => {
      const custom = new EmotionalStateEngine({ volatility: 0.8, recoveryRate: 0.1 });
      const profile = custom.getProfile();
      expect(profile.volatility).toBe(0.8);
      expect(profile.recoveryRate).toBe(0.1);
    });

    it('should initialize current vector from baseline', () => {
      const engine = new EmotionalStateEngine({
        baseline: { valence: 0.2, arousal: 0.1, dominance: 0.3 },
      });
      const state = engine.getState();
      expect(state.current.valence).toBeCloseTo(0.2);
      expect(state.current.arousal).toBeCloseTo(0.1);
      expect(state.current.dominance).toBeCloseTo(0.3);
    });
  });

  describe('Process Trigger', () => {
    it('should detect joy from positive words', () => {
      const result = engine.processTrigger('I am so happy and grateful!', 'user-message');
      expect(result.primaryEmotion).toBe('joy');
      expect(result.intensity).toBeGreaterThan(0);
      expect(result.current.valence).toBeGreaterThan(0);
    });

    it('should detect sadness from negative words', () => {
      const result = engine.processTrigger('I feel sad and disappointed', 'user-message');
      expect(result.primaryEmotion).toBe('sadness');
      expect(result.current.valence).toBeLessThan(0);
    });

    it('should detect anger from frustrated words', () => {
      const result = engine.processTrigger('I am angry and frustrated about this', 'user-message');
      expect(result.primaryEmotion).toBe('anger');
      expect(result.current.arousal).toBeGreaterThan(0);
    });

    it('should detect fear from worried words', () => {
      const result = engine.processTrigger('I am worried and anxious about this', 'user-message');
      expect(result.primaryEmotion).toBe('fear');
      expect(result.current.dominance).toBeLessThan(0);
    });

    it('should detect surprise from exclamation words', () => {
      const result = engine.processTrigger('Wow that was unexpected!', 'user-message');
      expect(result.primaryEmotion).toBe('surprise');
    });

    it('should detect anticipation from future words', () => {
      const result = engine.processTrigger('I am excited and looking forward to tomorrow', 'user-message');
      expect(result.primaryEmotion).toBe('anticipation');
    });

    it('should not change state for neutral text', () => {
      const before = engine.getState();
      const result = engine.processTrigger('the weather is cloudy', 'user-message');
      expect(result.primaryEmotion).toBe(before.primaryEmotion);
      expect(result.emotionalMemory.length).toBe(0);
    });

    it('should record emotional events in memory', () => {
      engine.processTrigger('I am happy', 'user-message');
      engine.processTrigger('This is terrible', 'user-message');

      const state = engine.getState();
      expect(state.emotionalMemory.length).toBe(2);
      expect(state.emotionalMemory[0].emotion).toBe('joy');
      expect(state.emotionalMemory[1].emotion).toBe('sadness');
    });

    it('should trim emotional memory to max size', () => {
      for (let i = 0; i < 60; i++) {
        engine.processTrigger(`happy trigger ${i}`, 'user-message');
      }
      const state = engine.getState();
      expect(state.emotionalMemory.length).toBeLessThanOrEqual(50);
    });

    it('should amplify emotion with mirror sync level', () => {
      const noMirror = new EmotionalStateEngine();
      noMirror.processTrigger('I am happy', 'user-message', 0);

      const withMirror = new EmotionalStateEngine();
      withMirror.processTrigger('I am happy', 'user-message', 1.0);

      // Higher mirror sync should produce stronger emotional response
      expect(withMirror.getState().intensity).toBeGreaterThanOrEqual(noMirror.getState().intensity);
    });

    it('should clamp vectors to [-1, 1] range', () => {
      // Repeatedly trigger extreme positive emotions
      for (let i = 0; i < 20; i++) {
        engine.processTrigger('happy awesome wonderful love excellent amazing', 'user-message');
      }
      const state = engine.getState();
      expect(state.current.valence).toBeLessThanOrEqual(1);
      expect(state.current.valence).toBeGreaterThanOrEqual(-1);
      expect(state.current.arousal).toBeLessThanOrEqual(1);
      expect(state.current.arousal).toBeGreaterThanOrEqual(-1);
    });
  });

  describe('Decay', () => {
    it('should decay emotion toward mood baseline', () => {
      engine.processTrigger('I am very happy and wonderful', 'user-message');
      const beforeValence = engine.getState().current.valence;

      engine.decay();
      const afterValence = engine.getState().current.valence;

      // Should have moved toward baseline
      expect(afterValence).toBeLessThan(beforeValence);
    });

    it('should reduce intensity with decay', () => {
      engine.processTrigger('This is awesome and amazing!', 'user-message');
      const beforeIntensity = engine.getState().intensity;

      engine.decay();
      expect(engine.getState().intensity).toBeLessThan(beforeIntensity);
    });

    it('should not reduce intensity below 0', () => {
      for (let i = 0; i < 100; i++) {
        engine.decay();
      }
      expect(engine.getState().intensity).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Prompt Fragment', () => {
    it('should generate emotional description for joy', () => {
      engine.processTrigger('I am so happy!', 'user-message');
      const fragment = engine.getEmotionalPromptFragment();
      expect(fragment).toContain('emotional state');
      expect(fragment).toContain('intensity');
      expect(fragment).toContain('mood');
    });

    it('should describe low intensity as subtle', () => {
      engine.processTrigger('great', 'user-message');
      const fragment = engine.getEmotionalPromptFragment();
      expect(fragment).toContain('slightly');
    });
  });

  describe('Export / Import', () => {
    it('should export and import state', () => {
      engine.processTrigger('I am happy and excited', 'user-message');
      const exported = engine.exportState();

      const engine2 = new EmotionalStateEngine();
      engine2.importState(exported);
      const imported = engine2.getState();

      expect(imported.primaryEmotion).toBe(exported.primaryEmotion);
      expect(imported.intensity).toBeCloseTo(exported.intensity);
      expect(imported.current.valence).toBeCloseTo(exported.current.valence);
      expect(imported.emotionalMemory.length).toBe(exported.emotionalMemory.length);
    });

    it('should export a deep clone', () => {
      engine.processTrigger('I am happy', 'user-message');
      const exported = engine.exportState();

      // Modify exported state
      exported.intensity = 0.99;
      exported.current.valence = -0.5;

      // Original should be unchanged
      const state = engine.getState();
      expect(state.intensity).not.toBe(0.99);
    });
  });

  describe('Reset', () => {
    it('should reset to initial state', () => {
      engine.processTrigger('I am furious and angry', 'user-message');
      expect(engine.getState().primaryEmotion).toBe('anger');

      engine.reset();
      const state = engine.getState();
      expect(state.primaryEmotion).toBe('trust');
      expect(state.intensity).toBe(0);
      expect(state.emotionalMemory).toEqual([]);
    });
  });
});
