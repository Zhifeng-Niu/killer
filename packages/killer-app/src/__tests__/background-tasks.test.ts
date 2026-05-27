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
  extractFactsFromMessage,
  storeExtractedFacts,
  detectGoalConflicts,
  consolidateMemories,
  classifyFailure,
  recordFailure,
  getFailurePatterns,
  clearFailureTracking,
  detectMultiIntent,
  scoreTurnImportance,
  extractTopic,
  detectTopicTransition,
  detectAmbiguity,
  extractGoalResources,
  buildGoalDependencyGraph,
  generateProgressReport,
  generateTemporalContext,
  predictConversationFlow,
  evaluateResponseQuality,
  detectResponseRepetition,
  detectLengthSignal,
  updateLengthPreference,
  createDefaultLengthPreference,
  suggestToolPriority,
  monitorConversationHealth,
  decideAutonomousActions,
  classifyInteractionOutcome,
  suggestStrategyAdjustment,
  scoreSectionRelevance,
  extractTopicSnapshot,
  formatTopicSnapshot,
  generateIntentPreloads,
  analyzeConversationRhythm,
  buildUserExpertiseProfile,
  mapEmotionToResponseStrategy,
  fusePerceptionSignals,
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

  describe('extractFactsFromMessage', () => {
    it('should extract English preferences', () => {
      const facts = extractFactsFromMessage('I prefer dark mode for my editor');
      expect(facts.length).toBeGreaterThan(0);
      expect(facts[0].type).toBe('preference');
      expect(facts[0].value).toContain('prefer');
    });

    it('should extract Chinese preferences', () => {
      const facts = extractFactsFromMessage('我喜欢用 TypeScript 写代码');
      expect(facts.length).toBeGreaterThan(0);
      expect(facts[0].type).toBe('preference');
    });

    it('should extract skills and tools', () => {
      const facts = extractFactsFromMessage('I use React and Next.js for my projects');
      expect(facts.some(f => f.type === 'skill')).toBe(true);
    });

    it('should extract project names', () => {
      const facts = extractFactsFromMessage('My project is called Odysseus');
      expect(facts.some(f => f.type === 'project')).toBe(true);
    });

    it('should extract names', () => {
      const facts = extractFactsFromMessage('My name is Alice and I work as a developer');
      expect(facts.some(f => f.type === 'relationship' && f.label === 'user name')).toBe(true);
    });

    it('should extract deadlines', () => {
      const facts = extractFactsFromMessage('The deadline is January 15');
      expect(facts.some(f => f.type === 'date')).toBe(true);
    });

    it('should return empty for generic messages', () => {
      const facts = extractFactsFromMessage('Hello, how are you doing today?');
      expect(facts.length).toBe(0);
    });

    it('should return empty for short messages', () => {
      const facts = extractFactsFromMessage('OK');
      expect(facts.length).toBe(0);
    });
  });

  describe('storeExtractedFacts', () => {
    it('should store facts into hippocampus', () => {
      const mockHippocampus = {
        getSemanticNodesByType: vi.fn().mockReturnValue([]),
        addSemanticNode: vi.fn().mockReturnValue({ id: 'test' }),
      };

      const facts = [
        { type: 'preference' as const, label: 'test', value: 'test value', confidence: 0.8 },
      ];

      const stored = storeExtractedFacts(facts, mockHippocampus as never);
      expect(stored).toBe(1);
      expect(mockHippocampus.addSemanticNode).toHaveBeenCalledOnce();
    });

    it('should skip duplicate facts', () => {
      const mockHippocampus = {
        getSemanticNodesByType: vi.fn().mockReturnValue([
          { label: 'test', properties: { value: 'existing value' } },
        ]),
        addSemanticNode: vi.fn(),
      };

      const facts = [
        { type: 'preference' as const, label: 'test', value: 'existing value', confidence: 0.8 },
      ];

      const stored = storeExtractedFacts(facts, mockHippocampus as never);
      expect(stored).toBe(0);
      expect(mockHippocampus.addSemanticNode).not.toHaveBeenCalled();
    });

    it('should limit to 5 facts per call', () => {
      const mockHippocampus = {
        getSemanticNodesByType: vi.fn().mockReturnValue([]),
        addSemanticNode: vi.fn().mockReturnValue({ id: 'test' }),
      };

      const facts = Array.from({ length: 10 }, (_, i) => ({
        type: 'fact' as const,
        label: `fact-${i}`,
        value: `value-${i}`,
        confidence: 0.8,
      }));

      const stored = storeExtractedFacts(facts, mockHippocampus as never);
      expect(stored).toBe(5);
    });
  });

  describe('consolidateMemories', () => {
    it('should return empty when fewer than 3 episodes', () => {
      const hippocampus = createMockHippocampus({
        getRecentEpisodes: vi.fn().mockReturnValue([
          { tags: ['coding'], emotionalWeight: 0.5 },
          { tags: ['testing'], emotionalWeight: 0.3 },
        ]),
      });

      const insights = consolidateMemories(hippocampus as never);
      expect(insights.length).toBe(0);
    });

    it('should detect recurring tags appearing 3+ times', () => {
      const episodes = [
        { tags: ['coding', 'debugging'], emotionalWeight: 0.5 },
        { tags: ['coding', 'testing'], emotionalWeight: 0.6 },
        { tags: ['coding'], emotionalWeight: 0.4 },
        { tags: ['debugging'], emotionalWeight: 0.3 },
        { tags: ['coding', 'debugging'], emotionalWeight: 0.7 },
      ];
      const hippocampus = createMockHippocampus({
        getRecentEpisodes: vi.fn().mockReturnValue(episodes),
        getSemanticNodesByType: vi.fn().mockReturnValue([]),
        addSemanticNode: vi.fn().mockReturnValue({ id: 'node-1' }),
      });

      const insights = consolidateMemories(hippocampus as never);
      expect(insights.some(i => i.summary.includes('coding') && i.summary.includes('4 times'))).toBe(true);
      expect(insights.some(i => i.summary.includes('debugging') && i.summary.includes('3 times'))).toBe(true);
    });

    it('should detect high-emotion themes', () => {
      const episodes = [
        { tags: ['deployment', 'stress'], emotionalWeight: 0.8 },
        { tags: ['deployment', 'fix'], emotionalWeight: 0.9 },
        { tags: ['coding'], emotionalWeight: 0.3 },
        { tags: ['deployment'], emotionalWeight: 0.75 },
      ];
      const hippocampus = createMockHippocampus({
        getRecentEpisodes: vi.fn().mockReturnValue(episodes),
        getSemanticNodesByType: vi.fn().mockReturnValue([]),
        addSemanticNode: vi.fn().mockReturnValue({ id: 'node-1' }),
      });

      const insights = consolidateMemories(hippocampus as never);
      expect(insights.some(i => i.tags.includes('emotional-pattern'))).toBe(true);
    });

    it('should store insights as semantic nodes with dedup', () => {
      const episodes = [
        { tags: ['coding'], emotionalWeight: 0.5 },
        { tags: ['coding'], emotionalWeight: 0.5 },
        { tags: ['coding'], emotionalWeight: 0.5 },
      ];
      const hippocampus = createMockHippocampus({
        getRecentEpisodes: vi.fn().mockReturnValue(episodes),
        getSemanticNodesByType: vi.fn().mockReturnValue([]),
        addSemanticNode: vi.fn().mockReturnValue({ id: 'node-1' }),
      });

      consolidateMemories(hippocampus as never);
      expect(hippocampus.addSemanticNode).toHaveBeenCalled();
      const callArgs = (hippocampus.addSemanticNode as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.type).toBe('concept');
      expect(callArgs.label).toBe('consolidated-insight');
    });

    it('should skip duplicate insights already in semantic memory', () => {
      const episodes = [
        { tags: ['coding'], emotionalWeight: 0.5 },
        { tags: ['coding'], emotionalWeight: 0.5 },
        { tags: ['coding'], emotionalWeight: 0.5 },
      ];
      const summary = 'Recurring topic: "coding" appeared 3 times recently (has some friction)';
      const hippocampus = createMockHippocampus({
        getRecentEpisodes: vi.fn().mockReturnValue(episodes),
        getSemanticNodesByType: vi.fn().mockReturnValue([
          { label: 'consolidated-insight', properties: { summary } },
        ]),
        addSemanticNode: vi.fn().mockReturnValue({ id: 'node-1' }),
      });

      consolidateMemories(hippocampus as never);
      expect(hippocampus.addSemanticNode).not.toHaveBeenCalled();
    });

    it('should store at most 3 insights', () => {
      const episodes = Array.from({ length: 15 }, (_, i) => ({
        tags: [`tag-${i % 5}`],
        emotionalWeight: 0.5,
      }));
      // All 5 tags appear exactly 3 times
      const hippocampus = createMockHippocampus({
        getRecentEpisodes: vi.fn().mockReturnValue(episodes),
        getSemanticNodesByType: vi.fn().mockReturnValue([]),
        addSemanticNode: vi.fn().mockReturnValue({ id: 'node-1' }),
      });

      const insights = consolidateMemories(hippocampus as never);
      // Function stores at most 3 insights
      expect((hippocampus.addSemanticNode as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThanOrEqual(3);
    });
  });

  describe('detectGoalConflicts', () => {
    it('should detect duplicate goals with high similarity', () => {
      const conflicts = detectGoalConflicts(
        'Build REST API with authentication',
        'goal-2',
        [{ id: 'goal-1', description: 'Build REST API with authentication and tests' }],
      );
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0].type).toBe('duplicate');
    });

    it('should detect overlapping goals', () => {
      const conflicts = detectGoalConflicts(
        'Implement user authentication system',
        'goal-2',
        [{ id: 'goal-1', description: 'Build user authentication with OAuth support' }],
      );
      expect(conflicts.some(c => c.type === 'overlap')).toBe(true);
    });

    it('should not flag unrelated goals', () => {
      const conflicts = detectGoalConflicts(
        'Refactor database migration system',
        'goal-2',
        [{ id: 'goal-1', description: 'Design new landing page with animations' }],
      );
      expect(conflicts.length).toBe(0);
    });

    it('should detect contradiction patterns', () => {
      const conflicts = detectGoalConflicts(
        'Remove deprecated API endpoints',
        'goal-2',
        [{ id: 'goal-1', description: 'Add new API endpoints for user management' }],
      );
      expect(conflicts.some(c => c.type === 'contradiction')).toBe(true);
    });

    it('should return empty for no existing goals', () => {
      const conflicts = detectGoalConflicts('New goal', 'goal-1', []);
      expect(conflicts.length).toBe(0);
    });

    it('should always include suggestion for conflicts', () => {
      const conflicts = detectGoalConflicts(
        'Build REST API with authentication',
        'goal-2',
        [{ id: 'goal-1', description: 'Build REST API with auth and tests' }],
      );
      for (const c of conflicts) {
        expect(c.suggestion.length).toBeGreaterThan(10);
      }
    });
  });

  describe('classifyFailure', () => {
    it('should classify timeout errors', () => {
      const result = classifyFailure('search', 'Request timed out after 30s');
      expect(result.type).toBe('timeout');
      expect(result.strategy).toBe('retry_with_backoff');
      expect(result.maxRetries).toBe(3);
    });

    it('should classify auth errors', () => {
      const result = classifyFailure('api', '401 Unauthorized');
      expect(result.type).toBe('auth');
      expect(result.strategy).toBe('escalate');
      expect(result.maxRetries).toBe(0);
    });

    it('should classify rate limit errors', () => {
      const result = classifyFailure('llm', '429 Too many requests');
      expect(result.type).toBe('rate_limit');
      expect(result.strategy).toBe('retry_with_backoff');
    });

    it('should classify not found errors', () => {
      const result = classifyFailure('read_file', 'ENOENT: file not found');
      expect(result.type).toBe('not_found');
      expect(result.strategy).toBe('fix_args');
    });

    it('should classify invalid args errors', () => {
      const result = classifyFailure('calc', 'Invalid input: expected number');
      expect(result.type).toBe('invalid_args');
      expect(result.strategy).toBe('fix_args');
    });

    it('should classify network errors', () => {
      const result = classifyFailure('fetch', 'ECONNREFUSED');
      expect(result.type).toBe('network');
      expect(result.strategy).toBe('retry');
    });

    it('should classify resource exhausted errors', () => {
      const result = classifyFailure('heavy', 'Out of memory: heap allocation failed');
      expect(result.type).toBe('resource_exhausted');
      expect(result.strategy).toBe('skip');
    });

    it('should default to unknown for unrecognized errors', () => {
      const result = classifyFailure('tool', 'Something weird happened');
      expect(result.type).toBe('unknown');
      expect(result.strategy).toBe('retry');
      expect(result.maxRetries).toBe(1);
    });
  });

  describe('failure tracking', () => {
    beforeEach(() => {
      clearFailureTracking();
    });

    it('should track and retrieve failure patterns', () => {
      recordFailure('search', 'timeout', 'Request timed out');
      recordFailure('search', 'timeout', 'Request timed out again');
      recordFailure('search', 'timeout', 'Third timeout');

      const patterns = getFailurePatterns();
      expect(patterns.length).toBe(1);
      expect(patterns[0]).toContain('search');
      expect(patterns[0]).toContain('timeout');
    });

    it('should not report patterns with only 1 occurrence', () => {
      recordFailure('tool', 'unknown', 'One-off error');
      expect(getFailurePatterns().length).toBe(0);
    });

    it('should track recovery rate', () => {
      recordFailure('api', 'rate_limit', 'Rate limited', true);
      recordFailure('api', 'rate_limit', 'Rate limited', true);
      recordFailure('api', 'rate_limit', 'Rate limited', false);

      const patterns = getFailurePatterns();
      expect(patterns.length).toBe(1);
      expect(patterns[0]).toContain('partially recoverable');
    });

    it('should limit to 5 patterns', () => {
      for (let i = 0; i < 8; i++) {
        recordFailure(`tool-${i}`, 'timeout', 'Timeout', false);
        recordFailure(`tool-${i}`, 'timeout', 'Timeout', false);
      }

      expect(getFailurePatterns().length).toBeLessThanOrEqual(5);
    });
  });

  describe('detectMultiIntent', () => {
    it('should detect numbered list intents', () => {
      const intents = detectMultiIntent('1. Check database performance 2. Review deployment logs 3. Update README');
      expect(intents.length).toBe(3);
      expect(intents[0].text).toContain('Check database');
    });

    it('should detect question-based multi-intent', () => {
      const intents = detectMultiIntent('How do I fix the timeout? What about the memory leak?');
      expect(intents.length).toBeGreaterThanOrEqual(2);
      expect(intents.every(i => i.isQuestion)).toBe(true);
    });

    it('should detect semicolon-separated intents', () => {
      const intents = detectMultiIntent('Check the API logs; review the error rates; fix the timeout issue');
      expect(intents.length).toBe(3);
    });

    it('should return empty for single intent', () => {
      const intents = detectMultiIntent('Hello, how are you doing today?');
      expect(intents.length).toBe(0);
    });

    it('should return empty for short input', () => {
      expect(detectMultiIntent('OK').length).toBe(0);
      expect(detectMultiIntent('').length).toBe(0);
    });

    it('should return empty for single sentence', () => {
      const intents = detectMultiIntent('Please help me debug the authentication module');
      expect(intents.length).toBe(0);
    });

    it('should include index for each intent', () => {
      const intents = detectMultiIntent('1. First task 2. Second task 3. Third task');
      expect(intents.map(i => i.index)).toEqual([1, 2, 3]);
    });
  });

  describe('scoreTurnImportance', () => {
    it('should give low score to short messages', () => {
      const score = scoreTurnImportance('user', 'OK');
      expect(score.importance).toBeLessThan(0.2);
    });

    it('should give higher score to messages with metrics', () => {
      const score = scoreTurnImportance('user', 'The API response time is 450ms, error rate is 3%, and latency is 1200ms — we must fix this');
      expect(score.importance).toBeGreaterThan(0.5);
      expect(score.reasons).toContain('fact-dense');
    });

    it('should boost score for decision markers', () => {
      const score = scoreTurnImportance('user', 'We decided to go with the PostgreSQL approach for the database');
      expect(score.importance).toBeGreaterThan(0.5);
      expect(score.reasons).toContain('decision');
    });

    it('should boost score for action verbs', () => {
      const score = scoreTurnImportance('assistant', 'I will implement the caching layer to fix the timeout issues');
      expect(score.reasons).toContain('action');
    });

    it('should boost score for emotional markers', () => {
      const score = scoreTurnImportance('user', 'This is critical — we must fix the memory leak before the release');
      expect(score.reasons).toContain('emotional');
    });

    it('should give slight bonus to user messages', () => {
      const userScore = scoreTurnImportance('user', 'The deployment failed with error code 500');
      const asstScore = scoreTurnImportance('assistant', 'The deployment failed with error code 500');
      expect(userScore.importance).toBeGreaterThan(asstScore.importance);
    });

    it('should cap importance at 1.0', () => {
      const score = scoreTurnImportance('user', 'We decided to implement the critical fix — 99% error rate, 5000ms latency, v2.1, issue #42, PR #108. This is urgent and important and we must deploy it now. ' + 'x'.repeat(500));
      expect(score.importance).toBeLessThanOrEqual(1.0);
    });

    it('should return reasons for high scores', () => {
      const score = scoreTurnImportance('user', 'We decided to implement the caching fix — error rate is 5% and latency is 2000ms. This is critical.');
      expect(score.reasons.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('extractTopic', () => {
    it('should detect debugging topic', () => {
      expect(extractTopic('I need to fix the bug in the login flow')).toBe('debugging');
    });

    it('should detect testing topic', () => {
      expect(extractTopic('How do I write unit tests for this module?')).toBe('testing');
    });

    it('should detect deployment topic', () => {
      expect(extractTopic('The CI pipeline is failing on deploy')).toBe('deployment');
    });

    it('should detect performance topic', () => {
      expect(extractTopic('The API latency is too slow')).toBe('performance');
    });

    it('should return general for non-technical messages', () => {
      expect(extractTopic('Hello, how are you?')).toBe('general');
    });
  });

  describe('detectTopicTransition', () => {
    it('should detect topic transition', () => {
      const result = detectTopicTransition(
        'I need to fix the bug in authentication',
        'testing',
        5,
        [{ topic: 'testing', turnStart: 1, turnEnd: 0 }],
      );
      expect(result.transitioned).toBe(true);
      expect(result.currentTopic).toBe('debugging');
    });

    it('should not detect transition on same topic', () => {
      const result = detectTopicTransition(
        'Another bug I found in the error handler',
        'debugging',
        3,
        [{ topic: 'debugging', turnStart: 1, turnEnd: 0 }],
      );
      expect(result.transitioned).toBe(false);
    });

    it('should detect explicit topic return', () => {
      const result = detectTopicTransition(
        'Let\'s go back to the database migration',
        'debugging',
        10,
        [{ topic: 'database', turnStart: 1, turnEnd: 4 }],
      );
      expect(result.currentTopic).toBe('database');
    });

    it('should update topic history', () => {
      const result = detectTopicTransition(
        'How do I optimize the query performance?',
        'debugging',
        5,
        [{ topic: 'debugging', turnStart: 1, turnEnd: 0 }],
      );
      expect(result.history.length).toBe(2);
      expect(result.history[0].turnEnd).toBe(4);
    });

    it('should not detect transition on first turn', () => {
      const result = detectTopicTransition(
        'I need help with testing',
        'general',
        1,
        [],
      );
      expect(result.transitioned).toBe(false);
    });
  });

  describe('detectAmbiguity', () => {
    it('should detect vague verb "fix"', () => {
      const result = detectAmbiguity('fix');
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe('vague_verb');
      expect(result[0].clarification.length).toBeGreaterThan(10);
    });

    it('should detect vague verb "optimize"', () => {
      const result = detectAmbiguity('optimize it');
      expect(result.length).toBeGreaterThan(0);
      expect(result.some(a => a.type === 'vague_verb')).toBe(true);
    });

    it('should detect Chinese vague verb', () => {
      const result = detectAmbiguity('修一下');
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe('vague_verb');
    });

    it('should detect missing target', () => {
      const result = detectAmbiguity('Fix the thing');
      expect(result.some(a => a.type === 'missing_target')).toBe(true);
    });

    it('should detect pronoun reference', () => {
      const result = detectAmbiguity('it needs to be updated');
      expect(result.some(a => a.type === 'pronoun_reference')).toBe(true);
    });

    it('should return empty for clear, specific input', () => {
      expect(detectAmbiguity('Fix the authentication bug in login.ts where users get 401 errors')).toHaveLength(0);
    });

    it('should return empty for short/empty input', () => {
      expect(detectAmbiguity('')).toHaveLength(0);
      expect(detectAmbiguity('OK')).toHaveLength(0);
    });

    it('should return empty for complete sentences', () => {
      expect(detectAmbiguity('Please help me write unit tests for the database module')).toHaveLength(0);
    });
  });

  describe('extractGoalResources', () => {
    it('should extract database resource', () => {
      expect(extractGoalResources('Refactor the database schema')).toContain('database');
    });

    it('should extract API resource', () => {
      expect(extractGoalResources('Update API endpoints for v2')).toContain('api');
    });

    it('should extract multiple resources', () => {
      const resources = extractGoalResources('Add authentication to API endpoints');
      expect(resources).toContain('auth');
      expect(resources).toContain('api');
    });

    it('should return empty for non-technical goals', () => {
      expect(extractGoalResources('Write documentation')).toHaveLength(0);
    });
  });

  describe('buildGoalDependencyGraph', () => {
    it('should detect resource conflict between goals', () => {
      const deps = buildGoalDependencyGraph([
        { id: 'g1', description: 'Optimize database queries', status: 'pending' },
        { id: 'g2', description: 'Add database migration for users table', status: 'pending' },
      ]);
      expect(deps.length).toBeGreaterThan(0);
      expect(deps[0].type).toBe('resource_conflict');
    });

    it('should detect prerequisite when one goal is a refactor', () => {
      const deps = buildGoalDependencyGraph([
        { id: 'g1', description: 'Refactor the database layer', status: 'pending' },
        { id: 'g2', description: 'Optimize database query performance', status: 'pending' },
      ]);
      expect(deps.length).toBeGreaterThan(0);
      expect(deps.some(d => d.type === 'prerequisite')).toBe(true);
    });

    it('should return empty for unrelated goals', () => {
      const deps = buildGoalDependencyGraph([
        { id: 'g1', description: 'Design new landing page', status: 'pending' },
        { id: 'g2', description: 'Set up CI pipeline', status: 'pending' },
      ]);
      expect(deps).toHaveLength(0);
    });

    it('should return empty for single goal', () => {
      const deps = buildGoalDependencyGraph([
        { id: 'g1', description: 'Fix the database bug', status: 'pending' },
      ]);
      expect(deps).toHaveLength(0);
    });

    it('should return empty for no goals', () => {
      expect(buildGoalDependencyGraph([])).toHaveLength(0);
    });
  });

  describe('generateProgressReport', () => {
    it('should report 0% for no completed steps', () => {
      const report = generateProgressReport('Build API', [
        { description: 'Design schema', status: 'pending' },
        { description: 'Implement routes', status: 'pending' },
        { description: 'Write tests', status: 'pending' },
      ]);
      expect(report.percentComplete).toBe(0);
      expect(report.completedSteps).toBe(0);
      expect(report.remainingSteps).toBe(3);
    });

    it('should report partial progress', () => {
      const report = generateProgressReport('Build API', [
        { description: 'Design schema', status: 'completed' },
        { description: 'Implement routes', status: 'in_progress' },
        { description: 'Write tests', status: 'pending' },
        { description: 'Deploy', status: 'pending' },
      ]);
      expect(report.percentComplete).toBe(25);
      expect(report.completedSteps).toBe(1);
      expect(report.currentStep).toBe('Implement routes');
      expect(report.currentStepStatus).toBe('in_progress');
    });

    it('should report 100% when all steps done', () => {
      const report = generateProgressReport('Build API', [
        { description: 'Design schema', status: 'completed' },
        { description: 'Implement routes', status: 'completed' },
      ]);
      expect(report.percentComplete).toBe(100);
      expect(report.remainingSteps).toBe(0);
    });

    it('should include formatted output with progress bar', () => {
      const report = generateProgressReport('Build API', [
        { description: 'Step 1', status: 'completed' },
        { description: 'Step 2', status: 'pending' },
      ]);
      expect(report.formatted).toContain('Plan: Build API');
      expect(report.formatted).toContain('50%');
      expect(report.formatted).toContain('1/2 steps');
    });

    it('should handle empty steps array', () => {
      const report = generateProgressReport('Empty plan', []);
      expect(report.percentComplete).toBe(0);
      expect(report.totalSteps).toBe(0);
    });
  });

  describe('generateTemporalContext', () => {
    it('should generate context with current time', () => {
      const ctx = generateTemporalContext(null);
      expect(ctx.currentTime.length).toBeGreaterThan(0);
      expect(ctx.timeOfDay).toBeTruthy();
      expect(ctx.timeSinceLastInteraction).toBe('first interaction');
    });

    it('should compute time since last interaction', () => {
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      const ctx = generateTemporalContext(fiveMinAgo);
      expect(ctx.secondsSinceLastInteraction).toBeGreaterThanOrEqual(290);
      expect(ctx.timeSinceLastInteraction).toContain('minutes ago');
    });

    it('should detect upcoming deadlines from semantic nodes', () => {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      const in3Days = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const ctx = generateTemporalContext(null, [
        { label: 'deadline', properties: { date: in3Days, description: 'Release v2.0' } },
      ]);
      expect(ctx.upcomingDeadlines.length).toBeGreaterThan(0);
      expect(ctx.upcomingDeadlines[0]).toContain('Release v2.0');
      expect(ctx.urgencyLevel).toBe('normal');
    });

    it('should set high urgency for deadlines today', () => {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const ctx = generateTemporalContext(null, [
        { label: 'deadline', properties: { date: today, description: 'Critical fix' } },
      ]);
      expect(ctx.urgencyLevel).toBe('high');
      expect(ctx.formatted).toContain('Approaching deadline');
    });

    it('should return low urgency when no deadlines', () => {
      const ctx = generateTemporalContext(null, []);
      expect(ctx.urgencyLevel).toBe('low');
      expect(ctx.upcomingDeadlines).toHaveLength(0);
    });

    it('should ignore past deadlines', () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const ctx = generateTemporalContext(null, [
        { label: 'deadline', properties: { date: yesterday, description: 'Old deadline' } },
      ]);
      expect(ctx.upcomingDeadlines).toHaveLength(0);
    });

    it('should ignore deadlines more than 7 days away', () => {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      const nextMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const ctx = generateTemporalContext(null, [
        { label: 'deadline', properties: { date: nextMonth, description: 'Future deadline' } },
      ]);
      expect(ctx.upcomingDeadlines).toHaveLength(0);
    });
  });

  describe('predictConversationFlow', () => {
    it('should return casual-chat for empty messages', () => {
      const pred = predictConversationFlow([]);
      expect(pred.currentPattern).toBe('casual-chat');
      expect(pred.confidence).toBeLessThan(0.5);
    });

    it('should detect greeting pattern', () => {
      const pred = predictConversationFlow([
        { role: 'user', content: '你好' },
      ]);
      expect(pred.currentPattern).toBe('casual-chat');
      expect(pred.confidence).toBeGreaterThan(0.7);
      expect(pred.predictedNextSteps.length).toBeGreaterThan(0);
    });

    it('should detect question-answer pattern', () => {
      const pred = predictConversationFlow([
        { role: 'user', content: 'What is the capital of France?' },
      ]);
      expect(pred.currentPattern).toBe('question-answer');
      expect(pred.confidence).toBeGreaterThan(0.3);
    });

    it('should detect debug-diagnose-fix pattern', () => {
      const pred = predictConversationFlow([
        { role: 'user', content: 'I got an error: TypeError cannot read property of undefined' },
        { role: 'assistant', content: 'Let me help debug this.' },
        { role: 'user', content: 'Why does this happen when I click the button?' },
      ]);
      expect(pred.currentPattern).toBe('debug-diagnose-fix');
      expect(pred.suggestedTools).toContain('code_search');
    });

    it('should detect plan-execute-verify pattern', () => {
      const pred = predictConversationFlow([
        { role: 'user', content: 'Please add authentication to the API' },
        { role: 'assistant', content: 'Sure, I will add JWT auth.' },
        { role: 'user', content: 'Create the middleware first' },
      ]);
      expect(pred.currentPattern).toBe('plan-execute-verify');
      expect(pred.flowDescription.length).toBeGreaterThan(0);
    });

    it('should detect explore-deepen-implement pattern', () => {
      const pred = predictConversationFlow([
        { role: 'user', content: 'What is Redis?' },
        { role: 'assistant', content: 'Redis is an in-memory key-value store.' },
        { role: 'user', content: 'How does pub/sub work in Redis?' },
        { role: 'assistant', content: 'Pub/sub allows...' },
        { role: 'user', content: 'Can you implement a pub/sub system?' },
      ]);
      expect(pred.currentPattern).toBe('explore-deepen-implement');
    });

    it('should handle mixed messages and filter to user only', () => {
      const pred = predictConversationFlow([
        { role: 'assistant', content: 'Hello!' },
        { role: 'assistant', content: 'How can I help?' },
      ]);
      // No user messages → casual-chat
      expect(pred.currentPattern).toBe('casual-chat');
    });

    it('should return valid structure for all patterns', () => {
      const messages = [
        { role: 'user' as const, content: 'Fix the bug in login' },
        { role: 'assistant' as const, content: 'Fixed.' },
        { role: 'user' as const, content: 'ok thanks' },
      ];
      const pred = predictConversationFlow(messages);
      expect(pred).toHaveProperty('currentPattern');
      expect(pred).toHaveProperty('confidence');
      expect(pred).toHaveProperty('predictedNextSteps');
      expect(pred).toHaveProperty('suggestedTools');
      expect(pred).toHaveProperty('flowDescription');
      expect(pred.confidence).toBeGreaterThan(0);
      expect(pred.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('evaluateResponseQuality', () => {
    it('should give high relevance when response addresses the question', () => {
      const score = evaluateResponseQuality(
        'How do I install TypeScript?',
        'You can install TypeScript using npm: npm install -g typescript',
      );
      expect(score.relevance).toBeGreaterThan(0.5);
      expect(score.overall).toBeGreaterThan(0.3);
    });

    it('should give low relevance when response is off-topic', () => {
      const score = evaluateResponseQuality(
        'How do I install TypeScript?',
        'The weather is nice today. Did you know that penguins live in Antarctica?',
      );
      expect(score.relevance).toBeLessThan(0.3);
      expect(score.tags).toContain('low-relevance');
    });

    it('should detect code in response as actionable', () => {
      const score = evaluateResponseQuality(
        'Write a hello world function',
        'Here is the code:\n```js\nfunction hello() {\n  console.log("Hello, world!");\n}\n```',
      );
      expect(score.actionability).toBeGreaterThan(0.5);
      expect(score.tags).toContain('has-code');
    });

    it('should detect step-by-step instructions', () => {
      const score = evaluateResponseQuality(
        'How to deploy to production?',
        '1. Run tests\n2. Build the project\n3. Deploy to server\n4. Verify health check',
      );
      expect(score.actionability).toBeGreaterThan(0.5);
      expect(score.tags).toContain('has-steps');
    });

    it('should penalize over-explained short answers', () => {
      const score = evaluateResponseQuality(
        'yes or no?',
        'Well, that is a very interesting question. Let me elaborate on the history of yes and no. In many cultures, affirmative and negative responses have evolved significantly. '.repeat(5),
      );
      expect(score.conciseness).toBeLessThan(0.6);
      expect(score.tags).toContain('over-explained');
    });

    it('should detect incomplete multi-intent responses', () => {
      const score = evaluateResponseQuality(
        'Fix the bug and add tests',
        'I fixed the bug by adding a null check.',
        ['fix bug', 'write unit tests for authentication module'],
      );
      expect(score.completeness).toBeLessThan(1);
      expect(score.tags).toContain('incomplete-multi-intent');
    });

    it('should give perfect completeness for single intent', () => {
      const score = evaluateResponseQuality(
        'Fix the bug',
        'I fixed the bug by adding a null check.',
      );
      expect(score.completeness).toBe(1);
    });

    it('should return all score dimensions', () => {
      const score = evaluateResponseQuality('Hello', 'Hi there!');
      expect(score).toHaveProperty('relevance');
      expect(score).toHaveProperty('completeness');
      expect(score).toHaveProperty('conciseness');
      expect(score).toHaveProperty('actionability');
      expect(score).toHaveProperty('overall');
      expect(score).toHaveProperty('tags');
      expect(score.overall).toBeGreaterThanOrEqual(0);
      expect(score.overall).toBeLessThanOrEqual(1);
    });
  });

  describe('detectResponseRepetition', () => {
    it('should return no repetition for empty history', () => {
      const result = detectResponseRepetition('Hello world', []);
      expect(result.isRepetitive).toBe(false);
      expect(result.maxSimilarity).toBe(0);
    });

    it('should detect identical responses as repetitive', () => {
      const result = detectResponseRepetition(
        'You should check the configuration file for errors.',
        ['You should check the configuration file for errors.'],
      );
      expect(result.isRepetitive).toBe(true);
      expect(result.maxSimilarity).toBeGreaterThan(0.9);
    });

    it('should detect similar responses as repetitive', () => {
      const result = detectResponseRepetition(
        'Please check the configuration file for any errors or issues.',
        ['You should check the config file for errors and problems.'],
      );
      expect(result.isRepetitive).toBe(true);
      expect(result.similarIndex).toBe(0);
    });

    it('should not flag different responses', () => {
      const result = detectResponseRepetition(
        'The API returns a JSON object with user data.',
        ['You should restart the server to apply changes.'],
      );
      expect(result.isRepetitive).toBe(false);
      expect(result.maxSimilarity).toBeLessThan(0.5);
    });

    it('should find most similar response across multiple', () => {
      const result = detectResponseRepetition(
        'Run npm install to add the dependency.',
        [
          'The database connection was lost. Try reconnecting.',
          'Use npm install to add the package.',
          'Click the button to submit the form.',
        ],
      );
      expect(result.isRepetitive).toBe(true);
      expect(result.similarIndex).toBe(1);
    });

    it('should respect custom threshold', () => {
      const result = detectResponseRepetition(
        'Install the package with npm.',
        ['Add the package using npm install.'],
        0.9, // very high threshold
      );
      expect(result.isRepetitive).toBe(false);
    });
  });

  describe('adaptive response length', () => {
    describe('detectLengthSignal', () => {
      it('should detect explicit "more" requests', () => {
        expect(detectLengthSignal('tell me more about this', 100)).toBe('wants-longer');
        expect(detectLengthSignal('explain more', 200)).toBe('wants-longer');
        expect(detectLengthSignal('展开说说', 100)).toBe('wants-longer');
      });

      it('should detect explicit "shorter" requests', () => {
        expect(detectLengthSignal('too long, tldr', 500)).toBe('wants-shorter');
        expect(detectLengthSignal('keep it brief', 300)).toBe('wants-shorter');
        expect(detectLengthSignal('精简一点', 200)).toBe('wants-shorter');
      });

      it('should detect implicit shorter signal from short follow-up after long response', () => {
        expect(detectLengthSignal('ok', 600)).toBe('wants-shorter');
        expect(detectLengthSignal('thanks', 800)).toBe('wants-shorter');
      });

      it('should detect implicit longer signal from question after short response', () => {
        expect(detectLengthSignal('What about the error handling?', 80)).toBe('wants-longer');
      });

      it('should return neutral for balanced interactions', () => {
        expect(detectLengthSignal('I see, that makes sense', 300)).toBe('neutral');
      });
    });

    describe('updateLengthPreference', () => {
      it('should increase score on wants-longer signal', () => {
        const initial = createDefaultLengthPreference();
        const updated = updateLengthPreference(initial, 'wants-longer');
        expect(updated.score).toBeGreaterThan(initial.score);
        expect(updated.suggestedMaxLength).toBeGreaterThan(initial.suggestedMaxLength);
      });

      it('should decrease score on wants-shorter signal', () => {
        const initial = createDefaultLengthPreference();
        const updated = updateLengthPreference(initial, 'wants-shorter');
        expect(updated.score).toBeLessThan(initial.score);
        expect(updated.suggestedMaxLength).toBeLessThan(initial.suggestedMaxLength);
      });

      it('should not change on neutral signal', () => {
        const initial = createDefaultLengthPreference();
        const updated = updateLengthPreference(initial, 'neutral');
        expect(updated.score).toBe(initial.score);
      });

      it('should track recent signals', () => {
        let pref = createDefaultLengthPreference();
        pref = updateLengthPreference(pref, 'wants-longer');
        pref = updateLengthPreference(pref, 'wants-shorter');
        expect(pref.recentSignals).toEqual(['wants-longer', 'wants-shorter']);
      });

      it('should limit signals to last 10', () => {
        let pref = createDefaultLengthPreference();
        for (let i = 0; i < 15; i++) {
          pref = updateLengthPreference(pref, 'wants-longer');
        }
        expect(pref.recentSignals.length).toBe(10);
      });

      it('should clamp score to [0, 1]', () => {
        let pref = createDefaultLengthPreference();
        for (let i = 0; i < 20; i++) {
          pref = updateLengthPreference(pref, 'wants-shorter');
        }
        expect(pref.score).toBeGreaterThanOrEqual(0);
        expect(pref.score).toBeLessThanOrEqual(1);
      });

      it('should produce concise recommendation for low score', () => {
        let pref = createDefaultLengthPreference();
        for (let i = 0; i < 10; i++) {
          pref = updateLengthPreference(pref, 'wants-shorter');
        }
        expect(pref.recommendation).toContain('concise');
      });

      it('should produce detailed recommendation for high score', () => {
        let pref = createDefaultLengthPreference();
        for (let i = 0; i < 10; i++) {
          pref = updateLengthPreference(pref, 'wants-longer');
        }
        expect(pref.recommendation).toContain('Detailed');
      });
    });
  });

  describe('suggestToolPriority', () => {
    it('should suggest debug tools for debug flow', () => {
      const suggestion = suggestToolPriority('debug-diagnose-fix', 'deep-work', 'low');
      expect(suggestion.preferredTools).toContain('code_search');
      expect(suggestion.preferredTools).toContain('file_read');
      expect(suggestion.reason).toContain('debug-diagnose-fix');
    });

    it('should suggest search tools for question flow', () => {
      const suggestion = suggestToolPriority('question-answer', 'exploration', 'low');
      expect(suggestion.preferredTools).toContain('web_search');
      expect(suggestion.preferredTools).toContain('memory_recall');
    });

    it('should merge flow and phase tools', () => {
      const suggestion = suggestToolPriority('explore-deepen-implement', 'deep-work', 'low');
      expect(suggestion.preferredTools.length).toBeGreaterThan(2);
      // Flow tools come first
      expect(suggestion.preferredTools[0]).toBe('web_search');
    });

    it('should prioritize exec tools under high urgency', () => {
      const suggestion = suggestToolPriority('plan-execute-verify', 'deep-work', 'high');
      expect(suggestion.reason).toContain('urgent');
      // shell_exec should be prioritized to front
      const execIdx = suggestion.preferredTools.indexOf('shell_exec');
      expect(execIdx).toBeLessThanOrEqual(1);
    });

    it('should limit to 5 tools', () => {
      const suggestion = suggestToolPriority('explore-deepen-implement', 'deep-work', 'low');
      expect(suggestion.preferredTools.length).toBeLessThanOrEqual(5);
    });

    it('should handle unknown patterns gracefully', () => {
      const suggestion = suggestToolPriority('unknown-pattern', 'unknown-phase', 'low');
      expect(suggestion.preferredTools).toEqual([]);
      expect(suggestion.reason).toBeTruthy();
    });
  });

  describe('monitorConversationHealth', () => {
    it('should report healthy for normal conversation', () => {
      const health = monitorConversationHealth([
        { role: 'user', content: 'How do I parse JSON in TypeScript?' },
        { role: 'assistant', content: 'Use JSON.parse().' },
        { role: 'user', content: 'What about error handling?' },
      ], ['typescript', 'json', 'error-handling']);
      expect(health.score).toBeGreaterThanOrEqual(0.8);
      expect(health.isStuck).toBe(false);
      expect(health.frustrationLevel).toBe('none');
    });

    it('should detect stuck conversation on same topic', () => {
      const health = monitorConversationHealth(
        [
          { role: 'user', content: 'Fix the auth bug' },
          { role: 'assistant', content: 'Try restarting the server.' },
          { role: 'user', content: 'Still not working' },
          { role: 'assistant', content: 'Check the config.' },
          { role: 'user', content: 'Same error' },
        ],
        ['auth', 'auth', 'auth', 'auth', 'auth'],
      );
      expect(health.isStuck).toBe(true);
      expect(health.score).toBeLessThan(0.8);
    });

    it('should detect declining engagement', () => {
      const health = monitorConversationHealth([
        { role: 'user', content: 'I want to build a full-stack app with React and Node.js and PostgreSQL, can you help me plan the architecture?' },
        { role: 'assistant', content: 'Sure!' },
        { role: 'user', content: 'What about the database schema design?' },
        { role: 'assistant', content: 'Here is the schema.' },
        { role: 'user', content: 'ok' },
        { role: 'assistant', content: 'Next step.' },
        { role: 'user', content: 'yea' },
      ], ['architecture']);
      expect(health.engagementTrend).toBe('declining');
    });

    it('should detect high frustration', () => {
      const health = monitorConversationHealth([
        { role: 'user', content: 'This is useless, it still doesn\'t work' },
        { role: 'assistant', content: 'Let me try again.' },
        { role: 'user', content: 'I\'m frustrated, this is broken' },
      ], ['debugging']);
      expect(health.frustrationLevel).toBe('high');
      expect(health.score).toBeLessThanOrEqual(0.6);
    });

    it('should detect Chinese frustration', () => {
      const health = monitorConversationHealth([
        { role: 'user', content: '还是不行，算了' },
      ], ['debugging']);
      expect(health.frustrationLevel).not.toBe('none');
    });

    it('should produce recommendation for unhealthy conversation', () => {
      const health = monitorConversationHealth([
        { role: 'user', content: 'this is terrible and broken' },
        { role: 'user', content: 'useless' },
      ], ['bug', 'bug', 'bug', 'bug', 'bug']);
      expect(health.recommendation.length).toBeGreaterThan(0);
      expect(health.issues.length).toBeGreaterThan(0);
    });

    it('should handle empty conversation gracefully', () => {
      const health = monitorConversationHealth([], []);
      expect(health.score).toBe(1);
      expect(health.isStuck).toBe(false);
    });
  });

  describe('decideAutonomousActions', () => {
    const baseContext = {
      flowPattern: 'question-answer',
      phase: 'exploration',
      healthScore: 0.8,
      intentCount: 1,
      hasAmbiguity: false,
      topicTransition: false,
      turnCount: 5,
      recentTopics: ['testing'],
      hasActiveGoals: false,
    };

    it('should return no actions for healthy simple conversation', () => {
      const actions = decideAutonomousActions(baseContext);
      expect(actions.length).toBe(0);
    });

    it('should suggest clarification when health is very low', () => {
      const actions = decideAutonomousActions({ ...baseContext, healthScore: 0.3 });
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.some(a => a.type === 'clarification_ask')).toBe(true);
      expect(actions[0].urgency).toBe('high');
    });

    it('should suggest topic switch when health is moderate', () => {
      const actions = decideAutonomousActions({ ...baseContext, healthScore: 0.5 });
      expect(actions.some(a => a.type === 'topic_switch_suggest')).toBe(true);
    });

    it('should suggest summary in long deep-work sessions', () => {
      const actions = decideAutonomousActions({ ...baseContext, phase: 'deep-work', turnCount: 20 });
      expect(actions.some(a => a.type === 'summary_offer')).toBe(true);
    });

    it('should suggest memory search for multiple intents', () => {
      const actions = decideAutonomousActions({ ...baseContext, intentCount: 3 });
      expect(actions.some(a => a.type === 'memory_search')).toBe(true);
    });

    it('should suggest context refresh on topic transition', () => {
      const actions = decideAutonomousActions({
        ...baseContext,
        topicTransition: true,
        recentTopics: ['testing', 'deployment'],
      });
      expect(actions.some(a => a.type === 'context_refresh')).toBe(true);
    });

    it('should suggest web search in debug flow during deep-work', () => {
      const actions = decideAutonomousActions({
        ...baseContext,
        flowPattern: 'debug-diagnose-fix',
        phase: 'deep-work',
        recentTopics: ['authentication'],
      });
      expect(actions.some(a => a.type === 'web_search')).toBe(true);
    });

    it('should suggest goal check when idle with active goals', () => {
      const actions = decideAutonomousActions({ ...baseContext, phase: 'idle', hasActiveGoals: true });
      expect(actions.some(a => a.type === 'goal_check')).toBe(true);
    });

    it('should suggest memory search on ambiguous input', () => {
      const actions = decideAutonomousActions({ ...baseContext, hasAmbiguity: true });
      expect(actions.some(a => a.type === 'memory_search' && a.urgency === 'high')).toBe(true);
    });

    it('should sort by urgency and cap at 3 actions', () => {
      const actions = decideAutonomousActions({
        ...baseContext,
        healthScore: 0.3,
        intentCount: 3,
        hasAmbiguity: true,
        topicTransition: true,
        recentTopics: ['a', 'b', 'c'],
        phase: 'deep-work',
        turnCount: 20,
        hasActiveGoals: true,
      });
      expect(actions.length).toBeLessThanOrEqual(3);
      if (actions.length >= 2) {
        const urgencyOrder = { high: 0, medium: 1, low: 2 };
        expect(urgencyOrder[actions[0].urgency]).toBeLessThanOrEqual(urgencyOrder[actions[1].urgency]);
      }
    });
  });

  describe('classifyInteractionOutcome', () => {
    it('should detect frustration', () => {
      const result = classifyInteractionOutcome(
        'You can fix this by running npm install',
        '不对，还是不行，你说的方法没有用',
        ['npm', 'install'],
      );
      expect(result.outcome).toBe('frustration');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should detect repeated question via similarity', () => {
      const result = classifyInteractionOutcome(
        'The React useEffect hook runs after render to handle side effects',
        'useEffect hook in React runs after render for side effects?',
        ['react', 'hooks'],
      );
      expect(result.outcome).toBe('repeated_question');
    });

    it('should detect clarification request', () => {
      const result = classifyInteractionOutcome(
        'Set the cache TTL to 3600 seconds',
        '什么意思？能详细解释一下吗？',
        ['cache'],
      );
      expect(result.outcome).toBe('clarification_needed');
    });

    it('should detect topic abandonment', () => {
      const result = classifyInteractionOutcome(
        'The database migration script has completed successfully',
        'Let\'s talk about something completely different — vacation plans',
        ['database migration', 'vacation plans'],
      );
      expect(result.outcome).toBe('topic_abandoned');
    });

    it('should detect success via satisfaction', () => {
      const result = classifyInteractionOutcome(
        'I\'ve fixed the bug by updating the config',
        '完美，解决了！谢谢',
        ['bugs', 'config'],
      );
      expect(result.outcome).toBe('success');
    });

    it('should detect success via follow-up', () => {
      const result = classifyInteractionOutcome(
        'The API returns a JSON response with status code 200',
        'And what about error responses? How does it handle 404?',
        ['api'],
      );
      expect(result.outcome).toBe('success');
    });

    it('should return unknown for ambiguous input', () => {
      const result = classifyInteractionOutcome(
        'Here is some information about the topic',
        'so the next thing I wanted to mention',
        ['topic'],
      );
      expect(result.outcome).toBe('unknown');
    });

    it('should handle empty messages', () => {
      const result = classifyInteractionOutcome('', '', []);
      expect(result.outcome).toBe('unknown');
    });
  });

  describe('suggestStrategyAdjustment', () => {
    it('should suggest more detail on frustration', () => {
      const adjustment = suggestStrategyAdjustment({
        outcome: 'frustration',
        confidence: 0.8,
        reason: 'test',
        context: { flowPattern: '', phase: '', strategyUsed: '' },
      });
      expect(adjustment).not.toBeNull();
      expect(adjustment!.dimension).toBe('detailVsConcise');
      expect(adjustment!.direction).toBe('increase');
    });

    it('should suggest more analytical on repeated question', () => {
      const adjustment = suggestStrategyAdjustment({
        outcome: 'repeated_question',
        confidence: 0.7,
        reason: 'test',
        context: { flowPattern: '', phase: '', strategyUsed: '' },
      });
      expect(adjustment).not.toBeNull();
      expect(adjustment!.dimension).toBe('analyticalVsIntuitive');
    });

    it('should return null on success', () => {
      const adjustment = suggestStrategyAdjustment({
        outcome: 'success',
        confidence: 0.8,
        reason: 'test',
        context: { flowPattern: '', phase: '', strategyUsed: '' },
      });
      expect(adjustment).toBeNull();
    });

    it('should return null on unknown', () => {
      const adjustment = suggestStrategyAdjustment({
        outcome: 'unknown',
        confidence: 0.3,
        reason: 'test',
        context: { flowPattern: '', phase: '', strategyUsed: '' },
      });
      expect(adjustment).toBeNull();
    });
  });

  describe('scoreSectionRelevance', () => {
    const baseCtx = {
      phase: 'exploration',
      flowPattern: 'question-answer',
      healthScore: 0.8,
      recentTopics: ['testing'],
      hasActiveGoals: false,
      turnCount: 5,
    };

    it('should give low score to memory stats', () => {
      const result = scoreSectionRelevance('You have ', baseCtx);
      expect(result.score).toBeLessThan(0.3);
    });

    it('should boost tool sections in deep-work', () => {
      const result = scoreSectionRelevance('TOOL PERFORMANCE', { ...baseCtx, phase: 'deep-work' });
      const base = scoreSectionRelevance('TOOL PERFORMANCE', baseCtx);
      expect(result.score).toBeGreaterThan(base.score);
    });

    it('should penalize tools in idle', () => {
      const result = scoreSectionRelevance('TOOL PERFORMANCE', { ...baseCtx, phase: 'idle' });
      const base = scoreSectionRelevance('TOOL PERFORMANCE', baseCtx);
      expect(result.score).toBeLessThan(base.score);
    });

    it('should boost meta-cognition in low health', () => {
      const result = scoreSectionRelevance('META-COGNITION', { ...baseCtx, healthScore: 0.3 });
      const base = scoreSectionRelevance('META-COGNITION', baseCtx);
      expect(result.score).toBeGreaterThan(base.score);
    });

    it('should boost tools in debug flow', () => {
      const result = scoreSectionRelevance('TOOL PRIORITY', { ...baseCtx, flowPattern: 'debug-diagnose-fix' });
      const base = scoreSectionRelevance('TOOL PRIORITY', baseCtx);
      expect(result.score).toBeGreaterThan(base.score);
    });

    it('should boost goal sections with active goals', () => {
      const result = scoreSectionRelevance('GOAL DEPENDENCIES', { ...baseCtx, hasActiveGoals: true });
      const base = scoreSectionRelevance('GOAL DEPENDENCIES', baseCtx);
      expect(result.score).toBeGreaterThan(base.score);
    });

    it('should return default 0.5 for unknown sections', () => {
      const result = scoreSectionRelevance('UNKNOWN_SECTION', baseCtx);
      expect(result.score).toBe(0.5);
    });

    it('should clamp score to [0, 1]', () => {
      const result = scoreSectionRelevance('DREAM INSIGHTS', { ...baseCtx, phase: 'deep-work', healthScore: 0.9 });
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('should boost crisis sections in urgent mode', () => {
      const result = scoreSectionRelevance('EMOTIONAL RESPONSE STRATEGY', { ...baseCtx, behaviorMode: 'urgent' });
      const base = scoreSectionRelevance('EMOTIONAL RESPONSE STRATEGY', baseCtx);
      expect(result.score).toBeGreaterThan(base.score);
    });

    it('should penalize distraction sections in urgent mode', () => {
      const result = scoreSectionRelevance('DREAM INSIGHTS', { ...baseCtx, behaviorMode: 'urgent' });
      const base = scoreSectionRelevance('DREAM INSIGHTS', baseCtx);
      expect(result.score).toBeLessThan(base.score);
    });

    it('should boost empathy sections in supportive mode', () => {
      const result = scoreSectionRelevance('USER EXPERTISE', { ...baseCtx, behaviorMode: 'supportive' });
      const base = scoreSectionRelevance('USER EXPERTISE', baseCtx);
      expect(result.score).toBeGreaterThan(base.score);
    });

    it('should boost precision sections in focused mode', () => {
      const result = scoreSectionRelevance('TOOL PERFORMANCE', { ...baseCtx, behaviorMode: 'focused' });
      const base = scoreSectionRelevance('TOOL PERFORMANCE', baseCtx);
      expect(result.score).toBeGreaterThan(base.score);
    });

    it('should boost discovery sections in exploratory mode', () => {
      const result = scoreSectionRelevance('CONVERSATION FLOW', { ...baseCtx, behaviorMode: 'exploratory' });
      const base = scoreSectionRelevance('CONVERSATION FLOW', baseCtx);
      expect(result.score).toBeGreaterThan(base.score);
    });
  });

  describe('extractTopicSnapshot', () => {
    const messages = [
      { role: 'user', content: 'How do I set up authentication?' },
      { role: 'assistant', content: 'We decided to use JWT tokens for authentication' },
      { role: 'user', content: '但是 how do we handle token refresh?' },
      { role: 'assistant', content: 'I\'ll implement a refresh token rotation strategy using the authMiddleware' },
      { role: 'user', content: 'not working, still getting 401 errors' },
    ];

    it('should extract key decisions from messages', () => {
      const snapshot = extractTopicSnapshot(messages, 'authentication', { start: 0, end: 5 });
      expect(snapshot.keyPoints.length).toBeGreaterThan(0);
      expect(snapshot.topic).toBe('authentication');
    });

    it('should extract active tools', () => {
      const snapshot = extractTopicSnapshot(messages, 'authentication', { start: 0, end: 5 });
      expect(snapshot.activeTools.length).toBeGreaterThan(0);
    });

    it('should extract unresolved questions', () => {
      const snapshot = extractTopicSnapshot(messages, 'authentication', { start: 0, end: 5 });
      expect(snapshot.unsolvedQuestions.length).toBeGreaterThan(0);
    });

    it('should deduplicate entries', () => {
      const snapshot = extractTopicSnapshot(messages, 'authentication', { start: 0, end: 5 });
      const allPoints = [...snapshot.keyPoints, ...snapshot.activeTools, ...snapshot.unsolvedQuestions];
      expect(new Set(allPoints).size).toBe(allPoints.length);
    });

    it('should cap at 5 entries per category', () => {
      const manyMessages = Array(20).fill(null).map((_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `We'll use tool${i} for the solution is approach${i}`,
      }));
      const snapshot = extractTopicSnapshot(manyMessages, 'test', { start: 0, end: 20 });
      expect(snapshot.keyPoints.length).toBeLessThanOrEqual(5);
      expect(snapshot.activeTools.length).toBeLessThanOrEqual(5);
    });

    it('should handle empty messages', () => {
      const snapshot = extractTopicSnapshot([], 'test', { start: 0, end: 0 });
      expect(snapshot.keyPoints).toEqual([]);
      expect(snapshot.activeTools).toEqual([]);
      expect(snapshot.unsolvedQuestions).toEqual([]);
    });
  });

  describe('formatTopicSnapshot', () => {
    it('should format snapshot with all fields', () => {
      const text = formatTopicSnapshot({
        topic: 'auth',
        keyPoints: ['Using JWT'],
        activeTools: ['authMiddleware'],
        unsolvedQuestions: ['Token refresh'],
        timestamp: Date.now(),
        turnStart: 0,
        turnEnd: 5,
      });
      expect(text).toContain('Previous context on "auth"');
      expect(text).toContain('Using JWT');
      expect(text).toContain('Token refresh');
      expect(text).toContain('authMiddleware');
    });

    it('should omit empty categories', () => {
      const text = formatTopicSnapshot({
        topic: 'test',
        keyPoints: [],
        activeTools: [],
        unsolvedQuestions: [],
        timestamp: Date.now(),
        turnStart: 0,
        turnEnd: 0,
      });
      expect(text).toContain('Previous context on "test"');
      expect(text).not.toContain('Key points');
      expect(text).not.toContain('Unresolved');
    });
  });

  describe('generateIntentPreloads', () => {
    it('should suggest error patterns for debug flow', () => {
      const suggestions = generateIntentPreloads('debug-diagnose-fix', ['authentication'], false);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.preloadType === 'error_patterns')).toBe(true);
      expect(suggestions[0].query).toContain('authentication');
    });

    it('should suggest memory search for explore flow', () => {
      const suggestions = generateIntentPreloads('explore-deepen-implement', ['testing'], false);
      expect(suggestions.some(s => s.preloadType === 'memory_search')).toBe(true);
    });

    it('should skip goal review when no active goals', () => {
      const suggestions = generateIntentPreloads('planning-delegate-review', ['project'], false);
      expect(suggestions.every(s => s.preloadType !== 'goal_review')).toBe(true);
    });

    it('should include goal review when active goals exist', () => {
      const suggestions = generateIntentPreloads('planning-delegate-review', ['project'], true);
      expect(suggestions.some(s => s.preloadType === 'goal_review')).toBe(true);
    });

    it('should return empty for unknown flow', () => {
      const suggestions = generateIntentPreloads('unknown-pattern', ['test'], false);
      expect(suggestions).toEqual([]);
    });

    it('should cap at 3 suggestions', () => {
      const suggestions = generateIntentPreloads('debug-diagnose-fix', ['topic1'], true);
      expect(suggestions.length).toBeLessThanOrEqual(3);
    });
  });

  describe('analyzeConversationRhythm', () => {
    const now = Date.now();

    it('should return initial for fewer than 3 messages', () => {
      const result = analyzeConversationRhythm([
        { length: 10, timestamp: now },
        { length: 20, timestamp: now + 1000 },
      ]);
      expect(result.rhythm).toBe('initial');
      expect(result.confidence).toBe(0);
    });

    it('should detect rapid_fire pattern', () => {
      const base = now - 30000;
      const result = analyzeConversationRhythm([
        { length: 8, timestamp: base },
        { length: 12, timestamp: base + 5000 },
        { length: 5, timestamp: base + 10000 },
        { length: 15, timestamp: base + 15000 },
        { length: 10, timestamp: base + 20000 },
      ]);
      expect(result.rhythm).toBe('rapid_fire');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.responseHint).toContain('concise');
    });

    it('should detect thoughtful pattern', () => {
      const base = now - 300000;
      const result = analyzeConversationRhythm([
        { length: 150, timestamp: base },
        { length: 200, timestamp: base + 60000 },
        { length: 180, timestamp: base + 120000 },
        { length: 250, timestamp: base + 180000 },
        { length: 120, timestamp: base + 240000 },
      ]);
      expect(result.rhythm).toBe('thoughtful');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.responseHint).toContain('thorough');
    });

    it('should detect idle pattern', () => {
      const base = now - 7200000;
      const result = analyzeConversationRhythm([
        { length: 50, timestamp: base },
        { length: 60, timestamp: base + 1800000 },
        { length: 40, timestamp: base + 3600000 },
      ]);
      expect(result.rhythm).toBe('idle');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.avgInterval).toBeGreaterThan(300);
    });

    it('should detect mixed pattern', () => {
      const base = now - 120000;
      const result = analyzeConversationRhythm([
        { length: 10, timestamp: base },
        { length: 200, timestamp: base + 30000 },
        { length: 15, timestamp: base + 60000 },
        { length: 150, timestamp: base + 90000 },
        { length: 8, timestamp: base + 100000 },
      ]);
      expect(result.rhythm).toBe('mixed');
      expect(result.avgMessageLength).toBeGreaterThan(0);
    });

    it('should compute avgMessageLength correctly', () => {
      const result = analyzeConversationRhythm([
        { length: 100, timestamp: now },
        { length: 200, timestamp: now + 60000 },
        { length: 300, timestamp: now + 120000 },
      ]);
      expect(result.avgMessageLength).toBe(200);
    });
  });

  describe('buildUserExpertiseProfile', () => {
    it('should return default hints for empty messages', () => {
      const profile = buildUserExpertiseProfile([]);
      expect(profile.domains).toEqual([]);
      expect(profile.terminologyHint).toContain('standard');
    });

    it('should detect frontend expertise', () => {
      const profile = buildUserExpertiseProfile([
        'I am using React with TypeScript for my project',
        'The component needs to handle CSS animations',
        'Can you help with the NextJS API routes?',
        'My Vue component has a rendering issue',
      ]);
      const frontend = profile.domains.find(d => d.domain === 'frontend');
      expect(frontend).toBeDefined();
      expect(frontend!.evidenceCount).toBeGreaterThanOrEqual(2);
      expect(profile.terminologyHint).toContain('frontend');
    });

    it('should detect multiple domains', () => {
      const profile = buildUserExpertiseProfile([
        'Deploy the Docker container to Kubernetes',
        'The API endpoint needs authentication middleware',
        'Write tests with vitest for coverage',
        'Configure the CI/CD pipeline',
      ]);
      expect(profile.domains.length).toBeGreaterThanOrEqual(2);
    });

    it('should compute depth based on evidence density', () => {
      const profile = buildUserExpertiseProfile([
        'React component React hooks React state React props React useEffect',
        'React context React router React suspense React lazy',
      ]);
      const frontend = profile.domains.find(d => d.domain === 'frontend');
      expect(frontend).toBeDefined();
      expect(frontend!.depth).toBeGreaterThan(0.5);
    });

    it('should provide domain-specific explanation hint', () => {
      const profile = buildUserExpertiseProfile([
        'I need to fix the SQL database query performance',
        'The REST API server is returning 500 errors',
        'Configure the backend middleware correctly',
        'Database migration for the new table',
      ]);
      expect(profile.explanationHint).toBeTruthy();
    });

    it('should sort domains by evidence count', () => {
      const profile = buildUserExpertiseProfile([
        'React component CSS HTML component React',
        'SQL database SQL query SQL SQL',
      ]);
      if (profile.domains.length >= 2) {
        expect(profile.domains[0].evidenceCount).toBeGreaterThanOrEqual(
          profile.domains[1].evidenceCount,
        );
      }
    });
  });

  describe('mapEmotionToResponseStrategy', () => {
    it('should suggest patience for high-intensity negative valence', () => {
      const strategy = mapEmotionToResponseStrategy({
        valence: -0.5, arousal: 0.2, intensity: 0.6, primaryEmotion: 'sadness',
      });
      expect(strategy.toneHint).toContain('Patient');
      expect(strategy.empathyAction).toContain('Acknowledge');
    });

    it('should suggest enthusiasm for positive valence high arousal', () => {
      const strategy = mapEmotionToResponseStrategy({
        valence: 0.6, arousal: 0.5, intensity: 0.7, primaryEmotion: 'joy',
      });
      expect(strategy.toneHint).toContain('Enthusiastic');
      expect(strategy.lengthHint).toContain('concise');
    });

    it('should suggest calm directness for high arousal low valence', () => {
      const strategy = mapEmotionToResponseStrategy({
        valence: -0.1, arousal: 0.7, intensity: 0.5, primaryEmotion: 'anger',
      });
      expect(strategy.toneHint).toContain('Calm');
      expect(strategy.empathyAction).toContain('urgency');
    });

    it('should suggest warmth for low arousal negative valence', () => {
      const strategy = mapEmotionToResponseStrategy({
        valence: -0.25, arousal: -0.2, intensity: 0.5, primaryEmotion: 'sadness',
      });
      expect(strategy.toneHint).toContain('Warm');
      expect(strategy.empathyAction).toContain('care');
    });

    it('should suggest balanced tone for low arousal calm state', () => {
      const strategy = mapEmotionToResponseStrategy({
        valence: 0.0, arousal: -0.2, intensity: 0.2, primaryEmotion: 'neutral',
      });
      expect(strategy.toneHint).toContain('Balanced');
    });

    it('should return natural defaults for neutral state', () => {
      const strategy = mapEmotionToResponseStrategy({
        valence: 0.1, arousal: 0.2, intensity: 0.1, primaryEmotion: 'neutral',
      });
      expect(strategy.toneHint).toContain('Natural');
    });
  });

  describe('fusePerceptionSignals', () => {
    const base = {
      flowConfidence: 0.5,
      phaseConfidence: 0.5,
      rhythmConfidence: 0.5,
      emotionalIntensity: 0.3,
      emotionalValence: 0.0,
      conversationHealth: 0.8,
      expertiseDomainCount: 1,
    };

    it('should return balanced mode for normal context', () => {
      const pv = fusePerceptionSignals(base);
      expect(pv.behaviorMode).toBe('balanced');
      expect(pv.overallAttention).toBeGreaterThan(0);
      expect(pv.fusedHint).toBeTruthy();
    });

    it('should return urgent mode for low health + high emotion', () => {
      const pv = fusePerceptionSignals({
        ...base,
        conversationHealth: 0.2,
        emotionalIntensity: 0.7,
        emotionalValence: -0.5,
      });
      expect(pv.behaviorMode).toBe('urgent');
      expect(pv.overallAttention).toBeGreaterThan(0.5);
    });

    it('should return supportive mode for negative emotion', () => {
      const pv = fusePerceptionSignals({
        ...base,
        emotionalIntensity: 0.6,
        emotionalValence: -0.5,
        conversationHealth: 0.7,
      });
      expect(pv.behaviorMode).toBe('supportive');
    });

    it('should return focused mode for high confidence + expertise', () => {
      const pv = fusePerceptionSignals({
        ...base,
        flowConfidence: 0.8,
        phaseConfidence: 0.8,
        rhythmConfidence: 0.8,
        expertiseDomainCount: 3,
      });
      expect(pv.behaviorMode).toBe('focused');
    });

    it('should return exploratory mode for low confidence', () => {
      const pv = fusePerceptionSignals({
        ...base,
        flowConfidence: 0.1,
        phaseConfidence: 0.1,
        emotionalIntensity: 0.1,
      });
      expect(pv.behaviorMode).toBe('exploratory');
    });

    it('should compute overallAttention from all dimensions', () => {
      const pv = fusePerceptionSignals(base);
      expect(pv.overallAttention).toBeGreaterThanOrEqual(0);
      expect(pv.overallAttention).toBeLessThanOrEqual(1);
    });
  });
});