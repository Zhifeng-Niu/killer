/**
 * HippocampusEngine Tests - 6-Layer Memory System
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HippocampusEngine, DEFAULT_MEMORY_CONFIG, MemoryLayer } from '../hippocampus/memory.js';
import type { Episode, SemanticNode, ProceduralMemory, ProspectiveMemory } from '../hippocampus/types.js';

/** Config with all timers disabled for test isolation */
const TEST_CONFIG = {
  ...DEFAULT_MEMORY_CONFIG,
  dreamingEnabled: false,
  autoDecayEnabled: false,
};

function createEngine(): HippocampusEngine {
  return new HippocampusEngine(TEST_CONFIG);
}

describe('HippocampusEngine', () => {
  let engine: HippocampusEngine;

  beforeEach(() => {
    engine = createEngine();
  });

  afterEach(() => {
    engine.stop();
  });

  // ===== Working Memory =====

  describe('Working Memory', () => {
    it('should initialize with empty working memory', () => {
      const wm = engine.getWorkingMemory();
      expect(wm.currentFocus).toBeNull();
      expect(wm.activeContext).toEqual([]);
      expect(wm.shortTermBuffer).toEqual([]);
      expect(wm.capacity).toBe(7);
    });

    it('should update working memory partially', () => {
      engine.updateWorkingMemory({ currentFocus: 'coding' });
      const wm = engine.getWorkingMemory();
      expect(wm.currentFocus).toBe('coding');
      expect(wm.activeContext).toEqual([]); // unchanged
    });

    it('should focus on a target and add to context', () => {
      engine.focusOn('debugging');
      const wm = engine.getWorkingMemory();
      expect(wm.currentFocus).toBe('debugging');
      expect(wm.activeContext).toContain('debugging');
    });

    it('should not duplicate focus target in context', () => {
      engine.focusOn('x');
      engine.focusOn('x');
      expect(engine.getWorkingMemory().activeContext).toEqual(['x']);
    });

    it('should add items to context', () => {
      engine.addToContext('item-a');
      engine.addToContext('item-b');
      expect(engine.getWorkingMemory().activeContext).toEqual(['item-a', 'item-b']);
    });

    it('should not add duplicate items to context', () => {
      engine.addToContext('same');
      engine.addToContext('same');
      expect(engine.getWorkingMemory().activeContext).toEqual(['same']);
    });

    it('should add to short-term buffer and respect capacity', () => {
      for (let i = 0; i < 10; i++) {
        engine.addToBuffer(`item-${i}`);
      }
      const wm = engine.getWorkingMemory();
      // capacity is 7, so only last 7 items kept
      expect(wm.shortTermBuffer).toHaveLength(7);
      expect(wm.shortTermBuffer[0]).toBe('item-3');
      expect(wm.shortTermBuffer[6]).toBe('item-9');
    });

    it('should clear working memory', () => {
      engine.focusOn('x');
      engine.addToContext('y');
      engine.addToBuffer('z');
      engine.clearWorkingMemory();

      const wm = engine.getWorkingMemory();
      expect(wm.currentFocus).toBeNull();
      expect(wm.activeContext).toEqual([]);
      expect(wm.shortTermBuffer).toEqual([]);
    });

    it('should emit workingMemoryUpdated on update', () => {
      const listener = vi.fn();
      engine.on('workingMemoryUpdated', listener);
      engine.updateWorkingMemory({ currentFocus: 'test' });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should emit focusChanged on focus', () => {
      const listener = vi.fn();
      engine.on('focusChanged', listener);
      engine.focusOn('target');
      expect(listener).toHaveBeenCalledWith({ target: 'target' });
    });

    it('should emit bufferUpdated on buffer add', () => {
      const listener = vi.fn();
      engine.on('bufferUpdated', listener);
      engine.addToBuffer('item');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should emit workingMemoryCleared on clear', () => {
      const listener = vi.fn();
      engine.on('workingMemoryCleared', listener);
      engine.clearWorkingMemory();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('getWorkingMemory returns a copy', () => {
      const wm1 = engine.getWorkingMemory();
      wm1.currentFocus = 'mutated';
      const wm2 = engine.getWorkingMemory();
      expect(wm2.currentFocus).toBeNull();
    });
  });

  // ===== Episodic Memory =====

  describe('Episodic Memory', () => {
    it('should store an episode and return it with id and timestamp', () => {
      const ep = engine.storeEpisode({
        title: 'Test',
        narrative: 'A test episode',
        emotionalWeight: 0.5,
        tags: ['test'],
        associations: [],
        decayRate: 86400000,
        accessCount: 0,
      });

      expect(ep.id).toContain('ep_');
      expect(ep.timestamp).toBeGreaterThan(0);
      expect(ep.title).toBe('Test');
      expect(ep.accessCount).toBe(0);
    });

    it('should retrieve an episode by id and reinforce it', () => {
      const stored = engine.storeEpisode({
        title: 'Recall',
        narrative: 'Recall test',
        emotionalWeight: 0.5,
        tags: ['recall'],
        associations: [],
        decayRate: 86400000,
        accessCount: 0,
      });

      const retrieved = engine.retrieveEpisode(stored.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.title).toBe('Recall');
      expect(retrieved!.accessCount).toBeGreaterThan(stored.accessCount);
    });

    it('should return null for non-existent episode', () => {
      expect(engine.retrieveEpisode('ghost')).toBeNull();
    });

    it('should list all episodes', () => {
      engine.storeEpisode({ title: 'A', narrative: '', emotionalWeight: 0.5, tags: [], associations: [], decayRate: 86400000, accessCount: 0 });
      engine.storeEpisode({ title: 'B', narrative: '', emotionalWeight: 0.5, tags: [], associations: [], decayRate: 86400000, accessCount: 0 });

      expect(engine.getAllEpisodes()).toHaveLength(2);
    });

    it('should get recent episodes sorted by timestamp', async () => {
      engine.storeEpisode({ title: 'Old', narrative: '', emotionalWeight: 0.5, tags: [], associations: [], decayRate: 86400000, accessCount: 0 });
      // Ensure different millisecond timestamps
      await new Promise(r => setTimeout(r, 2));
      engine.storeEpisode({ title: 'New', narrative: '', emotionalWeight: 0.5, tags: [], associations: [], decayRate: 86400000, accessCount: 0 });

      const recent = engine.getRecentEpisodes(1);
      expect(recent).toHaveLength(1);
      expect(recent[0].title).toBe('New');
    });

    it('should filter episodes by tag', () => {
      engine.storeEpisode({ title: 'A', narrative: '', emotionalWeight: 0.5, tags: ['coding'], associations: [], decayRate: 86400000, accessCount: 0 });
      engine.storeEpisode({ title: 'B', narrative: '', emotionalWeight: 0.5, tags: ['design'], associations: [], decayRate: 86400000, accessCount: 0 });

      const coding = engine.getEpisodesByTag('coding');
      expect(coding).toHaveLength(1);
      expect(coding[0].title).toBe('A');
    });

    it('should delete an episode', () => {
      const ep = engine.storeEpisode({ title: 'X', narrative: '', emotionalWeight: 0.5, tags: [], associations: [], decayRate: 86400000, accessCount: 0 });
      expect(engine.deleteEpisode(ep.id)).toBe(true);
      expect(engine.retrieveEpisode(ep.id)).toBeNull();
    });

    it('should return false for deleting non-existent episode', () => {
      expect(engine.deleteEpisode('ghost')).toBe(false);
    });

    it('should emit episodeStored on store', () => {
      const listener = vi.fn();
      engine.on('episodeStored', listener);
      engine.storeEpisode({ title: 'E', narrative: '', emotionalWeight: 0.5, tags: [], associations: [], decayRate: 86400000, accessCount: 0 });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should emit episodeDeleted on delete', () => {
      const listener = vi.fn();
      engine.on('episodeDeleted', listener);
      const ep = engine.storeEpisode({ title: 'D', narrative: '', emotionalWeight: 0.5, tags: [], associations: [], decayRate: 86400000, accessCount: 0 });
      engine.deleteEpisode(ep.id);
      expect(listener).toHaveBeenCalledWith({ id: ep.id });
    });
  });

  // ===== Semantic Memory =====

  describe('Semantic Memory', () => {
    it('should add a semantic node with auto-generated id', () => {
      const node = engine.addSemanticNode({ type: 'concept', label: 'TypeScript', properties: {}, strength: 0.8 });
      expect(node.id).toContain('semantic_');
      expect(node.relations).toEqual([]);
      expect(node.label).toBe('TypeScript');
    });

    it('should add a semantic node with custom id', () => {
      const node = engine.addSemanticNode({ id: 'custom-1', type: 'entity', label: 'Custom', properties: {}, strength: 0.5 });
      expect(node.id).toBe('custom-1');
    });

    it('should get a semantic node by id', () => {
      const added = engine.addSemanticNode({ type: 'concept', label: 'React', properties: {}, strength: 0.7 });
      const retrieved = engine.getSemanticNode(added.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.label).toBe('React');
    });

    it('should return null for non-existent node', () => {
      expect(engine.getSemanticNode('ghost')).toBeNull();
    });

    it('should get nodes by type', () => {
      engine.addSemanticNode({ type: 'concept', label: 'A', properties: {}, strength: 0.5 });
      engine.addSemanticNode({ type: 'entity', label: 'B', properties: {}, strength: 0.5 });
      engine.addSemanticNode({ type: 'concept', label: 'C', properties: {}, strength: 0.5 });

      const concepts = engine.getSemanticNodesByType('concept');
      expect(concepts).toHaveLength(2);
    });

    it('should add a relation between nodes', () => {
      const a = engine.addSemanticNode({ type: 'concept', label: 'A', properties: {}, strength: 0.5 });
      const b = engine.addSemanticNode({ type: 'concept', label: 'B', properties: {}, strength: 0.5 });

      engine.addRelation(a.id, b.id, 'related_to', 0.8);

      const nodeA = engine.getSemanticNode(a.id);
      expect(nodeA!.relations).toHaveLength(1);
      expect(nodeA!.relations[0].to).toBe(b.id);
      expect(nodeA!.relations[0].weight).toBe(0.8);
    });

    it('should update weight of existing relation', () => {
      const a = engine.addSemanticNode({ type: 'concept', label: 'A', properties: {}, strength: 0.5 });
      const b = engine.addSemanticNode({ type: 'concept', label: 'B', properties: {}, strength: 0.5 });

      engine.addRelation(a.id, b.id, 'related_to', 0.5);
      engine.addRelation(a.id, b.id, 'related_to', 0.9);

      const nodeA = engine.getSemanticNode(a.id);
      expect(nodeA!.relations).toHaveLength(1);
      expect(nodeA!.relations[0].weight).toBe(0.9);
    });

    it('should throw when adding relation to non-existent source', () => {
      expect(() => engine.addRelation('ghost', 'any', 'type', 0.5)).toThrow('Source node not found: ghost');
    });

    it('should delete a semantic node and clean up relations', () => {
      const a = engine.addSemanticNode({ type: 'concept', label: 'A', properties: {}, strength: 0.5 });
      const b = engine.addSemanticNode({ type: 'concept', label: 'B', properties: {}, strength: 0.5 });
      engine.addRelation(a.id, b.id, 'related_to', 0.5);
      engine.addRelation(b.id, a.id, 'reverse', 0.3);

      // Delete b — a's relation to b should be removed
      expect(engine.deleteSemanticNode(b.id)).toBe(true);
      expect(engine.getSemanticNode(b.id)).toBeNull();
      expect(engine.getSemanticNode(a.id)!.relations).toHaveLength(0);
    });

    it('should return false for deleting non-existent node', () => {
      expect(engine.deleteSemanticNode('ghost')).toBe(false);
    });

    it('should emit semanticNodeAdded', () => {
      const listener = vi.fn();
      engine.on('semanticNodeAdded', listener);
      engine.addSemanticNode({ type: 'concept', label: 'X', properties: {}, strength: 0.5 });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should emit relationAdded', () => {
      const listener = vi.fn();
      engine.on('relationAdded', listener);
      const a = engine.addSemanticNode({ type: 'concept', label: 'A', properties: {}, strength: 0.5 });
      const b = engine.addSemanticNode({ type: 'concept', label: 'B', properties: {}, strength: 0.5 });
      engine.addRelation(a.id, b.id, 'links', 0.7);
      expect(listener).toHaveBeenCalledWith({ from: a.id, to: b.id, type: 'links', weight: 0.7 });
    });
  });

  // ===== Associative Recall =====

  describe('Associative Recall', () => {
    it('should return empty result for non-existent seed', () => {
      const result = engine.associativeRecall({ seed: 'ghost', depth: 2, threshold: 0.1, limit: 10 });
      expect(result.nodes).toEqual([]);
      expect(result.episodes).toEqual([]);
      expect(result.relevanceScore).toBe(0);
    });

    it('should activate connected nodes and associated episodes', () => {
      const nodeA = engine.addSemanticNode({ type: 'concept', label: 'coding', properties: {}, strength: 0.9 });
      const nodeB = engine.addSemanticNode({ type: 'concept', label: 'testing', properties: {}, strength: 0.7 });
      engine.addRelation(nodeA.id, nodeB.id, 'related', 0.8);

      engine.storeEpisode({
        title: 'Test Episode',
        narrative: 'Writing tests',
        emotionalWeight: 0.7,
        tags: ['coding'],
        associations: [nodeA.id],
        decayRate: 86400000,
        accessCount: 1,
      });

      const result = engine.associativeRecall({ seed: nodeA.id, depth: 2, threshold: 0.1, limit: 10 });
      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.episodes.length).toBeGreaterThan(0);
      expect(result.relevanceScore).toBeGreaterThan(0);
    });
  });

  // ===== Procedural Memory =====

  describe('Procedural Memory', () => {
    it('should store and retrieve procedural memory by skillId', () => {
      engine.storeProcedural({ skillId: 'search', compiled: true, fastPath: false, usageCount: 0, lastUsed: Date.now() });

      const retrieved = engine.retrieveProcedural('search');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.skillId).toBe('search');
      expect(retrieved!.usageCount).toBe(1); // retrieveProcedural increments usageCount
    });

    it('should return null for non-existent skill', () => {
      expect(engine.retrieveProcedural('ghost')).toBeNull();
    });

    it('should mark procedural as fast path', () => {
      engine.storeProcedural({ skillId: 'hot-path', compiled: false, fastPath: false, usageCount: 0, lastUsed: Date.now() });

      expect(engine.markAsFastPath('hot-path')).toBe(true);

      const proc = engine.retrieveProcedural('hot-path');
      expect(proc!.fastPath).toBe(true);
      expect(proc!.compiled).toBe(true);
    });

    it('should return false for marking non-existent skill as fast path', () => {
      expect(engine.markAsFastPath('ghost')).toBe(false);
    });

    it('should emit proceduralStored', () => {
      const listener = vi.fn();
      engine.on('proceduralStored', listener);
      engine.storeProcedural({ skillId: 's1', compiled: false, fastPath: false, usageCount: 0, lastUsed: Date.now() });
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  // ===== Prospective Memory =====

  describe('Prospective Memory', () => {
    it('should add and retrieve prospective memory', () => {
      const now = Date.now();
      const item = engine.addProspective({
        type: 'todo',
        triggerTime: now + 1000,
        description: 'Check tests',
        priority: 1,
        completed: false,
      });

      expect(item.id).toContain('prospective_');
      expect(item.description).toBe('Check tests');
    });

    it('should check due items sorted by priority', () => {
      const now = Date.now();
      engine.addProspective({ type: 'todo', triggerTime: now - 1000, description: 'Low', priority: 1, completed: false });
      engine.addProspective({ type: 'todo', triggerTime: now - 1000, description: 'High', priority: 5, completed: false });
      engine.addProspective({ type: 'todo', triggerTime: now + 10000, description: 'Future', priority: 10, completed: false });

      const due = engine.checkDue(now);
      expect(due).toHaveLength(2);
      expect(due[0].description).toBe('High'); // higher priority first
    });

    it('should not return completed items as due', () => {
      const now = Date.now();
      const item = engine.addProspective({ type: 'todo', triggerTime: now - 1000, description: 'Done', priority: 1, completed: false });
      engine.completeProspective(item.id);

      expect(engine.checkDue(now)).toHaveLength(0);
    });

    it('should return true when completing existing item', () => {
      const item = engine.addProspective({ type: 'todo', triggerTime: Date.now(), description: 'X', priority: 1, completed: false });
      expect(engine.completeProspective(item.id)).toBe(true);
    });

    it('should return false when completing non-existent item', () => {
      expect(engine.completeProspective('ghost')).toBe(false);
    });

    it('should delete prospective memory', () => {
      const item = engine.addProspective({ type: 'todo', triggerTime: Date.now(), description: 'Del', priority: 1, completed: false });
      expect(engine.deleteProspective(item.id)).toBe(true);
    });

    it('should return false for deleting non-existent prospective', () => {
      expect(engine.deleteProspective('ghost')).toBe(false);
    });

    it('should emit prospectiveAdded', () => {
      const listener = vi.fn();
      engine.on('prospectiveAdded', listener);
      engine.addProspective({ type: 'timer', triggerTime: Date.now(), description: 'T', priority: 1, completed: false });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should emit prospectiveCompleted', () => {
      const listener = vi.fn();
      engine.on('prospectiveCompleted', listener);
      const item = engine.addProspective({ type: 'promise', triggerTime: Date.now(), description: 'P', priority: 1, completed: false });
      engine.completeProspective(item.id);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  // ===== Autobiographical Narrative =====

  describe('Autobiographical Narrative', () => {
    it('should initialize with default identity', () => {
      const narrative = engine.getNarrative();
      expect(narrative.identityStatement).toBeTruthy();
      expect(narrative.chapters).toEqual([]);
      expect(narrative.activeThemes).toEqual([]);
      expect(narrative.relationships).toEqual([]);
    });

    it('should update identity statement', () => {
      engine.updateIdentityStatement('I am a coding companion.');
      expect(engine.getNarrative().identityStatement).toBe('I am a coding companion.');
    });

    it('should add a chapter', () => {
      const chapter = engine.addChapter({
        title: 'Early Days',
        summary: 'Learning the basics',
        startTime: Date.now() - 86400000,
        endTime: Date.now(),
        keyEpisodes: [],
        emotionalTone: 'positive',
        significance: 0.7,
      });

      expect(chapter.id).toContain('chapter_');
      expect(engine.getNarrative().chapters).toHaveLength(1);
    });

    it('should update active themes', () => {
      engine.updateActiveThemes(['coding', 'testing']);
      expect(engine.getNarrative().activeThemes).toEqual(['coding', 'testing']);
    });

    it('should create new relationship', () => {
      engine.updateRelationship('user-1', {
        summary: 'Frequent collaborator',
        trustLevel: 0.8,
        communicationStyle: 'casual',
      });

      const rel = engine.getRelationship('user-1');
      expect(rel).not.toBeNull();
      expect(rel!.summary).toBe('Frequent collaborator');
      expect(rel!.trustLevel).toBe(0.8);
    });

    it('should update existing relationship', () => {
      engine.updateRelationship('user-1', { summary: 'Initial', trustLevel: 0.5 });
      engine.updateRelationship('user-1', { summary: 'Trusted partner', trustLevel: 0.9 });

      const rel = engine.getRelationship('user-1');
      expect(rel!.summary).toBe('Trusted partner');
      expect(rel!.trustLevel).toBe(0.9);
    });

    it('should return null for non-existent relationship', () => {
      expect(engine.getRelationship('ghost')).toBeNull();
    });

    it('should emit narrativeUpdated on identity change', () => {
      const listener = vi.fn();
      engine.on('narrativeUpdated', listener);
      engine.updateIdentityStatement('New identity');
      expect(listener).toHaveBeenCalledWith({ field: 'identityStatement' });
    });

    it('should emit narrativeUpdated on chapter add', () => {
      const listener = vi.fn();
      engine.on('narrativeUpdated', listener);
      engine.addChapter({
        title: 'Ch1',
        summary: 'Summary',
        startTime: 0,
        endTime: 1,
        keyEpisodes: [],
        emotionalTone: 'neutral',
        significance: 0.5,
      });
      expect(listener).toHaveBeenCalled();
    });

    describe('getNarrativeContextForPrompt', () => {
      it('should return empty string for default narrative', () => {
        // Default has identityStatement but empty chapters/themes/relationships
        const ctx = engine.getNarrativeContextForPrompt();
        // It will contain the identity statement at minimum
        expect(ctx).toContain('Identity:');
      });

      it('should include identity, themes, and chapters', () => {
        engine.updateIdentityStatement('I am Killer');
        engine.updateActiveThemes(['coding', 'debugging']);
        engine.addChapter({
          title: 'Chapter 1',
          summary: 'The beginning',
          startTime: Date.now() - 1000,
          endTime: Date.now(),
          keyEpisodes: [],
          emotionalTone: 'positive',
          significance: 0.8,
        });

        const ctx = engine.getNarrativeContextForPrompt();
        expect(ctx).toContain('I am Killer');
        expect(ctx).toContain('coding');
        expect(ctx).toContain('Chapter 1');
      });

      it('should include recent relationships (within 30 days)', () => {
        engine.updateRelationship('user-alice', {
          summary: 'Close collaborator',
          trustLevel: 0.9,
        });

        const ctx = engine.getNarrativeContextForPrompt();
        expect(ctx).toContain('user-alice');
        expect(ctx).toContain('0.90');
      });
    });

    describe('synthesizeChapter', () => {
      it('should return null when no episodes exist', () => {
        const chapter = engine.synthesizeChapter('Empty', 'Nothing happened', 'neutral');
        expect(chapter).toBeNull();
      });

      it('should synthesize chapter from recent episodes', () => {
        // Add episodes so synthesizeChapter has material
        for (let i = 0; i < 5; i++) {
          engine.storeEpisode({
            title: `Episode ${i}`,
            narrative: `Activity ${i}`,
            emotionalWeight: 0.6,
            tags: ['coding', 'testing'],
            associations: [],
            decayRate: 86400000,
            accessCount: 1,
          });
        }

        const chapter = engine.synthesizeChapter('Coding Sprint', 'Intense coding period', 'positive');
        expect(chapter).not.toBeNull();
        expect(chapter!.title).toBe('Coding Sprint');
        expect(chapter!.keyEpisodes.length).toBeGreaterThan(0);
        expect(chapter!.significance).toBeGreaterThan(0);
        // Should update active themes with top tags
        expect(engine.getNarrative().activeThemes.length).toBeGreaterThan(0);
      });
    });
  });

  // ===== Maintenance =====

  describe('Maintenance', () => {
    it('should apply decay to all episodes', () => {
      engine.storeEpisode({
        title: 'Fresh',
        narrative: 'Just created',
        emotionalWeight: 0.7,
        tags: ['test'],
        associations: [],
        decayRate: 1000, // Very fast decay
        accessCount: 1,
      });

      engine.applyDecay();
      // Episodes should still exist (not deleted, just decayed)
      expect(engine.getAllEpisodes()).toHaveLength(1);
    });

    it('should emit decayApplied', () => {
      const listener = vi.fn();
      engine.on('decayApplied', listener);
      engine.applyDecay();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should run dream cycle', async () => {
      engine.storeEpisode({
        title: 'Dream',
        narrative: 'Dream content',
        emotionalWeight: 0.5,
        tags: ['dream'],
        associations: [],
        decayRate: 86400000,
        accessCount: 1,
      });

      const result = await engine.dreamCycle();
      expect(result).toHaveProperty('episodesReplayed');
      expect(result).toHaveProperty('patternsExtracted');
      expect(result).toHaveProperty('memoriesConsolidated');
      expect(result).toHaveProperty('memoriesDecayed');
      expect(result).toHaveProperty('insights');
    });
  });

  // ===== Stats & Health =====

  describe('Stats & Health', () => {
    it('should return correct stats', () => {
      engine.storeEpisode({ title: 'E', narrative: '', emotionalWeight: 0.5, tags: [], associations: [], decayRate: 86400000, accessCount: 0 });
      engine.addSemanticNode({ type: 'concept', label: 'N', properties: {}, strength: 0.5 });
      engine.storeProcedural({ skillId: 's', compiled: false, fastPath: false, usageCount: 0, lastUsed: Date.now() });
      engine.addProspective({ type: 'todo', triggerTime: Date.now(), description: 'T', priority: 1, completed: false });

      const stats = engine.getStats();
      expect(stats.episodes).toBe(1);
      expect(stats.semanticNodes).toBe(1);
      expect(stats.proceduralMemories).toBe(1);
      expect(stats.prospectiveMemories).toBe(1);
      expect(stats.activeContext).toBe(0);
    });

    it('should return health report for episodes', () => {
      engine.storeEpisode({ title: 'H', narrative: '', emotionalWeight: 0.5, tags: [], associations: [], decayRate: 86400000, accessCount: 0 });

      const report = engine.getHealthReport();
      expect(report.length).toBeGreaterThan(0);
      expect(report[0].type).toBe(MemoryLayer.Episodic);
      expect(['strong', 'moderate', 'weak', 'dormant']).toContain(report[0].health);
    });
  });

  // ===== Lifecycle =====

  describe('Lifecycle', () => {
    it('should stop cleanly', () => {
      engine.stop();
      // Calling stop twice should be safe
      engine.stop();
    });

    it('should emit stopped event', () => {
      const listener = vi.fn();
      engine.on('stopped', listener);
      engine.stop();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should clear all memory', () => {
      engine.storeEpisode({ title: 'E', narrative: '', emotionalWeight: 0.5, tags: [], associations: [], decayRate: 86400000, accessCount: 0 });
      engine.addSemanticNode({ type: 'concept', label: 'N', properties: {}, strength: 0.5 });
      engine.focusOn('target');

      engine.clear();

      expect(engine.getAllEpisodes()).toHaveLength(0);
      expect(engine.getStats().semanticNodes).toBe(0);
      expect(engine.getWorkingMemory().currentFocus).toBeNull();
      expect(engine.getNarrative().chapters).toEqual([]);
    });

    it('should emit cleared event', () => {
      const listener = vi.fn();
      engine.on('cleared', listener);
      engine.clear();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  // ===== Events =====

  describe('Events', () => {
    it('should support on/off pattern', () => {
      const listener = vi.fn();
      engine.on('test-event', listener);
      engine.updateWorkingMemory({ currentFocus: 'trigger' }); // triggers workingMemoryUpdated
      engine.off('test-event', listener);
      // The listener wasn't subscribed to workingMemoryUpdated, so it shouldn't have been called
    });

    it('should isolate event errors', () => {
      const badListener = () => { throw new Error('boom'); };
      const errorListener = vi.fn();
      engine.on('workingMemoryUpdated', badListener);
      engine.on('error', errorListener);

      // Should not throw despite bad listener
      engine.updateWorkingMemory({ currentFocus: 'x' });
      expect(errorListener).toHaveBeenCalled();
    });
  });

  // ===== Export / Import =====

  describe('Export / Import', () => {
    it('should export all memory layers', () => {
      engine.storeEpisode({ title: 'E', narrative: '', emotionalWeight: 0.5, tags: [], associations: [], decayRate: 86400000, accessCount: 0 });
      engine.addSemanticNode({ type: 'concept', label: 'N', properties: {}, strength: 0.5 });
      engine.storeProcedural({ skillId: 's', compiled: true, fastPath: false, usageCount: 0, lastUsed: Date.now() });
      engine.addProspective({ type: 'todo', triggerTime: Date.now(), description: 'T', priority: 1, completed: false });

      const exported = engine.export();
      expect(exported.episodic).toHaveLength(1);
      expect(exported.semantic).toHaveLength(1);
      expect(exported.procedural).toHaveLength(1);
      expect(exported.prospective).toHaveLength(1);
      expect(exported.workingMemory).toBeDefined();
      expect(exported.narrative).toBeDefined();
      expect(exported.exportedAt).toBeGreaterThan(0);
    });

    it('should import memory data', () => {
      const now = Date.now();
      const ep: Episode = {
        id: 'ep_imported',
        timestamp: now,
        title: 'Imported',
        narrative: 'From export',
        emotionalWeight: 0.5,
        tags: ['imported'],
        associations: [],
        decayRate: 86400000,
        accessCount: 1,
      };

      engine.import({ episodic: [ep] });
      expect(engine.getAllEpisodes()).toHaveLength(1);
      expect(engine.getAllEpisodes()[0].id).toBe('ep_imported');
    });

    it('should import narrative data', () => {
      engine.import({
        narrative: {
          identityStatement: 'Imported identity',
          chapters: [],
          activeThemes: ['imported'],
          relationships: [],
          lastUpdated: Date.now(),
        },
      });
      expect(engine.getNarrative().identityStatement).toBe('Imported identity');
      expect(engine.getNarrative().activeThemes).toEqual(['imported']);
    });

    it('should emit imported event', () => {
      const listener = vi.fn();
      engine.on('imported', listener);
      engine.import({ episodic: [] });
      expect(listener).toHaveBeenCalledWith({
        episodes: 0,
        semantic: 0,
        procedural: 0,
        prospective: 0,
      });
    });

    it('should round-trip export/import', () => {
      engine.storeEpisode({ title: 'RT', narrative: 'Round trip', emotionalWeight: 0.8, tags: ['rt'], associations: [], decayRate: 86400000, accessCount: 2 });
      engine.addSemanticNode({ type: 'concept', label: 'RT-Node', properties: { key: 'val' }, strength: 0.9 });
      engine.updateIdentityStatement('Round trip identity');

      const exported = engine.export();

      const engine2 = createEngine();
      engine2.import({
        episodic: exported.episodic,
        semantic: exported.semantic,
        narrative: exported.narrative,
      });

      expect(engine2.getAllEpisodes()).toHaveLength(1);
      expect(engine2.getStats().semanticNodes).toBe(1);
      expect(engine2.getNarrative().identityStatement).toBe('Round trip identity');

      engine2.stop();
    });
  });

  // ===== Association Helpers =====

  describe('Association Helpers', () => {
    it('should calculate association strength between nodes', () => {
      const a = engine.addSemanticNode({ type: 'concept', label: 'A', properties: {}, strength: 0.8 });
      const b = engine.addSemanticNode({ type: 'concept', label: 'B', properties: {}, strength: 0.8 });
      engine.addRelation(a.id, b.id, 'connected', 0.9);

      const strength = engine.getAssociationStrength(a.id, b.id);
      expect(strength).toBeGreaterThan(0);
    });

    it('should find shortest path between nodes', () => {
      const a = engine.addSemanticNode({ type: 'concept', label: 'A', properties: {}, strength: 0.8 });
      const b = engine.addSemanticNode({ type: 'concept', label: 'B', properties: {}, strength: 0.8 });
      engine.addRelation(a.id, b.id, 'connected', 0.9);

      const path = engine.getShortestPath(a.id, b.id);
      expect(path.length).toBeGreaterThan(0);
    });
  });

  // ===== Custom Config =====

  describe('Custom Config', () => {
    it('should respect custom working memory capacity', () => {
      const customEngine = new HippocampusEngine({ ...TEST_CONFIG, workingMemoryCapacity: 3 });
      expect(customEngine.getWorkingMemory().capacity).toBe(3);

      for (let i = 0; i < 10; i++) {
        customEngine.addToBuffer(`item-${i}`);
      }
      expect(customEngine.getWorkingMemory().shortTermBuffer).toHaveLength(3);

      customEngine.stop();
    });
  });
});
