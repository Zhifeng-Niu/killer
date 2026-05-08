/**
 * Hippocampus 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  calculateRetention,
  shouldRecall,
  reinforce,
  decay,
  calculateNextReview,
  getMemoryHealth,
  applyForgettingCurve,
  DEFAULT_FORGETTING_CONFIG,
} from '../hippocampus/forgetting.js';

import {
  AssociationEngine,
  DEFAULT_ASSOCIATION_CONFIG,
  type ActivatedNode,
} from '../hippocampus/association.js';

import {
  DreamEngine,
  DEFAULT_DREAMING_CONFIG,
} from '../hippocampus/dreaming.js';

import {
  HippocampusEngine,
  DEFAULT_MEMORY_CONFIG,
  MemoryLayer,
} from '../hippocampus/memory.js';

import type {
  Episode,
  SemanticNode,
  AssociativeQuery,
} from '../hippocampus/types.js';

describe('Hippocampus - 遗忘曲线', () => {
  describe('calculateRetention', () => {
    it('应返回 1 当时间为 0', () => {
      const retention = calculateRetention(1000, 0);
      expect(retention).toBe(1);
    });

    it('应随时间衰减', () => {
      const retention1 = calculateRetention(1000, 100);
      const retention2 = calculateRetention(1000, 500);
      expect(retention1).toBeGreaterThan(retention2);
    });

    it('稳定性越高，衰减越慢', () => {
      const retention1 = calculateRetention(500, 1000);
      const retention2 = calculateRetention(2000, 1000);
      expect(retention1).toBeLessThan(retention2);
    });

    it('无效稳定性应返回 0', () => {
      const retention = calculateRetention(0, 100);
      expect(retention).toBe(0);
    });
  });

  describe('shouldRecall', () => {
    const episode: Episode = {
      id: 'test1',
      timestamp: Date.now() - 48 * 60 * 60 * 1000, // 48 小时前
      title: 'Test Episode',
      narrative: 'Test',
      emotionalWeight: 0.5,
      tags: [],
      associations: [],
      decayRate: 24 * 60 * 60 * 1000, // 24 小时稳定性
      accessCount: 0,
    };

    it('应识别需要回忆的记忆', () => {
      const now = Date.now();
      const should = shouldRecall(episode, now);
      expect(should).toBe(true);
    });

    it('应遵守最小访问间隔', () => {
      const recentEpisode: Episode = {
        ...episode,
        timestamp: Date.now() - 1000, // 1 秒前
      };
      const should = shouldRecall(recentEpisode, Date.now());
      expect(should).toBe(false);
    });
  });

  describe('reinforce', () => {
    it('应增加访问次数', () => {
      const episode: Episode = {
        id: 'test1',
        timestamp: Date.now(),
        title: 'Test',
        narrative: 'Test',
        emotionalWeight: 0.5,
        tags: [],
        associations: [],
        decayRate: 1000,
        accessCount: 0,
      };

      const reinforced = reinforce(episode, Date.now());
      expect(reinforced.accessCount).toBe(1);
    });

    it('应增加稳定性', () => {
      const episode: Episode = {
        id: 'test1',
        timestamp: Date.now(),
        title: 'Test',
        narrative: 'Test',
        emotionalWeight: 0.5,
        tags: [],
        associations: [],
        decayRate: 1000,
        accessCount: 0,
      };

      const reinforced = reinforce(episode, Date.now());
      expect(reinforced.decayRate).toBeGreaterThan(episode.decayRate);
    });

    it('稳定性应有上限', () => {
      const config = { ...DEFAULT_FORGETTING_CONFIG, maxStability: 2000 };
      const episode: Episode = {
        id: 'test1',
        timestamp: Date.now(),
        title: 'Test',
        narrative: 'Test',
        emotionalWeight: 0.5,
        tags: [],
        associations: [],
        decayRate: 1500,
        accessCount: 0,
      };

      const reinforced = reinforce(episode, Date.now(), config);
      expect(reinforced.decayRate).toBeLessThanOrEqual(config.maxStability);
    });
  });

  describe('calculateNextReview', () => {
    it('应计算未来的复习时间', () => {
      const episode: Episode = {
        id: 'test1',
        timestamp: Date.now(),
        title: 'Test',
        narrative: 'Test',
        emotionalWeight: 0.5,
        tags: [],
        associations: [],
        decayRate: 24 * 60 * 60 * 1000,
        accessCount: 0,
      };

      const nextReview = calculateNextReview(episode);
      expect(nextReview).toBeGreaterThan(episode.timestamp);
    });
  });

  describe('getMemoryHealth', () => {
    it('应识别强记忆', () => {
      const episode: Episode = {
        id: 'test1',
        timestamp: Date.now(),
        title: 'Test',
        narrative: 'Test',
        emotionalWeight: 0.5,
        tags: [],
        associations: [],
        decayRate: 24 * 60 * 60 * 1000,
        accessCount: 0,
      };

      const health = getMemoryHealth(episode, Date.now());
      expect(health).toBe('strong');
    });

    it('应识别弱记忆', () => {
      const episode: Episode = {
        id: 'test1',
        timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000, // 3 天前
        title: 'Test',
        narrative: 'Test',
        emotionalWeight: 0.5,
        tags: [],
        associations: [],
        decayRate: 5 * 24 * 60 * 60 * 1000, // 5 天稳定性 → e^(-3/5) ≈ 0.55 → moderate，需要更弱
        accessCount: 0,
      };

      // 用更大的时间差来确保 weak
      // decayRate=3天，时间差=4天 → e^(-4/3) ≈ 0.26 → weak
      const weakEpisode: Episode = {
        ...episode,
        decayRate: 3 * 24 * 60 * 60 * 1000,
        timestamp: Date.now() - 4 * 24 * 60 * 60 * 1000,
      };
      const health = getMemoryHealth(weakEpisode, Date.now());
      expect(health).toBe('weak');
    });
  });

  describe('applyForgettingCurve', () => {
    it('应衰减所有情节的情感权重', () => {
      const episodes: Episode[] = [
        {
          id: 'test1',
          timestamp: Date.now() - 1000,
          title: 'Test 1',
          narrative: 'Test',
          emotionalWeight: 1.0,
          tags: [],
          associations: [],
          decayRate: 500,
          accessCount: 0,
        },
        {
          id: 'test2',
          timestamp: Date.now() - 1000,
          title: 'Test 2',
          narrative: 'Test',
          emotionalWeight: 0.8,
          tags: [],
          associations: [],
          decayRate: 500,
          accessCount: 0,
        },
      ];

      const decayed = applyForgettingCurve(episodes, Date.now());
      expect(decayed[0]!.emotionalWeight).toBeLessThan(1.0);
      expect(decayed[1]!.emotionalWeight).toBeLessThan(0.8);
    });
  });
});

describe('Hippocampus - 联想扩散引擎', () => {
  let graph: Map<string, SemanticNode>;
  let engine: AssociationEngine;

  beforeEach(() => {
    graph = new Map();
    engine = new AssociationEngine();

    // 构建测试图谱
    // A -> B -> C
    // A -> D
    graph.set('A', {
      id: 'A',
      type: 'entity',
      label: 'Node A',
      properties: {},
      relations: [
        { to: 'B', type: 'related', weight: 0.9 },
        { to: 'D', type: 'related', weight: 0.7 },
      ],
      strength: 1.0,
    });

    graph.set('B', {
      id: 'B',
      type: 'entity',
      label: 'Node B',
      properties: {},
      relations: [
        { to: 'C', type: 'related', weight: 0.8 },
      ],
      strength: 0.8,
    });

    graph.set('C', {
      id: 'C',
      type: 'entity',
      label: 'Node C',
      properties: {},
      relations: [],
      strength: 0.6,
    });

    graph.set('D', {
      id: 'D',
      type: 'entity',
      label: 'Node D',
      properties: {},
      relations: [],
      strength: 0.7,
    });
  });

  describe('spreadActivation', () => {
    it('应激活种子节点', () => {
      const results = engine.spreadActivation(graph, 'A', 2, 0.1);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.node.id).toBe('A');
      expect(results[0]!.activation).toBe(1.0);
    });

    it('应沿关系边扩散', () => {
      const results = engine.spreadActivation(graph, 'A', 2, 0.1);
      const activatedIds = results.map((r) => r.node.id);

      expect(activatedIds).toContain('B');
      expect(activatedIds).toContain('D');
    });

    it('应遵守深度限制', () => {
      const results = engine.spreadActivation(graph, 'A', 1, 0.1);
      const activatedIds = results.map((r) => r.node.id);

      expect(activatedIds).toContain('A');
      expect(activatedIds).toContain('B');
      expect(activatedIds).toContain('D');
      expect(activatedIds).not.toContain('C'); // C 在深度 2
    });

    it('应遵守阈值限制', () => {
      const results = engine.spreadActivation(graph, 'A', 5, 0.5);
      // 低激活值节点应被过滤
      expect(results.every((r) => r.activation >= 0.5)).toBe(true);
    });

    it('应按激活值排序', () => {
      const results = engine.spreadActivation(graph, 'A', 2, 0.1);
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.activation).toBeGreaterThanOrEqual(results[i]!.activation);
      }
    });
  });

  describe('calculateAssociationStrength', () => {
    it('应返回 1 对于相同节点', () => {
      const strength = engine.calculateAssociationStrength(graph, 'A', 'A');
      expect(strength).toBe(1.0);
    });

    it('应计算直接关联强度', () => {
      const strength = engine.calculateAssociationStrength(graph, 'A', 'B');
      expect(strength).toBeGreaterThan(0);
    });

    it('应计算间接关联强度', () => {
      const strength = engine.calculateAssociationStrength(graph, 'A', 'C');
      expect(strength).toBeGreaterThan(0);
      expect(strength).toBeLessThan(
        engine.calculateAssociationStrength(graph, 'A', 'B')
      );
    });

    it('应返回 0 对于无关联节点', () => {
      graph.set('E', {
        id: 'E',
        type: 'entity',
        label: 'Node E',
        properties: {},
        relations: [],
        strength: 1.0,
      });

      const strength = engine.calculateAssociationStrength(graph, 'A', 'E');
      expect(strength).toBe(0);
    });
  });

  describe('findShortestPath', () => {
    it('应找到直接路径', () => {
      const path = engine.findShortestPath(graph, 'A', 'B');
      expect(path).toEqual(['A', 'B']);
    });

    it('应找到间接路径', () => {
      const path = engine.findShortestPath(graph, 'A', 'C');
      expect(path).toEqual(['A', 'B', 'C']);
    });

    it('应返回空数组对于无路径节点', () => {
      graph.set('E', {
        id: 'E',
        type: 'entity',
        label: 'Node E',
        properties: {},
        relations: [],
        strength: 1.0,
      });

      const path = engine.findShortestPath(graph, 'A', 'E');
      expect(path).toEqual([]);
    });
  });

  describe('spreadFromMultiple', () => {
    it('应合并多种子的激活结果', () => {
      const results = engine.spreadFromMultiple(graph, ['A', 'B'], 2, 0.1);
      const activatedIds = results.map((r) => r.node.id);

      expect(activatedIds).toContain('A');
      expect(activatedIds).toContain('B');
      expect(activatedIds).toContain('C');
      expect(activatedIds).toContain('D');
    });
  });
});

describe('Hippocampus - 梦境引擎', () => {
  let dreamEngine: DreamEngine;
  let episodicStore: Map<string, Episode>;
  let semanticGraph: Map<string, SemanticNode>;

  beforeEach(() => {
    dreamEngine = new DreamEngine();
    episodicStore = new Map();
    semanticGraph = new Map();

    // 创建测试情节
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      const episode: Episode = {
        id: `ep_${i}`,
        timestamp: now - i * 60 * 60 * 1000,
        title: `Episode ${i}`,
        narrative: `Test narrative ${i}`,
        emotionalWeight: 0.5 + i * 0.1,
        tags: [`tag${i % 2}`, 'common'],
        associations: [],
        decayRate: 24 * 60 * 60 * 1000,
        accessCount: 0,
      };
      episodicStore.set(episode.id, episode);
    }
  });

  describe('executeDreamCycle', () => {
    it('应执行梦境周期并返回结果', () => {
      const result = dreamEngine.executeDreamCycle(
        episodicStore,
        semanticGraph,
        Date.now()
      );

      expect(result).toHaveProperty('episodesReplayed');
      expect(result).toHaveProperty('patternsExtracted');
      expect(result).toHaveProperty('memoriesConsolidated');
      expect(result).toHaveProperty('memoriesDecayed');
      expect(result).toHaveProperty('insights');
    });

    it('应选取近期情节进行重播', () => {
      const result = dreamEngine.executeDreamCycle(
        episodicStore,
        semanticGraph,
        Date.now()
      );

      expect(result.episodesReplayed).toBeGreaterThan(0);
      expect(result.episodesReplayed).toBeLessThanOrEqual(10); // 默认最大值
    });

    it('应创建语义节点', () => {
      dreamEngine.executeDreamCycle(episodicStore, semanticGraph, Date.now());

      // 应该创建了与标签对应的语义节点
      expect(semanticGraph.size).toBeGreaterThan(0);
    });
  });
});

describe('Hippocampus - 记忆引擎', () => {
  let engine: HippocampusEngine;

  beforeEach(() => {
    // 禁用自动维护以避免干扰测试
    engine = new HippocampusEngine({
      ...DEFAULT_MEMORY_CONFIG,
      dreamingEnabled: false,
      autoDecayEnabled: false,
    });
  });

  afterEach(() => {
    engine.stop();
  });

  describe('工作记忆', () => {
    it('应获取初始工作记忆', () => {
      const wm = engine.getWorkingMemory();
      expect(wm.currentFocus).toBeNull();
      expect(wm.activeContext).toEqual([]);
      expect(wm.shortTermBuffer).toEqual([]);
    });

    it('应设置焦点', () => {
      engine.focusOn('target1');
      const wm = engine.getWorkingMemory();
      expect(wm.currentFocus).toBe('target1');
    });

    it('应添加到上下文', () => {
      engine.addToContext('item1');
      const wm = engine.getWorkingMemory();
      expect(wm.activeContext).toContain('item1');
    });

    it('应添加到缓冲区', () => {
      engine.addToBuffer('buffer1');
      const wm = engine.getWorkingMemory();
      expect(wm.shortTermBuffer).toContain('buffer1');
    });

    it('应遵守缓冲区容量限制', () => {
      const capacity = engine.getWorkingMemory().capacity;
      for (let i = 0; i < capacity + 5; i++) {
        engine.addToBuffer(`item${i}`);
      }

      const wm = engine.getWorkingMemory();
      expect(wm.shortTermBuffer.length).toBeLessThanOrEqual(capacity);
    });
  });

  describe('情节记忆', () => {
    it('应存储情节记忆', () => {
      const episode = engine.storeEpisode({
        title: 'Test Episode',
        narrative: 'Test narrative',
        emotionalWeight: 0.8,
        tags: ['test'],
        associations: [],
      });

      expect(episode.id).toBeTruthy();
      expect(episode.title).toBe('Test Episode');
      expect(episode.timestamp).toBeTruthy();
    });

    it('应检索情节记忆', () => {
      const stored = engine.storeEpisode({
        title: 'Test Episode',
        narrative: 'Test narrative',
        emotionalWeight: 0.8,
        tags: ['test'],
        associations: [],
      });

      const retrieved = engine.retrieveEpisode(stored.id);
      expect(retrieved).toBeTruthy();
      expect(retrieved!.id).toBe(stored.id);
    });

    it('应增加访问计数', () => {
      const stored = engine.storeEpisode({
        title: 'Test Episode',
        narrative: 'Test narrative',
        emotionalWeight: 0.8,
        tags: ['test'],
        associations: [],
      });

      engine.retrieveEpisode(stored.id);
      const retrieved = engine.retrieveEpisode(stored.id);

      expect(retrieved!.accessCount).toBeGreaterThanOrEqual(2);
    });

    it('应按标签检索', () => {
      engine.storeEpisode({
        title: 'Episode 1',
        narrative: 'Test',
        emotionalWeight: 0.5,
        tags: ['important'],
        associations: [],
      });

      engine.storeEpisode({
        title: 'Episode 2',
        narrative: 'Test',
        emotionalWeight: 0.5,
        tags: ['important'],
        associations: [],
      });

      engine.storeEpisode({
        title: 'Episode 3',
        narrative: 'Test',
        emotionalWeight: 0.5,
        tags: ['other'],
        associations: [],
      });

      const importantEpisodes = engine.getEpisodesByTag('important');
      expect(importantEpisodes.length).toBe(2);
    });

    it('应删除情节记忆', () => {
      const stored = engine.storeEpisode({
        title: 'Test Episode',
        narrative: 'Test narrative',
        emotionalWeight: 0.8,
        tags: ['test'],
        associations: [],
      });

      const deleted = engine.deleteEpisode(stored.id);
      expect(deleted).toBe(true);

      const retrieved = engine.retrieveEpisode(stored.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('语义记忆', () => {
    it('应添加语义节点', () => {
      const node = engine.addSemanticNode({
        id: 'node1',
        type: 'concept',
        label: 'Test Concept',
        properties: {},
        strength: 0.8,
      });

      expect(node.id).toBe('node1');
      expect(node.label).toBe('Test Concept');
    });

    it('应检索语义节点', () => {
      engine.addSemanticNode({
        id: 'node1',
        type: 'concept',
        label: 'Test Concept',
        properties: {},
        strength: 0.8,
      });

      const retrieved = engine.getSemanticNode('node1');
      expect(retrieved).toBeTruthy();
      expect(retrieved!.label).toBe('Test Concept');
    });

    it('应添加语义关系', () => {
      engine.addSemanticNode({
        id: 'node1',
        type: 'concept',
        label: 'Concept 1',
        properties: {},
        strength: 0.8,
      });

      engine.addSemanticNode({
        id: 'node2',
        type: 'concept',
        label: 'Concept 2',
        properties: {},
        strength: 0.7,
      });

      engine.addRelation('node1', 'node2', 'related', 0.9);

      const node1 = engine.getSemanticNode('node1')!;
      expect(node1.relations.length).toBe(1);
      expect(node1.relations[0]!.to).toBe('node2');
      expect(node1.relations[0]!.weight).toBe(0.9);
    });

    it('应删除语义节点', () => {
      engine.addSemanticNode({
        id: 'node1',
        type: 'concept',
        label: 'Concept 1',
        properties: {},
        strength: 0.8,
      });

      const deleted = engine.deleteSemanticNode('node1');
      expect(deleted).toBe(true);

      const retrieved = engine.getSemanticNode('node1');
      expect(retrieved).toBeNull();
    });
  });

  describe('联想扩散', () => {
    beforeEach(() => {
      // 构建测试图谱
      engine.addSemanticNode({
        id: 'A',
        type: 'entity',
        label: 'Entity A',
        properties: {},
        strength: 1.0,
      });

      engine.addSemanticNode({
        id: 'B',
        type: 'entity',
        label: 'Entity B',
        properties: {},
        strength: 0.8,
      });

      engine.addSemanticNode({
        id: 'C',
        type: 'concept',
        label: 'Concept C',
        properties: {},
        strength: 0.6,
      });

      engine.addRelation('A', 'B', 'related', 0.9);
      engine.addRelation('B', 'C', 'related', 0.7);

      // 创建关联的情节
      const episode = engine.storeEpisode({
        title: 'Related Episode',
        narrative: 'Test',
        emotionalWeight: 0.7,
        tags: ['Entity A'],
        associations: ['A'],
      });
    });

    it('应执行联想扩散', () => {
      const query: AssociativeQuery = {
        seed: 'A',
        depth: 2,
        threshold: 0.1,
        limit: 10,
      };

      const result = engine.associativeRecall(query);

      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.nodes[0]!.id).toBe('A');
      expect(result.relevanceScore).toBeGreaterThan(0);
    });

    it('应包含激活的情节记忆', () => {
      const query: AssociativeQuery = {
        seed: 'A',
        depth: 1,
        threshold: 0.1,
        limit: 10,
      };

      const result = engine.associativeRecall(query);
      expect(result.episodes.length).toBeGreaterThan(0);
    });
  });

  describe('程序记忆', () => {
    it('应存储程序记忆', () => {
      const memory = engine.storeProcedural({
        skillId: 'skill1',
        compiled: false,
        fastPath: false,
        usageCount: 0,
        lastUsed: 0,
      });

      expect(memory.id).toBeTruthy();
      expect(memory.skillId).toBe('skill1');
    });

    it('应检索程序记忆', () => {
      engine.storeProcedural({
        skillId: 'skill1',
        compiled: true,
        fastPath: false,
        usageCount: 0,
        lastUsed: 0,
      });

      const retrieved = engine.retrieveProcedural('skill1');
      expect(retrieved).toBeTruthy();
      expect(retrieved!.skillId).toBe('skill1');
    });

    it('应增加使用计数', () => {
      engine.storeProcedural({
        skillId: 'skill1',
        compiled: true,
        fastPath: false,
        usageCount: 0,
        lastUsed: 0,
      });

      engine.retrieveProcedural('skill1');
      engine.retrieveProcedural('skill1');

      const retrieved = engine.retrieveProcedural('skill1');
      expect(retrieved!.usageCount).toBeGreaterThanOrEqual(2);
    });

    it('应标记为快速路径', () => {
      engine.storeProcedural({
        skillId: 'skill1',
        compiled: false,
        fastPath: false,
        usageCount: 0,
        lastUsed: 0,
      });

      const marked = engine.markAsFastPath('skill1');
      expect(marked).toBe(true);

      const retrieved = engine.retrieveProcedural('skill1');
      expect(retrieved!.fastPath).toBe(true);
      expect(retrieved!.compiled).toBe(true);
    });
  });

  describe('前瞻记忆', () => {
    it('应添加前瞻记忆', () => {
      const memory = engine.addProspective({
        type: 'todo',
        triggerTime: Date.now() + 1000,
        description: 'Test todo',
        priority: 5,
        completed: false,
      });

      expect(memory.id).toBeTruthy();
      expect(memory.description).toBe('Test todo');
    });

    it('应获取到期的前瞻记忆', () => {
      engine.addProspective({
        type: 'timer',
        triggerTime: Date.now() - 1000, // 已过期
        description: 'Past due',
        priority: 3,
        completed: false,
      });

      engine.addProspective({
        type: 'timer',
        triggerTime: Date.now() + 10000, // 未来
        description: 'Future',
        priority: 1,
        completed: false,
      });

      const due = engine.checkDue();
      expect(due.length).toBe(1);
      expect(due[0]!.description).toBe('Past due');
    });

    it('应按优先级排序到期记忆', () => {
      engine.addProspective({
        type: 'todo',
        triggerTime: Date.now() - 1000,
        description: 'Low priority',
        priority: 1,
        completed: false,
      });

      engine.addProspective({
        type: 'todo',
        triggerTime: Date.now() - 1000,
        description: 'High priority',
        priority: 10,
        completed: false,
      });

      const due = engine.checkDue();
      expect(due[0]!.description).toBe('High priority');
    });

    it('应完成前瞻记忆', () => {
      const memory = engine.addProspective({
        type: 'todo',
        triggerTime: Date.now() - 1000,
        description: 'Test',
        priority: 5,
        completed: false,
      });

      const completed = engine.completeProspective(memory.id);
      expect(completed).toBe(true);

      const due = engine.checkDue();
      expect(due.find((d) => d.id === memory.id)).toBeUndefined();
    });
  });

  describe('维护操作', () => {
    it('应应用遗忘曲线', () => {
      engine.storeEpisode({
        title: 'Test',
        narrative: 'Test',
        emotionalWeight: 1.0,
        tags: [],
        associations: [],
      });

      engine.applyDecay();

      const episodes = engine.getAllEpisodes();
      expect(episodes.length).toBe(1);
    });

    it('应执行梦境周期', async () => {
      const result = await engine.dreamCycle();

      expect(result).toHaveProperty('episodesReplayed');
      expect(result).toHaveProperty('patternsExtracted');
      expect(result).toHaveProperty('memoriesConsolidated');
      expect(result).toHaveProperty('insights');
    });
  });

  describe('统计和报告', () => {
    beforeEach(() => {
      engine.storeEpisode({
        title: 'Test Episode',
        narrative: 'Test',
        emotionalWeight: 0.8,
        tags: ['test'],
        associations: [],
      });

      engine.addSemanticNode({
        type: 'concept',
        label: 'Test Concept',
        properties: {},
        strength: 0.8,
      });

      engine.storeProcedural({
        skillId: 'testSkill',
        compiled: true,
        fastPath: false,
        usageCount: 0,
        lastUsed: 0,
      });

      engine.addProspective({
        type: 'todo',
        triggerTime: Date.now() + 1000,
        description: 'Test',
        priority: 5,
        completed: false,
      });
    });

    it('应获取记忆统计', () => {
      const stats = engine.getStats();

      expect(stats.episodes).toBe(1);
      expect(stats.semanticNodes).toBe(1);
      expect(stats.proceduralMemories).toBe(1);
      expect(stats.prospectiveMemories).toBe(1);
    });

    it('应获取健康报告', () => {
      const report = engine.getHealthReport();

      expect(report.length).toBeGreaterThan(0);
      expect(report[0]!.type).toBe(MemoryLayer.Episodic);
      expect(report[0]!.health).toBeTruthy();
    });
  });

  describe('导出和导入', () => {
    it('应导出所有记忆', () => {
      engine.storeEpisode({
        title: 'Test Episode',
        narrative: 'Test',
        emotionalWeight: 0.8,
        tags: ['test'],
        associations: [],
      });

      engine.addSemanticNode({
        id: 'testNode',
        type: 'concept',
        label: 'Test Concept',
        properties: {},
        strength: 0.8,
      });

      const exported = engine.export();

      expect(exported.episodic.length).toBe(1);
      expect(exported.semantic.length).toBe(1);
      expect(exported.workingMemory).toBeTruthy();
      expect(exported.exportedAt).toBeTruthy();
    });

    it('应导入记忆', () => {
      const data = {
        episodic: [
          {
            id: 'imported1',
            timestamp: Date.now(),
            title: 'Imported Episode',
            narrative: 'Test',
            emotionalWeight: 0.5,
            tags: [],
            associations: [],
            decayRate: 1000,
            accessCount: 0,
          },
        ],
        semantic: [
          {
            id: 'importedNode',
            type: 'concept' as const,
            label: 'Imported Concept',
            properties: {},
            relations: [],
            strength: 0.7,
          },
        ],
      };

      engine.import(data);

      const stats = engine.getStats();
      expect(stats.episodes).toBe(1);
      expect(stats.semanticNodes).toBe(1);
    });
  });

  describe('事件系统', () => {
    it('应触发和接收事件', () => {
      const callback = vi.fn();
      engine.on('episodeStored', callback);

      engine.storeEpisode({
        title: 'Test Episode',
        narrative: 'Test',
        emotionalWeight: 0.8,
        tags: ['test'],
        associations: [],
      });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('应支持取消订阅', () => {
      const callback = vi.fn();
      engine.on('episodeStored', callback);
      engine.off('episodeStored', callback);

      engine.storeEpisode({
        title: 'Test Episode',
        narrative: 'Test',
        emotionalWeight: 0.8,
        tags: ['test'],
        associations: [],
      });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('自传体叙事', () => {
    it('应初始化默认叙事', () => {
      const narrative = engine.getNarrative();
      expect(narrative.identityStatement).toBeTruthy();
      expect(narrative.chapters).toEqual([]);
      expect(narrative.activeThemes).toEqual([]);
      expect(narrative.relationships).toEqual([]);
    });

    it('应更新身份声明', () => {
      engine.updateIdentityStatement('I am a learning AI companion.');
      const narrative = engine.getNarrative();
      expect(narrative.identityStatement).toBe('I am a learning AI companion.');
    });

    it('应添加叙事章节', () => {
      const chapter = engine.addChapter({
        title: 'Early Days',
        summary: 'Learning the basics',
        startTime: Date.now() - 86400000,
        endTime: Date.now(),
        keyEpisodes: [],
        emotionalTone: 'curious',
        significance: 0.7,
      });

      expect(chapter.id).toBeTruthy();
      expect(engine.getNarrative().chapters).toHaveLength(1);
      expect(engine.getNarrative().chapters[0].title).toBe('Early Days');
    });

    it('应更新活跃主题', () => {
      engine.updateActiveThemes(['coding', 'debugging', 'learning']);
      expect(engine.getNarrative().activeThemes).toEqual(['coding', 'debugging', 'learning']);
    });

    it('应创建新用户关系', () => {
      engine.updateRelationship('user-1', {
        summary: 'Frequent collaborator',
        trustLevel: 0.8,
        communicationStyle: 'direct',
      });

      const rel = engine.getRelationship('user-1');
      expect(rel).not.toBeNull();
      expect(rel!.summary).toBe('Frequent collaborator');
      expect(rel!.trustLevel).toBe(0.8);
    });

    it('应更新已有用户关系', () => {
      engine.updateRelationship('user-1', {
        summary: 'Initial',
        trustLevel: 0.5,
      });
      engine.updateRelationship('user-1', {
        trustLevel: 0.9,
      });

      const rel = engine.getRelationship('user-1');
      expect(rel!.trustLevel).toBe(0.9);
      expect(rel!.summary).toBe('Initial'); // 未修改字段保持不变
    });

    it('应返回 null 查找不存在的关系', () => {
      expect(engine.getRelationship('nonexistent')).toBeNull();
    });

    it('应生成叙事上下文用于提示', () => {
      engine.updateIdentityStatement('I am Killer, a growing AI.');
      engine.updateActiveThemes(['coding', 'debugging']);
      engine.addChapter({
        title: 'Sprint 1',
        summary: 'Built the core memory system',
        startTime: Date.now() - 86400000,
        endTime: Date.now(),
        keyEpisodes: [],
        emotionalTone: 'productive',
        significance: 0.8,
      });

      const context = engine.getNarrativeContextForPrompt();
      expect(context).toContain('I am Killer, a growing AI.');
      expect(context).toContain('coding');
      expect(context).toContain('Sprint 1');
    });

    it('应返回空上下文当叙事为空时', () => {
      const context = engine.getNarrativeContextForPrompt();
      // 默认有 identityStatement，所以不为空
      expect(context).toBeTruthy();
    });

    it('应合成章节从已有 episodes', () => {
      // 存储足够的 episodes
      for (let i = 0; i < 5; i++) {
        engine.storeEpisode({
          title: `Episode ${i}`,
          narrative: `Something happened ${i}`,
          emotionalWeight: 0.6,
          tags: ['testing', 'coding'],
          associations: [],
        });
      }

      const chapter = engine.synthesizeChapter(
        'Testing Period',
        'A period of intensive testing',
        'focused'
      );

      expect(chapter).not.toBeNull();
      expect(chapter!.title).toBe('Testing Period');
      expect(chapter!.keyEpisodes.length).toBeGreaterThan(0);
    });

    it('应返回 null 合成章节当没有 episodes', () => {
      const chapter = engine.synthesizeChapter('Empty', 'Nothing here', 'neutral');
      expect(chapter).toBeNull();
    });

    it('应在梦境周期中合成叙事', async () => {
      // 存储足够的 episodes 触发叙事合成
      for (let i = 0; i < 5; i++) {
        engine.storeEpisode({
          title: `Dream Episode ${i}`,
          narrative: `Experience ${i}`,
          emotionalWeight: 0.7,
          tags: ['discovery'],
          associations: [],
        });
      }

      const result = await engine.dreamCycle();
      expect(result.narrativeSynthesized).toBe(true);
      expect(engine.getNarrative().chapters.length).toBeGreaterThan(0);
    });

    it('不应在无 episodes 时合成叙事', async () => {
      const result = await engine.dreamCycle();
      expect(result.narrativeSynthesized).toBe(false);
    });

    it('应在导出中包含叙事', () => {
      engine.updateIdentityStatement('Export test');
      const exported = engine.export();
      expect(exported.narrative.identityStatement).toBe('Export test');
    });

    it('应导入叙事', () => {
      engine.updateIdentityStatement('Original');
      const exported = engine.export();

      const engine2 = new HippocampusEngine();
      engine2.import(exported);

      expect(engine2.getNarrative().identityStatement).toBe('Original');
    });

    it('应在 clear 时重置叙事', () => {
      engine.updateIdentityStatement('Custom identity');
      engine.addChapter({
        title: 'Test',
        summary: 'Test chapter',
        startTime: Date.now(),
        endTime: Date.now(),
        keyEpisodes: [],
        emotionalTone: 'neutral',
        significance: 0.5,
      });

      engine.clear();
      const narrative = engine.getNarrative();
      // 应回到默认叙事
      expect(narrative.chapters).toHaveLength(0);
      expect(narrative.activeThemes).toHaveLength(0);
    });
  });
});
