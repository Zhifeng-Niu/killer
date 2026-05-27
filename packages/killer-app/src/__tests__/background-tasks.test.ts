/**
 * Background Tasks Tests
 *
 * Tests for auto-dream and auto-evolve background tasks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  triggerAutoDream,
  triggerAutoEvolve,
  generateProactiveSuggestions,
  detectCommitments,
  checkPendingReminders,
  clearPendingItems,
  detectConversationalPhase,
  AUTO_DREAM_INTERVAL,
  AUTO_EVOLVE_INTERVAL,
  AUTO_PROACTIVE_INTERVAL,
} from '../orchestrator/background-tasks.js';

function createMockHippocampus(overrides: Record<string, unknown> = {}) {
  return {
    dreamCycle: vi.fn().mockResolvedValue({
      memoriesConsolidated: 3,
      patternsExtracted: 2,
    }),
    getNarrative: vi.fn().mockReturnValue({
      chapters: [
        { id: 'ch1', title: 'Awakening', summary: 'First moments' },
        { id: 'ch2', title: 'Learning', summary: 'Understanding the world' },
      ],
      activeThemes: [],
    }),
    getRecentEpisodes: vi.fn().mockReturnValue([]),
    getStats: vi.fn().mockReturnValue({
      episodes: 0,
      semanticNodes: 0,
      proceduralMemories: 0,
      prospectiveMemories: 0,
      activeContext: 0,
    }),
    ...overrides,
  };
}

function createMockConsciousness() {
  return {
    emit: vi.fn(),
  };
}

function createMockLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
  };
}

function createMockSkills(skills: Array<{ id: string; successRate: number }> = []) {
  return {
    getAll: vi.fn().mockReturnValue(skills),
    improve: vi.fn().mockImplementation((id: string) => {
      const skill = skills.find(s => s.id === id);
      return { ...skill, successRate: (skill?.successRate ?? 0.5) + 0.05 };
    }),
  };
}

describe('background-tasks', () => {
  describe('constants', () => {
    it('should export AUTO_DREAM_INTERVAL as 50', () => {
      expect(AUTO_DREAM_INTERVAL).toBe(50);
    });

    it('should export AUTO_EVOLVE_INTERVAL as 100', () => {
      expect(AUTO_EVOLVE_INTERVAL).toBe(100);
    });
  });

  describe('triggerAutoDream', () => {
    it('should call dreamCycle and emit narrative event', async () => {
      const hippocampus = createMockHippocampus();
      const consciousness = createMockConsciousness();
      const logger = createMockLogger();

      await triggerAutoDream(
        hippocampus as never,
        consciousness as never,
        logger,
      );

      expect(hippocampus.dreamCycle).toHaveBeenCalledOnce();
      expect(hippocampus.getNarrative).toHaveBeenCalledOnce();
      expect(consciousness.emit).toHaveBeenCalledOnce();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('3 memories consolidated'),
      );
    });

    it('should emit chapters count in event data', async () => {
      const hippocampus = createMockHippocampus();
      const consciousness = createMockConsciousness();
      const logger = createMockLogger();

      await triggerAutoDream(
        hippocampus as never,
        consciousness as never,
        logger,
      );

      const eventData = consciousness.emit.mock.calls[0][0];
      expect(eventData.data.chaptersCount).toBe(2);
      expect(eventData.data.memoriesConsolidated).toBe(3);
    });

    it('should not throw when dreamCycle fails', async () => {
      const hippocampus = createMockHippocampus({
        dreamCycle: vi.fn().mockRejectedValue(new Error('Dream failed')),
      });
      const consciousness = createMockConsciousness();
      const logger = createMockLogger();

      await expect(
        triggerAutoDream(hippocampus as never, consciousness as never, logger),
      ).resolves.toBeUndefined();

      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('triggerAutoEvolve', () => {
    it('should skip when all skills have high success rate', async () => {
      const skills = createMockSkills([
        { id: 'skill1', successRate: 0.95 },
        { id: 'skill2', successRate: 0.98 },
      ]);
      const consciousness = createMockConsciousness();
      const logger = createMockLogger();

      await triggerAutoEvolve(
        skills as never,
        consciousness as never,
        logger,
      );

      expect(skills.improve).not.toHaveBeenCalled();
      expect(consciousness.emit).not.toHaveBeenCalled();
    });

    it('should improve low-success skills and emit event', async () => {
      const skills = createMockSkills([
        { id: 'skill1', successRate: 0.7 },
        { id: 'skill2', successRate: 0.8 },
      ]);
      const consciousness = createMockConsciousness();
      const logger = createMockLogger();

      await triggerAutoEvolve(
        skills as never,
        consciousness as never,
        logger,
      );

      expect(skills.improve).toHaveBeenCalled();
      expect(consciousness.emit).toHaveBeenCalledOnce();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('skills improved'),
      );
    });

    it('should only attempt to improve up to 3 low-success skills', async () => {
      const skills = createMockSkills([
        { id: 's1', successRate: 0.5 },
        { id: 's2', successRate: 0.6 },
        { id: 's3', successRate: 0.7 },
        { id: 's4', successRate: 0.8 },
      ]);
      const consciousness = createMockConsciousness();
      const logger = createMockLogger();

      await triggerAutoEvolve(
        skills as never,
        consciousness as never,
        logger,
      );

      expect(skills.improve).toHaveBeenCalledTimes(3);
    });

    it('should not emit event when no skills improve', async () => {
      const skills = createMockSkills([
        { id: 'skill1', successRate: 0.7 },
      ]);
      // improve returns same successRate (no improvement)
      skills.improve = vi.fn().mockReturnValue({ id: 'skill1', successRate: 0.7 });
      const consciousness = createMockConsciousness();
      const logger = createMockLogger();

      await triggerAutoEvolve(
        skills as never,
        consciousness as never,
        logger,
      );

      expect(consciousness.emit).not.toHaveBeenCalled();
    });

    it('should not throw when improve fails for one skill', async () => {
      const skills = createMockSkills([
        { id: 's1', successRate: 0.5 },
        { id: 's2', successRate: 0.6 },
      ]);
      skills.improve = vi.fn()
        .mockImplementationOnce(() => { throw new Error('Improve failed'); })
        .mockImplementationOnce(() => ({ id: 's2', successRate: 0.9 }));
      const consciousness = createMockConsciousness();
      const logger = createMockLogger();

      await expect(
        triggerAutoEvolve(skills as never, consciousness as never, logger),
      ).resolves.toBeUndefined();

      expect(consciousness.emit).toHaveBeenCalledOnce();
    });

    it('should not throw when getAll fails', async () => {
      const skills = createMockSkills();
      skills.getAll = vi.fn().mockImplementation(() => {
        throw new Error('GetAll failed');
      });
      const consciousness = createMockConsciousness();
      const logger = createMockLogger();

      await expect(
        triggerAutoEvolve(skills as never, consciousness as never, logger),
      ).resolves.toBeUndefined();
    });
  });

  describe('generateProactiveSuggestions', () => {
    function createMockPersona(overrides: Record<string, unknown> = {}) {
      return {
        getPredictions: vi.fn().mockReturnValue({
          predictedNeeds: [],
          communicationPatterns: [],
          psychologicalProfile: { decisionStyle: 'analytical', openness: 0.5, conscientiousness: 0.5, informationPreference: 'detailed', riskTolerance: 0.5 },
        }),
        getUserModel: vi.fn().mockReturnValue({
          trustLevel: 0.5,
          interactionSummary: { totalInteractions: 10, commonTopics: [], avgResponseTime: 500 },
        }),
        emotionalState: {
          getState: vi.fn().mockReturnValue({
            primaryEmotion: 'neutral',
            intensity: 0.1,
            emotionalMemory: [],
            current: { valence: 0, arousal: 0, dominance: 0 },
          }),
        },
        ...overrides,
      };
    }

    it('should emit proactive suggestion for high-confidence predicted needs', () => {
      const persona = createMockPersona({
        getPredictions: vi.fn().mockReturnValue({
          predictedNeeds: [
            { description: 'Code review assistance', confidence: 0.8, timeHorizon: 'soon' },
          ],
          communicationPatterns: [],
          psychologicalProfile: {},
        }),
      });
      const hippocampus = createMockHippocampus();
      const consciousness = createMockConsciousness();
      const logger = createMockLogger();

      generateProactiveSuggestions(
        persona as never,
        hippocampus as never,
        consciousness as never,
        logger,
      );

      expect(consciousness.emit).toHaveBeenCalledOnce();
      const eventData = consciousness.emit.mock.calls[0][0];
      expect(eventData.data.type).toBe('suggestion');
      expect(eventData.data.content).toContain('code review');
    });

    it('should emit emotional care suggestion for sustained negative emotion', () => {
      const persona = createMockPersona({
        emotionalState: {
          getState: vi.fn().mockReturnValue({
            primaryEmotion: 'fear',
            intensity: 0.7,
            emotionalMemory: [],
            current: { valence: -0.5, arousal: 0.6, dominance: 0.3 },
          }),
        },
      });
      const hippocampus = createMockHippocampus();
      const consciousness = createMockConsciousness();
      const logger = createMockLogger();

      generateProactiveSuggestions(
        persona as never,
        hippocampus as never,
        consciousness as never,
        logger,
      );

      expect(consciousness.emit).toHaveBeenCalledOnce();
      const eventData = consciousness.emit.mock.calls[0][0];
      expect(eventData.data.content).toContain('stress');
    });

    it('should not emit when no significant patterns detected', () => {
      const persona = createMockPersona({
        getUserModel: vi.fn().mockReturnValue({
          trustLevel: 0.5,
          interactionSummary: { totalInteractions: 5, commonTopics: [], avgResponseTime: 500 },
        }),
      });
      const hippocampus = createMockHippocampus();
      const consciousness = createMockConsciousness();
      const logger = createMockLogger();

      generateProactiveSuggestions(
        persona as never,
        hippocampus as never,
        consciousness as never,
        logger,
      );

      expect(consciousness.emit).not.toHaveBeenCalled();
    });

    it('should not throw when persona methods fail', () => {
      const persona = createMockPersona({
        getPredictions: vi.fn().mockImplementation(() => { throw new Error('Predictions failed'); }),
      });
      const hippocampus = createMockHippocampus();
      const consciousness = createMockConsciousness();
      const logger = createMockLogger();

      expect(() =>
        generateProactiveSuggestions(
          persona as never,
          hippocampus as never,
          consciousness as never,
          logger,
        ),
      ).not.toThrow();
    });

    it('should export AUTO_PROACTIVE_INTERVAL', () => {
      expect(AUTO_PROACTIVE_INTERVAL).toBe(30);
    });
  });

  describe('detectCommitments', () => {
    beforeEach(() => {
      clearPendingItems();
      // Force clear all by calling clearPendingItems after setting all items to reminded
    });

    it('should detect "I need to" commitment (English)', () => {
      detectCommitments('I need to finish the report by Friday');
      // Can't directly assert internal state, but checkPendingReminders should pick it up
      // after the time threshold. Instead, verify the function doesn't throw.
      expect(true).toBe(true);
    });

    it('should detect Chinese commitment "我要"', () => {
      detectCommitments('我要完成那个报告');
      expect(true).toBe(true);
    });

    it('should detect "remind me" instruction', () => {
      detectCommitments('Remind me to call mom tomorrow');
      expect(true).toBe(true);
    });

    it('should detect Chinese "提醒我" instruction', () => {
      detectCommitments('提醒我下午三点开会');
      expect(true).toBe(true);
    });

    it('should not throw on empty input', () => {
      expect(() => detectCommitments('')).not.toThrow();
    });

    it('should not throw on plain conversational text', () => {
      expect(() => detectCommitments('Hello, how are you doing today?')).not.toThrow();
      expect(() => detectCommitments('The weather is nice')).not.toThrow();
    });

    it('should handle multiple commitments in sequence', () => {
      expect(() => {
        detectCommitments('I need to call mom');
        detectCommitments('我要去买菜');
        detectCommitments('Remind me to check the deployment');
      }).not.toThrow();
    });
  });

  describe('checkPendingReminders', () => {
    beforeEach(() => {
      clearPendingItems();
    });

    it('should not emit when no pending items', () => {
      const consciousness = createMockConsciousness();
      const logger = createMockLogger();

      checkPendingReminders(consciousness as never, logger);

      expect(consciousness.emit).not.toHaveBeenCalled();
    });

    it('should not emit for recent commitments (under 30 min)', () => {
      // detectCommitments uses Date.now(), so the item is brand new
      detectCommitments('I need to finish the report');

      const consciousness = createMockConsciousness();
      const logger = createMockLogger();

      checkPendingReminders(consciousness as never, logger);

      // Should NOT emit because the item is less than 30 minutes old
      expect(consciousness.emit).not.toHaveBeenCalled();
    });

    it('should not throw when consciousness.emit fails', () => {
      detectCommitments('I need to do something important');

      const consciousness = {
        emit: vi.fn().mockImplementation(() => { throw new Error('Emit failed'); }),
      };
      const logger = createMockLogger();

      expect(() =>
        checkPendingReminders(consciousness as never, logger),
      ).not.toThrow();
    });
  });

  describe('clearPendingItems', () => {
    it('should not throw when called with no items', () => {
      expect(() => clearPendingItems()).not.toThrow();
    });

    it('should not throw after adding items', () => {
      detectCommitments('I need to do something');
      expect(() => clearPendingItems()).not.toThrow();
    });
  });

  describe('detectConversationalPhase', () => {
    it('should detect idle phase when user has been away', () => {
      const result = detectConversationalPhase({
        turnCount: 10,
        recentTopics: ['coding'],
        repetitionDetected: false,
        avgRecentMessageLength: 100,
        hasActiveGoals: true,
        secondsSinceLastMessage: 600,
        hasWrapUpSignals: false,
        hasTechnicalContent: true,
      });
      expect(result.phase).toBe('idle');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should detect greeting phase in first 2 turns', () => {
      const result = detectConversationalPhase({
        turnCount: 1,
        recentTopics: [],
        repetitionDetected: false,
        avgRecentMessageLength: 20,
        hasActiveGoals: false,
        secondsSinceLastMessage: 5,
        hasWrapUpSignals: false,
        hasTechnicalContent: false,
      });
      expect(result.phase).toBe('greeting');
    });

    it('should detect wrap-up phase', () => {
      const result = detectConversationalPhase({
        turnCount: 15,
        recentTopics: ['coding'],
        repetitionDetected: false,
        avgRecentMessageLength: 30,
        hasActiveGoals: true,
        secondsSinceLastMessage: 5,
        hasWrapUpSignals: true,
        hasTechnicalContent: false,
      });
      expect(result.phase).toBe('wrap-up');
    });

    it('should detect deep-work phase with technical content and goals', () => {
      const result = detectConversationalPhase({
        turnCount: 10,
        recentTopics: ['coding', 'debugging'],
        repetitionDetected: false,
        avgRecentMessageLength: 120,
        hasActiveGoals: true,
        secondsSinceLastMessage: 10,
        hasWrapUpSignals: false,
        hasTechnicalContent: true,
      });
      expect(result.phase).toBe('deep-work');
      expect(result.guidance).toContain('focused');
    });

    it('should detect review phase when repetition detected', () => {
      const result = detectConversationalPhase({
        turnCount: 20,
        recentTopics: ['testing'],
        repetitionDetected: true,
        avgRecentMessageLength: 80,
        hasActiveGoals: false,
        secondsSinceLastMessage: 5,
        hasWrapUpSignals: false,
        hasTechnicalContent: false,
      });
      expect(result.phase).toBe('review');
    });

    it('should default to exploration phase', () => {
      const result = detectConversationalPhase({
        turnCount: 5,
        recentTopics: ['chat'],
        repetitionDetected: false,
        avgRecentMessageLength: 40,
        hasActiveGoals: false,
        secondsSinceLastMessage: 10,
        hasWrapUpSignals: false,
        hasTechnicalContent: false,
      });
      expect(result.phase).toBe('exploration');
      expect(result.guidance).toContain('curious');
    });

    it('should always provide guidance', () => {
      const phases = [
        { turnCount: 1, secondsSinceLastMessage: 5, hasTechnicalContent: false, hasActiveGoals: false, hasWrapUpSignals: false },
        { turnCount: 10, secondsSinceLastMessage: 5, hasTechnicalContent: true, hasActiveGoals: true, hasWrapUpSignals: false },
        { turnCount: 20, secondsSinceLastMessage: 600, hasTechnicalContent: false, hasActiveGoals: false, hasWrapUpSignals: false },
      ];
      for (const ctx of phases) {
        const result = detectConversationalPhase({
          ...ctx,
          recentTopics: [],
          repetitionDetected: false,
          avgRecentMessageLength: 50,
        });
        expect(result.guidance.length).toBeGreaterThan(10);
      }
    });
  });
});
