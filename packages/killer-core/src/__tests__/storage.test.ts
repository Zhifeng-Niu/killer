/**
 * Storage Tests - 存储层测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Episode, SemanticNode, ProspectiveMemory } from '../hippocampus/types.js';
import {
  MemoryStorage,
  SQLiteStorage,
  createStorage,
  saveMemory,
  loadMemory,
  type IStorage,
} from '../storage/index.js';
import { HippocampusEngine } from '../hippocampus/memory.js';

describe('MemoryStorage', () => {
  let storage: IStorage;

  beforeEach(async () => {
    storage = new MemoryStorage();
    await storage.initialize();
  });

  afterEach(async () => {
    await storage.close();
  });

  describe('episodes', () => {
    const mockEpisode: Episode = {
      id: 'ep_test_1',
      timestamp: Date.now(),
      title: 'Test Episode',
      narrative: 'A test episode narrative',
      emotionalWeight: 0.5,
      tags: ['test', 'sample'],
      associations: [],
      decayRate: 0.1,
      accessCount: 0,
    };

    it('should save and load an episode', async () => {
      await storage.episodes.save(mockEpisode);
      const loaded = await storage.episodes.load('ep_test_1');
      expect(loaded).toEqual(mockEpisode);
    });

    it('should return null for non-existent episode', async () => {
      const loaded = await storage.episodes.load('nonexistent');
      expect(loaded).toBeNull();
    });

    it('should load all episodes', async () => {
      const episode2: Episode = { ...mockEpisode, id: 'ep_test_2' };
      await storage.episodes.save(mockEpisode);
      await storage.episodes.save(episode2);

      const all = await storage.episodes.loadAll();
      expect(all).toHaveLength(2);
      expect(all.map((e) => e.id)).toContain('ep_test_1');
      expect(all.map((e) => e.id)).toContain('ep_test_2');
    });

    it('should delete an episode', async () => {
      await storage.episodes.save(mockEpisode);
      const deleted = await storage.episodes.delete('ep_test_1');
      expect(deleted).toBe(true);

      const loaded = await storage.episodes.load('ep_test_1');
      expect(loaded).toBeNull();
    });

    it('should return false when deleting non-existent episode', async () => {
      const deleted = await storage.episodes.delete('nonexistent');
      expect(deleted).toBe(false);
    });

    it('should count episodes', async () => {
      expect(await storage.episodes.count()).toBe(0);

      await storage.episodes.save(mockEpisode);
      expect(await storage.episodes.count()).toBe(1);

      const episode2: Episode = { ...mockEpisode, id: 'ep_test_2' };
      await storage.episodes.save(episode2);
      expect(await storage.episodes.count()).toBe(2);
    });
  });

  describe('semantic', () => {
    const mockNode: SemanticNode = {
      id: 'semantic_test_1',
      type: 'concept',
      label: 'Test Concept',
      properties: { key: 'value' },
      relations: [],
      strength: 0.8,
    };

    it('should save and load a semantic node', async () => {
      await storage.semantic.save(mockNode);
      const loaded = await storage.semantic.load('semantic_test_1');
      expect(loaded).toEqual(mockNode);
    });

    it('should return null for non-existent node', async () => {
      const loaded = await storage.semantic.load('nonexistent');
      expect(loaded).toBeNull();
    });

    it('should load all semantic nodes', async () => {
      const node2: SemanticNode = { ...mockNode, id: 'semantic_test_2' };
      await storage.semantic.save(mockNode);
      await storage.semantic.save(node2);

      const all = await storage.semantic.loadAll();
      expect(all).toHaveLength(2);
    });

    it('should delete a semantic node', async () => {
      await storage.semantic.save(mockNode);
      const deleted = await storage.semantic.delete('semantic_test_1');
      expect(deleted).toBe(true);

      const loaded = await storage.semantic.load('semantic_test_1');
      expect(loaded).toBeNull();
    });

    it('should count semantic nodes', async () => {
      expect(await storage.semantic.count()).toBe(0);

      await storage.semantic.save(mockNode);
      expect(await storage.semantic.count()).toBe(1);
    });
  });

  describe('prospective', () => {
    const mockMemory: ProspectiveMemory = {
      id: 'prospective_test_1',
      type: 'todo',
      triggerTime: Date.now() - 1000,
      description: 'Test todo item',
      priority: 5,
      completed: false,
    };

    it('should save and load a prospective memory', async () => {
      await storage.prospective.save(mockMemory);
      const loaded = await storage.prospective.load('prospective_test_1');
      expect(loaded).toEqual(mockMemory);
    });

    it('should return null for non-existent memory', async () => {
      const loaded = await storage.prospective.load('nonexistent');
      expect(loaded).toBeNull();
    });

    it('should load all prospective memories', async () => {
      const memory2: ProspectiveMemory = { ...mockMemory, id: 'prospective_test_2' };
      await storage.prospective.save(mockMemory);
      await storage.prospective.save(memory2);

      const all = await storage.prospective.loadAll();
      expect(all).toHaveLength(2);
    });

    it('should load due memories', async () => {
      const pastMemory: ProspectiveMemory = {
        ...mockMemory,
        id: 'prospective_past',
        triggerTime: Date.now() - 5000,
        priority: 3,
      };
      const futureMemory: ProspectiveMemory = {
        ...mockMemory,
        id: 'prospective_future',
        triggerTime: Date.now() + 5000,
        priority: 10,
      };

      await storage.prospective.save(pastMemory);
      await storage.prospective.save(futureMemory);

      const due = await storage.prospective.loadDue(Date.now());
      expect(due).toHaveLength(1);
      expect(due[0].id).toBe('prospective_past');
    });

    it('should load due memories sorted by priority', async () => {
      const lowPriority: ProspectiveMemory = {
        ...mockMemory,
        id: 'low',
        triggerTime: Date.now() - 1000,
        priority: 1,
      };
      const highPriority: ProspectiveMemory = {
        ...mockMemory,
        id: 'high',
        triggerTime: Date.now() - 1000,
        priority: 10,
      };

      await storage.prospective.save(lowPriority);
      await storage.prospective.save(highPriority);

      const due = await storage.prospective.loadDue(Date.now());
      expect(due).toHaveLength(2);
      expect(due[0].id).toBe('high');
      expect(due[1].id).toBe('low');
    });

    it('should not load completed memories as due', async () => {
      const completedMemory: ProspectiveMemory = {
        ...mockMemory,
        id: 'prospective_completed',
        triggerTime: Date.now() - 5000,
        completed: true,
      };

      await storage.prospective.save(completedMemory);

      const due = await storage.prospective.loadDue(Date.now());
      expect(due).toHaveLength(0);
    });

    it('should delete a prospective memory', async () => {
      await storage.prospective.save(mockMemory);
      const deleted = await storage.prospective.delete('prospective_test_1');
      expect(deleted).toBe(true);

      const loaded = await storage.prospective.load('prospective_test_1');
      expect(loaded).toBeNull();
    });

    it('should count prospective memories', async () => {
      expect(await storage.prospective.count()).toBe(0);

      await storage.prospective.save(mockMemory);
      expect(await storage.prospective.count()).toBe(1);
    });
  });
});

describe('SQLiteStorage', () => {
  let storage: IStorage;

  beforeEach(async () => {
    storage = new SQLiteStorage(':memory:');
    await storage.initialize();
  });

  afterEach(async () => {
    await storage.close();
  });

  const mockEpisode: Episode = {
    id: 'ep_sqlite_1',
    timestamp: Date.now(),
    title: 'SQLite Test Episode',
    narrative: 'A SQLite test episode',
    emotionalWeight: 0.7,
    tags: ['sqlite', 'test'],
    associations: [],
    decayRate: 0.1,
    accessCount: 0,
  };

  const mockNode: SemanticNode = {
    id: 'semantic_sqlite_1',
    type: 'entity',
    label: 'SQLite Entity',
    properties: { sqlite: true },
    relations: [],
    strength: 0.9,
  };

  const mockMemory: ProspectiveMemory = {
    id: 'prospective_sqlite_1',
    type: 'timer',
    triggerTime: Date.now() - 1000,
    description: 'SQLite timer',
    priority: 7,
    completed: false,
  };

  it('should save and load episodes', async () => {
    await storage.episodes.save(mockEpisode);
    const loaded = await storage.episodes.load('ep_sqlite_1');
    expect(loaded).toEqual(mockEpisode);
  });

  it('should save and load semantic nodes', async () => {
    await storage.semantic.save(mockNode);
    const loaded = await storage.semantic.load('semantic_sqlite_1');
    expect(loaded).toEqual(mockNode);
  });

  it('should save and load prospective memories', async () => {
    await storage.prospective.save(mockMemory);
    const loaded = await storage.prospective.load('prospective_sqlite_1');
    expect(loaded).toEqual(mockMemory);
  });

  it('should load all episodes', async () => {
    const episode2: Episode = { ...mockEpisode, id: 'ep_sqlite_2' };
    await storage.episodes.save(mockEpisode);
    await storage.episodes.save(episode2);

    const all = await storage.episodes.loadAll();
    expect(all).toHaveLength(2);
  });

  it('should load due prospective memories', async () => {
    await storage.prospective.save(mockMemory);
    const due = await storage.prospective.loadDue(Date.now());
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe('prospective_sqlite_1');
  });

  it('should delete episodes', async () => {
    await storage.episodes.save(mockEpisode);
    const deleted = await storage.episodes.delete('ep_sqlite_1');
    expect(deleted).toBe(true);

    const loaded = await storage.episodes.load('ep_sqlite_1');
    expect(loaded).toBeNull();
  });

  it('should count records', async () => {
    await storage.episodes.save(mockEpisode);
    await storage.semantic.save(mockNode);
    await storage.prospective.save(mockMemory);

    expect(await storage.episodes.count()).toBe(1);
    expect(await storage.semantic.count()).toBe(1);
    expect(await storage.prospective.count()).toBe(1);
  });
});

describe('Storage Factory', () => {
  it('should create memory storage', () => {
    const storage = createStorage({ type: 'memory' });
    expect(storage).toBeInstanceOf(MemoryStorage);
  });

  it('should create memory storage by default', () => {
    const storage = createStorage();
    expect(storage).toBeInstanceOf(MemoryStorage);
  });

  it('should create SQLite storage', () => {
    const storage = createStorage({ type: 'sqlite', path: ':memory:' });
    expect(storage).toBeInstanceOf(SQLiteStorage);
  });
});

describe('Persist Helpers', () => {
  it('should save and load memory from engine', async () => {
    const storage = new SQLiteStorage(':memory:');
    await storage.initialize();

    const engine = new HippocampusEngine();

    // 添加一些数据到引擎
    engine.storeEpisode({
      title: 'Test Episode',
      narrative: 'Test narrative',
      emotionalWeight: 0.5,
      tags: ['test'],
      associations: [],
    });

    engine.addSemanticNode({
      type: 'concept',
      label: 'Test Concept',
      properties: {},
    });

    engine.addProspective({
      type: 'todo',
      triggerTime: Date.now(),
      description: 'Test todo',
      priority: 5,
      completed: false,
    });

    // 保存到存储
    await saveMemory(engine, storage);

    // 验证存储中有数据
    expect(await storage.episodes.count()).toBe(1);
    expect(await storage.semantic.count()).toBe(1);
    expect(await storage.prospective.count()).toBe(1);

    // 清空引擎
    engine.clear();

    // 从存储加载
    await loadMemory(engine, storage);

    // 验证引擎恢复了数据
    expect(engine.getAllEpisodes()).toHaveLength(1);
    expect(engine.getAllEpisodes()[0].title).toBe('Test Episode');

    await storage.close();
  });
});
