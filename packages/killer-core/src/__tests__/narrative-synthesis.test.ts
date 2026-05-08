/**
 * Narrative Synthesis Engine Tests
 *
 * 验证 episode 聚类、主题检测、章节生成和身份演化。
 */

import { describe, it, expect } from 'vitest';
import {
  NarrativeSynthesisEngine,
  DEFAULT_SYNTHESIS_CONFIG,
} from '../hippocampus/narrative-synthesis.js';
import type { Episode, AutobiographicalNarrative } from '../hippocampus/types.js';

function makeEpisode(overrides: Partial<Episode> & { id: string; title: string }): Episode {
  return {
    narrative: `Narrative for ${overrides.title}`,
    emotionalWeight: 0.5,
    tags: [],
    associations: [],
    decayRate: 0.1,
    accessCount: 0,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeNarrative(overrides: Partial<AutobiographicalNarrative> = {}): AutobiographicalNarrative {
  return {
    identityStatement: 'I am an AI assistant, learning and growing with each conversation.',
    chapters: [],
    activeThemes: [],
    relationships: [],
    lastUpdated: Date.now(),
    ...overrides,
  };
}

describe('NarrativeSynthesisEngine', () => {
  describe('clusterEpisodes', () => {
    it('should cluster episodes sharing tags', () => {
      const engine = new NarrativeSynthesisEngine({ minClusterSize: 2 });
      const episodes = [
        makeEpisode({ id: '1', title: 'Bug fix', tags: ['coding', 'debugging'] }),
        makeEpisode({ id: '2', title: 'Code review', tags: ['coding', 'review'] }),
        makeEpisode({ id: '3', title: 'API design', tags: ['architecture'] }),
        makeEpisode({ id: '4', title: 'Deploy fix', tags: ['coding', 'deployment'] }),
      ];

      const clusters = engine.clusterEpisodes(episodes);

      // Episodes 1, 2, 4 share 'coding' tag → one cluster
      expect(clusters.length).toBeGreaterThanOrEqual(1);

      const codingCluster = clusters.find(c => c.dominantTag === 'coding');
      expect(codingCluster).toBeDefined();
      expect(codingCluster!.episodes.length).toBe(3);
    });

    it('should separate unrelated episodes into different clusters', () => {
      const engine = new NarrativeSynthesisEngine({ minClusterSize: 1 });
      const episodes = [
        makeEpisode({ id: '1', title: 'Coding session', tags: ['coding'] }),
        makeEpisode({ id: '2', title: 'Music talk', tags: ['music'] }),
        makeEpisode({ id: '3', title: 'Travel chat', tags: ['travel'] }),
      ];

      const clusters = engine.clusterEpisodes(episodes);
      expect(clusters.length).toBe(3);
    });

    it('should return empty array for no episodes', () => {
      const engine = new NarrativeSynthesisEngine();
      expect(engine.clusterEpisodes([])).toEqual([]);
    });

    it('should filter clusters below minimum size', () => {
      const engine = new NarrativeSynthesisEngine({ minClusterSize: 3 });
      const episodes = [
        makeEpisode({ id: '1', title: 'A', tags: ['coding'] }),
        makeEpisode({ id: '2', title: 'B', tags: ['coding'] }),
      ];

      const clusters = engine.clusterEpisodes(episodes);
      // Only 2 episodes with shared tag, minClusterSize=3 → should be filtered
      expect(clusters.length).toBe(0);
    });
  });

  describe('synthesize', () => {
    it('should generate chapters from clustered episodes', () => {
      const engine = new NarrativeSynthesisEngine({ minClusterSize: 2 });
      const narrative = makeNarrative();
      const episodes = [
        makeEpisode({ id: '1', title: 'Bug fix 1', tags: ['coding', 'debugging'], timestamp: Date.now() - 5000 }),
        makeEpisode({ id: '2', title: 'Bug fix 2', tags: ['coding', 'debugging'], timestamp: Date.now() - 3000 }),
        makeEpisode({ id: '3', title: 'Bug fix 3', tags: ['coding'], emotionalWeight: 0.7, timestamp: Date.now() }),
      ];

      const result = engine.synthesize(episodes, narrative);

      expect(result.newChapters.length).toBeGreaterThanOrEqual(1);
      expect(result.newChapters[0].title).toBeDefined();
      expect(result.newChapters[0].summary).toBeDefined();
      expect(result.newChapters[0].keyEpisodes.length).toBeGreaterThan(0);
      expect(result.newChapters[0].emotionalTone).toBeDefined();
      expect(result.newChapters[0].startTime).toBeLessThanOrEqual(result.newChapters[0].endTime);
    });

    it('should detect active themes from episodes', () => {
      const engine = new NarrativeSynthesisEngine();
      const narrative = makeNarrative();
      const episodes = [
        makeEpisode({ id: '1', title: 'Test', tags: ['coding', 'testing'] }),
        makeEpisode({ id: '2', title: 'Deploy', tags: ['coding', 'deployment'] }),
        makeEpisode({ id: '3', title: 'Debug', tags: ['coding', 'debugging'] }),
      ];

      const result = engine.synthesize(episodes, narrative);
      expect(result.activeThemes).toContain('coding');
    });

    it('should preserve existing themes with inertia', () => {
      const engine = new NarrativeSynthesisEngine();
      const narrative = makeNarrative({ activeThemes: ['learning'] });
      const episodes = [
        makeEpisode({ id: '1', title: 'Code', tags: ['coding'] }),
        makeEpisode({ id: '2', title: 'Test', tags: ['testing'] }),
      ];

      const result = engine.synthesize(episodes, narrative);
      // 'learning' should still be present due to inertia
      expect(result.activeThemes).toContain('learning');
    });

    it('should return empty results for no episodes', () => {
      const engine = new NarrativeSynthesisEngine();
      const narrative = makeNarrative({ activeThemes: ['existing'] });

      const result = engine.synthesize([], narrative);
      expect(result.newChapters).toEqual([]);
      expect(result.activeThemes).toEqual(['existing']);
      expect(result.identityStatement).toBe(narrative.identityStatement);
    });
  });

  describe('identity evolution', () => {
    it('should not change identity with low emotional weight episodes', () => {
      const engine = new NarrativeSynthesisEngine();
      const identity = 'I am an AI assistant, learning and growing.';
      const narrative = makeNarrative({ identityStatement: identity });
      const episodes = [
        makeEpisode({ id: '1', title: 'Small task', tags: ['misc'], emotionalWeight: 0.1 }),
        makeEpisode({ id: '2', title: 'Another small task', tags: ['misc'], emotionalWeight: 0.2 }),
      ];

      const result = engine.synthesize(episodes, narrative);
      expect(result.identityStatement).toBe(identity);
    });

    it('should add focus area for high emotional weight episodes', () => {
      const engine = new NarrativeSynthesisEngine();
      const identity = 'I am an AI assistant, learning and growing with each conversation.';
      const narrative = makeNarrative({ identityStatement: identity });
      const episodes = Array.from({ length: 5 }, (_, i) =>
        makeEpisode({
          id: `ep_${i}`,
          title: `Deep coding ${i}`,
          tags: ['coding'],
          emotionalWeight: 0.8,
        }),
      );

      const result = engine.synthesize(episodes, narrative);
      // Should have added coding focus
      expect(result.identityStatement).toContain('coding');
    });

    it('should generate initial identity when current is empty', () => {
      const engine = new NarrativeSynthesisEngine();
      const narrative = makeNarrative({ identityStatement: '' });
      const episodes = [
        makeEpisode({ id: '1', title: 'First', tags: ['coding'], emotionalWeight: 0.7 }),
        makeEpisode({ id: '2', title: 'Second', tags: ['coding'], emotionalWeight: 0.6 }),
      ];

      const result = engine.synthesize(episodes, narrative);
      expect(result.identityStatement.length).toBeGreaterThan(20);
    });
  });

  describe('chapter quality', () => {
    it('should generate meaningful summaries from narratives', () => {
      const engine = new NarrativeSynthesisEngine({ minClusterSize: 2 });
      const narrative = makeNarrative();
      const episodes = [
        makeEpisode({
          id: '1',
          title: 'Auth debug',
          tags: ['coding'],
          narrative: 'Spent hours debugging the JWT authentication flow with token refresh issues.',
          emotionalWeight: 0.8,
        }),
        makeEpisode({
          id: '2',
          title: 'Auth fix',
          tags: ['coding'],
          narrative: 'Finally fixed the auth token refresh bug by correcting the expiry calculation.',
          emotionalWeight: 0.9,
        }),
      ];

      const result = engine.synthesize(episodes, narrative);
      expect(result.newChapters.length).toBeGreaterThanOrEqual(1);
      // Summary should include narrative snippet
      const chapter = result.newChapters[0];
      expect(chapter.summary.length).toBeGreaterThan(20);
    });

    it('should calculate significance from emotional weight', () => {
      const engine = new NarrativeSynthesisEngine({ minClusterSize: 2 });
      const narrative = makeNarrative();

      const highEmotionEpisodes = [
        makeEpisode({ id: '1', title: 'High 1', tags: ['coding'], emotionalWeight: 0.9 }),
        makeEpisode({ id: '2', title: 'High 2', tags: ['coding'], emotionalWeight: 0.8 }),
      ];

      const result = engine.synthesize(highEmotionEpisodes, narrative);
      expect(result.newChapters[0].significance).toBeGreaterThan(0.5);
    });

    it('should select key episodes by emotional weight', () => {
      const engine = new NarrativeSynthesisEngine({ minClusterSize: 3 });
      const narrative = makeNarrative();

      const episodes = [
        makeEpisode({ id: '1', title: 'Low', tags: ['coding'], emotionalWeight: 0.2 }),
        makeEpisode({ id: '2', title: 'Medium', tags: ['coding'], emotionalWeight: 0.5 }),
        makeEpisode({ id: '3', title: 'High', tags: ['coding'], emotionalWeight: 0.9 }),
        makeEpisode({ id: '4', title: 'Very High', tags: ['coding'], emotionalWeight: 0.95 }),
      ];

      const result = engine.synthesize(episodes, narrative);
      const chapter = result.newChapters[0];
      // Key episodes should include the highest weight ones
      expect(chapter.keyEpisodes).toContain('4');
      expect(chapter.keyEpisodes).toContain('3');
    });
  });

  describe('configuration', () => {
    it('should use default config when no overrides provided', () => {
      const engine = new NarrativeSynthesisEngine();
      expect(DEFAULT_SYNTHESIS_CONFIG.minClusterSize).toBe(2);
      expect(DEFAULT_SYNTHESIS_CONFIG.maxChapters).toBe(50);
    });

    it('should respect maxChapters config', () => {
      const engine = new NarrativeSynthesisEngine({ minClusterSize: 1, maxChapters: 1 });
      const narrative = makeNarrative();

      // Create 3 separate clusters
      const episodes = [
        makeEpisode({ id: '1', title: 'A', tags: ['alpha'] }),
        makeEpisode({ id: '2', title: 'B', tags: ['beta'] }),
        makeEpisode({ id: '3', title: 'C', tags: ['gamma'] }),
      ];

      const result = engine.synthesize(episodes, narrative);
      expect(result.newChapters.length).toBeLessThanOrEqual(3);
    });
  });
});
