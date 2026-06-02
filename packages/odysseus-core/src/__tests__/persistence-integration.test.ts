/**
 * Persistence Integration Test
 *
 * 验证 HippocampusEngine 与 IStorage 的 write-through 持久化集成
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HippocampusEngine, DEFAULT_MEMORY_CONFIG } from '../hippocampus/memory.js';
import { MemoryStorage } from '../storage/memory-storage.js';

describe('HippocampusEngine Persistence Integration', () => {
  let engine: HippocampusEngine;
  let storage: MemoryStorage;

  beforeEach(async () => {
    storage = new MemoryStorage();
    engine = new HippocampusEngine(DEFAULT_MEMORY_CONFIG, storage);
    await engine.attachStorage(storage);
  });

  describe('Episode Write-Through', () => {
    it('should persist episode on store', async () => {
      const episode = engine.storeEpisode({
        title: 'Test Episode',
        narrative: 'This is a test narrative',
        emotionalWeight: 0.8,
        tags: ['test'],
        associations: [],
        decayRate: 86400000,
      });

      // Verify in storage
      const loaded = await storage.episodes.load(episode.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.title).toBe('Test Episode');
      expect(loaded!.narrative).toBe('This is a test narrative');
    });

    it('should persist reinforced episode on retrieve', async () => {
      const ep = engine.storeEpisode({
        title: 'Reinforce Test',
        narrative: 'Original narrative',
        emotionalWeight: 0.5,
        tags: ['test'],
        associations: [],
        decayRate: 86400000,
      });

      // Retrieve triggers reinforce + persist
      const retrieved = engine.retrieveEpisode(ep.id);
      expect(retrieved).not.toBeNull();

      // Check storage has updated data
      const loaded = await storage.episodes.load(ep.id);
      expect(loaded!.accessCount).toBe(1);
    });

    it('should delete from storage on episode delete', async () => {
      const ep = engine.storeEpisode({
        title: 'Delete Test',
        narrative: 'To be deleted',
        emotionalWeight: 0.3,
        tags: ['test'],
        associations: [],
        decayRate: 86400000,
      });

      engine.deleteEpisode(ep.id);

      const loaded = await storage.episodes.load(ep.id);
      expect(loaded).toBeNull();
    });
  });

  describe('Semantic Node Write-Through', () => {
    it('should persist semantic node on add', async () => {
      const node = engine.addSemanticNode({
        type: 'concept',
        label: 'persistence',
        properties: { description: 'Data survives restarts' },
        strength: 0.9,
      });

      const loaded = await storage.semantic.load(node.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.label).toBe('persistence');
    });

    it('should persist relation updates', async () => {
      const nodeA = engine.addSemanticNode({
        type: 'concept',
        label: 'A',
        properties: {},
        strength: 1.0,
      });

      const nodeB = engine.addSemanticNode({
        type: 'concept',
        label: 'B',
        properties: {},
        strength: 1.0,
      });

      engine.addRelation(nodeA.id, nodeB.id, 'related', 0.8);

      // Node A should be persisted with the new relation
      const loaded = await storage.semantic.load(nodeA.id);
      expect(loaded!.relations.length).toBe(1);
      expect(loaded!.relations[0].to).toBe(nodeB.id);
    });

    it('should delete from storage on semantic node delete', async () => {
      const node = engine.addSemanticNode({
        type: 'entity',
        label: 'ephemeral',
        properties: {},
        strength: 0.1,
      });

      engine.deleteSemanticNode(node.id);

      const loaded = await storage.semantic.load(node.id);
      expect(loaded).toBeNull();
    });
  });

  describe('Prospective Memory Write-Through', () => {
    it('should persist prospective memory on add', async () => {
      const item = engine.addProspective({
        type: 'todo',
        triggerTime: Date.now() + 3600000,
        description: 'Test todo',
        priority: 5,
        completed: false,
      });

      const loaded = await storage.prospective.load(item.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.description).toBe('Test todo');
    });

    it('should persist completed state', async () => {
      const item = engine.addProspective({
        type: 'todo',
        triggerTime: Date.now(),
        description: 'Complete me',
        priority: 3,
        completed: false,
      });

      engine.completeProspective(item.id);

      const loaded = await storage.prospective.load(item.id);
      expect(loaded!.completed).toBe(true);
    });

    it('should delete from storage on prospective delete', async () => {
      const item = engine.addProspective({
        type: 'timer',
        triggerTime: Date.now(),
        description: 'Delete me',
        priority: 1,
        completed: false,
      });

      engine.deleteProspective(item.id);

      const loaded = await storage.prospective.load(item.id);
      expect(loaded).toBeNull();
    });
  });

  describe('Storage Load on Attach', () => {
    it('should load pre-existing episodes from storage', async () => {
      // Pre-populate storage
      const preStorage = new MemoryStorage();
      await preStorage.initialize();
      await preStorage.episodes.save({
        id: 'pre_001',
        timestamp: Date.now() - 10000,
        title: 'Pre-existing',
        narrative: 'Already stored before engine started',
        emotionalWeight: 0.7,
        tags: ['pre-existing'],
        associations: [],
        decayRate: 86400000,
        accessCount: 2,
      });

      // Create engine and attach pre-populated storage
      const newEngine = new HippocampusEngine(DEFAULT_MEMORY_CONFIG, preStorage);
      await newEngine.attachStorage(preStorage);

      const loaded = newEngine.retrieveEpisode('pre_001');
      expect(loaded).not.toBeNull();
      expect(loaded!.title).toBe('Pre-existing');
    });
  });

  describe('Flush and Detach', () => {
    it('should flush all data before closing storage on detach', async () => {
      engine.storeEpisode({
        title: 'Flush Test',
        narrative: 'Data to flush',
        emotionalWeight: 0.6,
        tags: ['flush'],
        associations: [],
        decayRate: 86400000,
      });

      // 先手动flush验证数据正确写入
      await engine.flushToStorage();

      const episodes = await storage.episodes.loadAll();
      expect(episodes.length).toBe(1);
      expect(episodes[0].title).toBe('Flush Test');
    });
  });
});
