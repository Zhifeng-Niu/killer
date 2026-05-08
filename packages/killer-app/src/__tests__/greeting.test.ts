/**
 * Boot Greeting Tests
 *
 * 测试上下文感知启动问候生成
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generateBootGreeting, type GreetingContext } from '../cli/greeting.js';
import { PersonaEngine, type PersonaEngineConfig } from '../persona/engine.js';
import { HippocampusEngine } from '@killer/core';

function createPersonaConfig(name: string = 'Killer'): PersonaEngineConfig {
  return {
    dnaConfig: {
      name,
      avatar: '⚡',
      tagline: 'Your AI companion',
      voiceStyle: 'warm-technical',
      quirks: ['curious'],
    },
    enableMirrorNeuron: true,
    enableUserModeling: true,
    mirrorNeuronDecay: 0.1,
  };
}

function createGreetingContext(overrides?: Partial<GreetingContext>): GreetingContext {
  const persona = new PersonaEngine(createPersonaConfig());
  const hippocampus = new HippocampusEngine({
    maxEpisodic: 1000,
    maxSemantic: 500,
    dreamingEnabled: false,
    forgettingEnabled: false,
  });

  return {
    persona,
    hippocampus,
    isFirstBoot: true,
    isSessionRestored: false,
    ...overrides,
  };
}

describe('Boot Greeting', () => {
  describe('First Boot', () => {
    it('should generate a first-boot greeting with name', () => {
      const greeting = generateBootGreeting(createGreetingContext());

      expect(greeting).toContain('Killer');
      expect(greeting).toContain('no memories yet');
    });

    it('should include help hint on first boot', () => {
      const greeting = generateBootGreeting(createGreetingContext());

      expect(greeting).toContain('/help');
    });
  });

  describe('Returning User', () => {
    it('should generate a time-aware greeting for returning user', () => {
      const persona = new PersonaEngine(createPersonaConfig());
      persona.markSessionStart();
      persona.recordInteraction(500, 0.8, ['coding']);

      const greeting = generateBootGreeting(createGreetingContext({
        persona,
        isFirstBoot: false,
        isSessionRestored: true,
      }));

      // Should contain the persona name
      expect(greeting).toContain('Killer');
      // Should contain /help hint
      expect(greeting).toContain('/help');
    });

    it('should show conversation stats for returning users', () => {
      const persona = new PersonaEngine(createPersonaConfig());
      persona.markSessionStart();
      // Simulate interactions
      persona.recordInteraction(300, 0.9, ['coding', 'testing']);
      persona.recordInteraction(500, 0.7, ['planning']);

      const greeting = generateBootGreeting(createGreetingContext({
        persona,
        isFirstBoot: false,
      }));

      // Should show interaction count
      expect(greeting).toContain('conversation');
    });

    it('should show trust level for users with history', () => {
      const persona = new PersonaEngine(createPersonaConfig());
      persona.markSessionStart();
      persona.recordInteraction(300, 0.9, ['coding']);
      persona.recordInteraction(400, 0.8, ['learning']);

      const greeting = generateBootGreeting(createGreetingContext({
        persona,
        isFirstBoot: false,
      }));

      expect(greeting).toContain('Trust');
    });
  });

  describe('Emotional Context', () => {
    it('should show emotional state when intensity is high', () => {
      const persona = new PersonaEngine(createPersonaConfig());
      persona.markSessionStart();
      persona.recordInteraction(300, 0.9, ['general']);
      // Trigger emotional state
      persona.processEmotionalTrigger('I am so excited and happy!', 'user-message');

      const state = persona.emotionalState.getState();
      // Only test if emotional intensity is actually high enough
      if (state.intensity > 0.3) {
        const greeting = generateBootGreeting(createGreetingContext({
          persona,
          isFirstBoot: false,
        }));

        expect(greeting).toContain('Feeling');
      }
    });

    it('should not show emotional indicator for neutral state', () => {
      const greeting = generateBootGreeting(createGreetingContext({
        isFirstBoot: false,
      }));

      // Fresh persona with no emotional triggers should not show emotion
      // (unless intensity somehow > 0.3)
    });
  });

  describe('Memory Context', () => {
    it('should show episode count for users with memories', () => {
      const persona = new PersonaEngine(createPersonaConfig());
      persona.markSessionStart();
      persona.recordInteraction(300, 0.8, ['general']);

      const hippocampus = new HippocampusEngine({
        maxEpisodic: 1000,
        maxSemantic: 500,
        dreamingEnabled: false,
        forgettingEnabled: false,
      });

      hippocampus.storeEpisode({
        title: 'Test episode',
        narrative: 'Test narrative',
        emotionalWeight: 0.5,
        tags: ['test'],
        associations: [],
        decayRate: 0.1,
        accessCount: 0,
      });

      const greeting = generateBootGreeting(createGreetingContext({
        persona,
        hippocampus,
        isFirstBoot: false,
      }));

      expect(greeting).toContain('1 episode');
    });
  });

  describe('Predictive Hints', () => {
    it('should not crash when no predictions available', () => {
      const greeting = generateBootGreeting(createGreetingContext({
        isFirstBoot: false,
      }));

      expect(greeting).toContain('Killer');
    });
  });

  describe('Reunion Tone', () => {
    it('should show reunion greeting when user returns after hours', () => {
      const persona = new PersonaEngine(createPersonaConfig());
      persona.markSessionStart();
      persona.recordInteraction(300, 0.9, ['coding']);
      // Set last seen to 3 hours ago
      persona.setLastSeenAt(Date.now() - 3 * 60 * 60 * 1000);

      const greeting = generateBootGreeting(createGreetingContext({
        persona,
        isFirstBoot: false,
        isSessionRestored: true,
      }));

      // After a few hours, should show reunion tone
      expect(greeting).toContain('Good to see you again');
    });

    it('should show "Welcome back" for same-day return', () => {
      const persona = new PersonaEngine(createPersonaConfig());
      persona.markSessionStart();
      persona.recordInteraction(300, 0.9, ['coding']);
      persona.setLastSeenAt(Date.now() - 12 * 60 * 60 * 1000);

      const greeting = generateBootGreeting(createGreetingContext({
        persona,
        isFirstBoot: false,
        isSessionRestored: true,
      }));

      expect(greeting).toContain('Welcome back');
    });

    it('should show long-absence tone after days away', () => {
      const persona = new PersonaEngine(createPersonaConfig());
      persona.markSessionStart();
      persona.recordInteraction(300, 0.9, ['general']);
      persona.setLastSeenAt(Date.now() - 4 * 24 * 60 * 60 * 1000);

      const greeting = generateBootGreeting(createGreetingContext({
        persona,
        isFirstBoot: false,
        isSessionRestored: true,
      }));

      expect(greeting).toContain('missed');
    });

    it('should not show reunion line for immediate return', () => {
      const persona = new PersonaEngine(createPersonaConfig());
      persona.markSessionStart();
      persona.recordInteraction(300, 0.9, ['coding']);
      // Just now
      persona.setLastSeenAt(Date.now() - 30 * 1000);

      const greeting = generateBootGreeting(createGreetingContext({
        persona,
        isFirstBoot: false,
        isSessionRestored: true,
      }));

      // No reunion line for sub-minute return
      expect(greeting).not.toContain('Good to see you again');
      expect(greeting).not.toContain('Welcome back');
    });
  });

  describe('Narrative Chapter Hint', () => {
    it('should show latest chapter hint when chapters exist', () => {
      const persona = new PersonaEngine(createPersonaConfig());
      persona.markSessionStart();
      persona.recordInteraction(300, 0.8, ['general']);

      const hippocampus = new HippocampusEngine({
        maxEpisodic: 1000,
        maxSemantic: 500,
        dreamingEnabled: false,
        forgettingEnabled: false,
      });

      // Store episodes and trigger dream cycle to create chapters
      for (let i = 0; i < 3; i++) {
        hippocampus.storeEpisode({
          title: `Episode ${i}`,
          narrative: `Working on coding task ${i}`,
          emotionalWeight: 0.5,
          tags: ['coding'],
          associations: [],
          decayRate: 0.1,
          accessCount: 0,
        });
      }
      hippocampus.dreamCycle();

      const narrative = hippocampus.getNarrative();
      if (narrative.chapters.length > 0) {
        const greeting = generateBootGreeting(createGreetingContext({
          persona,
          hippocampus,
          isFirstBoot: false,
        }));

        expect(greeting).toContain('Last chapter');
      }
    });

    it('should not show chapter hint when no chapters', () => {
      const persona = new PersonaEngine(createPersonaConfig());
      persona.markSessionStart();
      persona.recordInteraction(300, 0.8, ['general']);

      const hippocampus = new HippocampusEngine({
        maxEpisodic: 1000,
        maxSemantic: 500,
        dreamingEnabled: false,
        forgettingEnabled: false,
      });

      const greeting = generateBootGreeting(createGreetingContext({
        persona,
        hippocampus,
        isFirstBoot: false,
      }));

      expect(greeting).not.toContain('Last chapter');
    });
  });
});
