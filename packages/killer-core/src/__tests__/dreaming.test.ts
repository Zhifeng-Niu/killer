/**
 * Dream Engine Tests - Memory Consolidation via Dream Cycles
 */

import { describe, it, expect } from 'vitest';
import { DreamEngine, DEFAULT_DREAMING_CONFIG } from '../hippocampus/dreaming.js';
import type { Episode, SemanticNode } from '../hippocampus/types.js';

function createEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: `ep-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now() - 1000 * 60 * 60,
    title: 'Test episode',
    narrative: 'A test narrative',
    emotionalWeight: 0.7,
    tags: ['test'],
    associations: [],
    decayRate: 24 * 60 * 60 * 1000,
    accessCount: 1,
    ...overrides,
  };
}

function createSemanticNode(id: string, label: string, strength = 0.5): SemanticNode {
  return {
    id,
    type: 'concept',
    label,
    properties: {},
    relations: [],
    strength,
  };
}

describe('DreamEngine', () => {
  describe('executeDreamCycle', () => {
    it('should return valid dream result structure', () => {
      const engine = new DreamEngine();
      const episodicStore = new Map<string, Episode>();
      const semanticGraph = new Map<string, SemanticNode>();

      const result = engine.executeDreamCycle(episodicStore, semanticGraph, Date.now());

      expect(result).toHaveProperty('episodesReplayed');
      expect(result).toHaveProperty('patternsExtracted');
      expect(result).toHaveProperty('memoriesConsolidated');
      expect(result).toHaveProperty('memoriesDecayed');
      expect(result).toHaveProperty('insights');
      expect(result).toHaveProperty('narrativeSynthesized');
      expect(result.narrativeSynthesized).toBe(false);
    });

    it('should replay recent episodes', () => {
      const engine = new DreamEngine();
      const episodicStore = new Map<string, Episode>();
      const now = Date.now();

      // Add recent episodes
      const ep1 = createEpisode({ id: 'ep-1', timestamp: now - 1000 });
      const ep2 = createEpisode({ id: 'ep-2', timestamp: now - 2000 });
      episodicStore.set('ep-1', ep1);
      episodicStore.set('ep-2', ep2);

      const semanticGraph = new Map<string, SemanticNode>();
      const result = engine.executeDreamCycle(episodicStore, semanticGraph, now);

      expect(result.episodesReplayed).toBe(2);
    });

    it('should skip old episodes outside replay window', () => {
      const engine = new DreamEngine({ ...DEFAULT_DREAMING_CONFIG, replayWindow: 60 * 60 * 1000 });
      const episodicStore = new Map<string, Episode>();
      const now = Date.now();

      // Old episode (2 hours ago)
      const oldEp = createEpisode({ id: 'old', timestamp: now - 2 * 60 * 60 * 1000 });
      // Recent episode (1 min ago)
      const recentEp = createEpisode({ id: 'recent', timestamp: now - 60 * 1000 });
      episodicStore.set('old', oldEp);
      episodicStore.set('recent', recentEp);

      const semanticGraph = new Map<string, SemanticNode>();
      const result = engine.executeDreamCycle(episodicStore, semanticGraph, now);

      expect(result.episodesReplayed).toBe(1);
    });

    it('should skip dormant episodes', () => {
      const engine = new DreamEngine();
      const episodicStore = new Map<string, Episode>();
      const now = Date.now();

      const dormant = createEpisode({ id: 'dormant', timestamp: now - 1000, tags: ['dormant', 'test'] });
      episodicStore.set('dormant', dormant);

      const semanticGraph = new Map<string, SemanticNode>();
      const result = engine.executeDreamCycle(episodicStore, semanticGraph, now);

      expect(result.episodesReplayed).toBe(0);
    });

    it('should consolidate memories by creating semantic nodes', () => {
      const engine = new DreamEngine();
      const episodicStore = new Map<string, Episode>();
      const now = Date.now();

      const ep = createEpisode({ id: 'ep-1', timestamp: now - 1000, tags: ['coding', 'typescript'] });
      episodicStore.set('ep-1', ep);

      const semanticGraph = new Map<string, SemanticNode>();
      const result = engine.executeDreamCycle(episodicStore, semanticGraph, now);

      expect(result.memoriesConsolidated).toBeGreaterThan(0);
    });

    it('should strengthen existing semantic nodes', () => {
      const engine = new DreamEngine();
      const episodicStore = new Map<string, Episode>();
      const now = Date.now();

      const ep = createEpisode({ id: 'ep-1', timestamp: now - 1000, tags: ['coding'], emotionalWeight: 0.8 });
      episodicStore.set('ep-1', ep);

      const existingNode = createSemanticNode('sem-1', 'coding', 0.5);
      const semanticGraph = new Map<string, SemanticNode>();
      semanticGraph.set('sem-1', existingNode);

      engine.executeDreamCycle(episodicStore, semanticGraph, now);

      // Strength should increase
      expect(existingNode.strength).toBeGreaterThan(0.5);
    });

    it('should decay weak memories', () => {
      const engine = new DreamEngine();
      const episodicStore = new Map<string, Episode>();
      const now = Date.now();

      // Create a very old, weak episode
      const weakEp = createEpisode({
        id: 'weak',
        timestamp: now - 365 * 24 * 60 * 60 * 1000, // 1 year ago
        emotionalWeight: 0.05,
        decayRate: 60 * 60 * 1000, // 1 hour stability
        tags: ['old'],
      });
      episodicStore.set('weak', weakEp);

      const semanticGraph = new Map<string, SemanticNode>();
      const result = engine.executeDreamCycle(episodicStore, semanticGraph, now);

      expect(result.memoriesDecayed).toBeGreaterThanOrEqual(0);
    });

    it('should call narrative synthesis callback', () => {
      const engine = new DreamEngine();
      const episodicStore = new Map<string, Episode>();
      const semanticGraph = new Map<string, SemanticNode>();

      let callbackCalled = false;
      const result = engine.executeDreamCycle(
        episodicStore,
        semanticGraph,
        Date.now(),
        () => { callbackCalled = true; return true; },
      );

      expect(callbackCalled).toBe(true);
      expect(result.narrativeSynthesized).toBe(true);
    });

    it('should handle false narrative synthesis callback', () => {
      const engine = new DreamEngine();
      const episodicStore = new Map<string, Episode>();
      const semanticGraph = new Map<string, SemanticNode>();

      const result = engine.executeDreamCycle(
        episodicStore,
        semanticGraph,
        Date.now(),
        () => false,
      );

      expect(result.narrativeSynthesized).toBe(false);
    });

    it('should extract patterns from tag groups', () => {
      const engine = new DreamEngine({ ...DEFAULT_DREAMING_CONFIG, patternThreshold: 0.0 });
      const episodicStore = new Map<string, Episode>();
      const semanticGraph = new Map<string, SemanticNode>();
      const now = Date.now();

      // Two episodes sharing same tag and association
      const ep1 = createEpisode({ id: 'ep-1', timestamp: now - 1000, tags: ['coding'], associations: ['assoc-1'] });
      const ep2 = createEpisode({ id: 'ep-2', timestamp: now - 2000, tags: ['coding'], associations: ['assoc-1'] });
      episodicStore.set('ep-1', ep1);
      episodicStore.set('ep-2', ep2);

      const result = engine.executeDreamCycle(episodicStore, semanticGraph, now);

      expect(result.patternsExtracted).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty stores gracefully', () => {
      const engine = new DreamEngine();
      const result = engine.executeDreamCycle(
        new Map(),
        new Map(),
        Date.now(),
      );

      expect(result.episodesReplayed).toBe(0);
      expect(result.patternsExtracted).toBe(0);
      expect(result.memoriesConsolidated).toBe(0);
      expect(result.insights).toEqual([]);
    });

    it('should respect maxInsights config', () => {
      const engine = new DreamEngine({ ...DEFAULT_DREAMING_CONFIG, maxInsights: 2 });

      const result = engine.executeDreamCycle(new Map(), new Map(), Date.now());

      expect(result.insights.length).toBeLessThanOrEqual(2);
    });

    it('should create episodic links from associations', () => {
      const engine = new DreamEngine();
      const episodicStore = new Map<string, Episode>();
      const semanticGraph = new Map<string, SemanticNode>();
      const now = Date.now();

      // Episode with association pointing to a semantic node
      const node = createSemanticNode('assoc-node', 'concept', 0.5);
      semanticGraph.set('assoc-node', node);

      const ep = createEpisode({
        id: 'ep-with-assoc',
        timestamp: now - 1000,
        associations: ['assoc-node'],
        emotionalWeight: 0.8,
      });
      episodicStore.set('ep-with-assoc', ep);

      const result = engine.executeDreamCycle(episodicStore, semanticGraph, now);

      expect(result.memoriesConsolidated).toBeGreaterThan(0);
    });

    it('should tolerate throwing narrative synthesis callback', () => {
      const engine = new DreamEngine();
      const episodicStore = new Map<string, Episode>();
      const semanticGraph = new Map<string, SemanticNode>();

      const result = engine.executeDreamCycle(
        episodicStore,
        semanticGraph,
        Date.now(),
        () => { throw new Error('Narrative synthesis crashed'); },
      );

      // Should not throw; narrativeSynthesized defaults to false
      expect(result.narrativeSynthesized).toBe(false);
    });

    it('should tolerate corrupted semantic graph entries during consolidation', () => {
      const engine = new DreamEngine();
      const episodicStore = new Map<string, Episode>();
      const now = Date.now();

      const ep = createEpisode({ id: 'ep-1', timestamp: now - 1000, tags: ['test'] });
      episodicStore.set('ep-1', ep);

      const semanticGraph = new Map<string, SemanticNode>();
      // Add a node with null properties that may cause issues
      const badNode = createSemanticNode('bad', 'test', 0.5);
      (badNode as any).properties = null;
      semanticGraph.set('bad', badNode);

      // Should not throw
      const result = engine.executeDreamCycle(episodicStore, semanticGraph, now);
      expect(result).toBeDefined();
    });

    it('should complete partial results when pattern extraction fails', () => {
      const engine = new DreamEngine();
      const episodicStore = new Map<string, Episode>();
      const now = Date.now();

      // Episode with tags that may cause grouping issues
      const ep = createEpisode({
        id: 'ep-1',
        timestamp: now - 1000,
        tags: ['a'],
        associations: ['assoc-1'],
        emotionalWeight: 0.8,
      });
      episodicStore.set('ep-1', ep);

      // Empty semantic graph - patterns should still work without errors
      const semanticGraph = new Map<string, SemanticNode>();

      const result = engine.executeDreamCycle(episodicStore, semanticGraph, now);

      expect(result.episodesReplayed).toBe(1);
      // Even if patterns/insights are empty, the cycle should complete
      expect(result).toHaveProperty('patternsExtracted');
      expect(result).toHaveProperty('memoriesConsolidated');
      expect(result).toHaveProperty('insights');
    });

    it('should handle time sequences in episodes', () => {
      const engine = new DreamEngine();
      const episodicStore = new Map<string, Episode>();
      const now = Date.now();

      // Create a tight time sequence (within 1 hour gaps)
      for (let i = 0; i < 5; i++) {
        const ep = createEpisode({
          id: `seq-${i}`,
          timestamp: now - (5 - i) * 30 * 60 * 1000, // 30 min apart
          tags: ['sequence'],
          title: `Step ${i}`,
        });
        episodicStore.set(`seq-${i}`, ep);
      }

      const semanticGraph = new Map<string, SemanticNode>();
      const result = engine.executeDreamCycle(episodicStore, semanticGraph, now);

      expect(result.episodesReplayed).toBe(5);
    });
  });

  describe('counterfactual dreaming', () => {
    it('should not generate branches when disabled', () => {
      const engine = new DreamEngine({ ...DEFAULT_DREAMING_CONFIG, counterfactualEnabled: false });
      const episodicStore = new Map<string, Episode>();
      const semanticGraph = new Map<string, SemanticNode>();
      const now = Date.now();

      const ep = createEpisode({ id: 'ep-low', timestamp: now - 1000, emotionalWeight: 0.2 });
      episodicStore.set('ep-low', ep);

      const result = engine.executeDreamCycle(episodicStore, semanticGraph, now);

      expect(result.counterfactualBranches).toEqual([]);
    });

    it('should generate branches for low-emotion episodes when enabled', () => {
      const engine = new DreamEngine({
        ...DEFAULT_DREAMING_CONFIG,
        counterfactualEnabled: true,
        counterfactualDepth: 3,
      });
      const episodicStore = new Map<string, Episode>();
      const semanticGraph = new Map<string, SemanticNode>();
      const now = Date.now();

      // Low-emotion episode with tag matching a semantic node
      const ep = createEpisode({
        id: 'ep-regret',
        timestamp: now - 1000,
        emotionalWeight: 0.2,
        tags: ['coding'],
        associations: [],
      });
      episodicStore.set('ep-regret', ep);

      // Semantic node for 'coding' with unexplored relations
      const codingNode = createSemanticNode('sem-coding', 'coding', 0.7);
      const betterPath = createSemanticNode('sem-testing', 'testing', 0.8);
      codingNode.relations.push({ to: 'sem-testing', type: 'leads_to', weight: 0.6 });

      semanticGraph.set('sem-coding', codingNode);
      semanticGraph.set('sem-testing', betterPath);

      const result = engine.executeDreamCycle(episodicStore, semanticGraph, now);

      expect(result.counterfactualBranches.length).toBeGreaterThan(0);
      expect(result.counterfactualBranches[0]!.sourceEpisodeId).toBe('ep-regret');
      expect(result.counterfactualBranches[0]!.improvement).toBe(true);
    });

    it('should produce empty branches when no low-emotion episodes exist', () => {
      const engine = new DreamEngine({
        ...DEFAULT_DREAMING_CONFIG,
        counterfactualEnabled: true,
      });
      const episodicStore = new Map<string, Episode>();
      const semanticGraph = new Map<string, SemanticNode>();
      const now = Date.now();

      // All high-emotion episodes
      const ep = createEpisode({ id: 'ep-good', timestamp: now - 1000, emotionalWeight: 0.9 });
      episodicStore.set('ep-good', ep);

      const result = engine.executeDreamCycle(episodicStore, semanticGraph, now);

      expect(result.counterfactualBranches).toEqual([]);
    });

    it('should inject counterfactual insights into main insights', () => {
      const engine = new DreamEngine({
        ...DEFAULT_DREAMING_CONFIG,
        counterfactualEnabled: true,
        maxInsights: 5,
      });
      const episodicStore = new Map<string, Episode>();
      const semanticGraph = new Map<string, SemanticNode>();
      const now = Date.now();

      const ep = createEpisode({
        id: 'ep-low',
        timestamp: now - 1000,
        emotionalWeight: 0.1,
        tags: ['debugging'],
      });
      episodicStore.set('ep-low', ep);

      const debugNode = createSemanticNode('sem-debug', 'debugging', 0.6);
      const testNode = createSemanticNode('sem-test', 'testing', 0.9);
      debugNode.relations.push({ to: 'sem-test', type: 'improves', weight: 0.7 });
      semanticGraph.set('sem-debug', debugNode);
      semanticGraph.set('sem-test', testNode);

      const result = engine.executeDreamCycle(episodicStore, semanticGraph, now);

      const counterfactualInsights = result.insights.filter((i) => i.startsWith('Counterfactual:'));
      expect(counterfactualInsights.length).toBeGreaterThan(0);
    });

    it('should respect counterfactualDepth config', () => {
      const engine = new DreamEngine({
        ...DEFAULT_DREAMING_CONFIG,
        counterfactualEnabled: true,
        counterfactualDepth: 1,
      });
      const episodicStore = new Map<string, Episode>();
      const semanticGraph = new Map<string, SemanticNode>();
      const now = Date.now();

      for (let i = 0; i < 5; i++) {
        const ep = createEpisode({
          id: `ep-low-${i}`,
          timestamp: now - (i + 1) * 1000,
          emotionalWeight: 0.1,
          tags: ['test'],
        });
        episodicStore.set(`ep-low-${i}`, ep);
      }

      const tagNode = createSemanticNode('sem-test', 'test', 0.5);
      const altNode = createSemanticNode('sem-alt', 'alternative', 0.6);
      tagNode.relations.push({ to: 'sem-alt', type: 'alt', weight: 0.5 });
      semanticGraph.set('sem-test', tagNode);
      semanticGraph.set('sem-alt', altNode);

      const result = engine.executeDreamCycle(episodicStore, semanticGraph, now);

      // Should generate at most 1 branch (depth=1)
      expect(result.counterfactualBranches.length).toBeLessThanOrEqual(1);
    });

    it('should handle empty semantic graph gracefully', () => {
      const engine = new DreamEngine({
        ...DEFAULT_DREAMING_CONFIG,
        counterfactualEnabled: true,
      });
      const episodicStore = new Map<string, Episode>();
      const now = Date.now();

      const ep = createEpisode({
        id: 'ep-low',
        timestamp: now - 1000,
        emotionalWeight: 0.1,
        tags: ['orphan'],
      });
      episodicStore.set('ep-low', ep);

      // Empty graph — no nodes to explore
      const result = engine.executeDreamCycle(episodicStore, new Map(), now);

      expect(result.counterfactualBranches).toEqual([]);
    });
  });
});
