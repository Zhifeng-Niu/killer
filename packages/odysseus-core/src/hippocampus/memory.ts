/**
 * Hippocampus - 记忆引擎接口和实现
 *
 * 超越 RAG 的类脑记忆系统
 */

import type {
  Episode,
  SemanticNode,
  SemanticRelation,
  ProceduralMemory,
  ProspectiveMemory,
  WorkingMemory,
  DreamMemory,
  AssociativeQuery,
  AssociativeResult,
  AutobiographicalNarrative,
  NarrativeChapter,
  RelationshipNarrative,
} from './types.js';
import { MemoryLayer } from './types.js';
import { AssociationEngine, semanticSearch } from './association.js';
import { DreamEngine } from './dreaming.js';
import type { DreamResult, CounterfactualBranch } from './dreaming.js';
import { NarrativeSynthesisEngine } from './narrative-synthesis.js';
import {
  calculateRetention,
  shouldRecall,
  reinforce,
  decay,
  calculateNextReview,
  getMemoryHealth,
  DEFAULT_FORGETTING_CONFIG,
  type ForgettingConfig,
  applyForgettingCurve,
  calculateInformationDensity,
  adjustStabilityByDensity,
} from './forgetting.js';
import type { IStorage } from '../storage/types.js';

/**
 * 梦境周期结果（与 DreamEngine.DreamResult 兼容）
 */
export interface DreamingResult {
  episodesReplayed: number;
  patternsExtracted: number;
  memoriesConsolidated: number;
  memoriesDecayed: number;
  insights: string[];
  narrativeSynthesized: boolean;
  counterfactualBranches?: CounterfactualBranch[];
}

/**
 * 记忆引擎配置
 */
export interface MemoryConfig {
  /**
   * 工作记忆容量
   */
  workingMemoryCapacity: number;

  /**
   * 遗忘曲线配置
   */
  forgetting: ForgettingConfig;

  /**
   * 是否启用梦境模式
   */
  dreamingEnabled: boolean;

  /**
   * 梦境周期间隔（毫秒）
   */
  dreamInterval: number;

  /**
   * 是否启用自动衰减
   */
  autoDecayEnabled: boolean;

  /**
   * 自动衰减间隔（毫秒）
   */
  decayInterval: number;
}

/**
 * 默认记忆引擎配置
 */
export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  workingMemoryCapacity: 7,
  forgetting: DEFAULT_FORGETTING_CONFIG,
  dreamingEnabled: true,
  dreamInterval: 60 * 60 * 1000, // 1 小时
  autoDecayEnabled: true,
  decayInterval: 5 * 60 * 1000, // 5 分钟
};

/**
 * Hippocampus 记忆引擎
 *
 * 管理五层记忆：工作记忆、情节记忆、语义记忆、程序记忆、前瞻记忆
 */
export class HippocampusEngine {
  // === 配置 ===
  private config: MemoryConfig;

  // === 工作记忆 ===
  workingMemory: WorkingMemory;

  // === 情节记忆 ===
  private episodicStore: Map<string, Episode>;

  // === 语义记忆 ===
  private semanticGraph: Map<string, SemanticNode>;

  // === 程序记忆 ===
  private proceduralStore: Map<string, ProceduralMemory>;

  // === 前瞻记忆 ===
  private prospectiveStore: Map<string, ProspectiveMemory>;

  // === 梦境记忆 ===
  private dreamStore: Map<string, DreamMemory>;

  // === 子引擎 ===
  private associationEngine: AssociationEngine;
  private dreamEngine: DreamEngine;
  private narrativeSynthesis: NarrativeSynthesisEngine;

  // === 自传体叙事 ===
  private narrative: AutobiographicalNarrative;

  // === 定时器 ===
  private dreamTimer: ReturnType<typeof setInterval> | null = null;
  private decayTimer: ReturnType<typeof setInterval> | null = null;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;

  // === 事件监听器 ===
  private eventListeners: Map<string, Array<(data: unknown) => void>>;

  // === 持久化存储 ===
  private storage: IStorage | null = null;
  private dirty: boolean = false;
  private storageReady: boolean = false;

  constructor(config: MemoryConfig = DEFAULT_MEMORY_CONFIG, storage?: IStorage) {
    this.config = config;
    this.episodicStore = new Map();
    this.semanticGraph = new Map();
    this.proceduralStore = new Map();
    this.prospectiveStore = new Map();
    this.dreamStore = new Map();
    this.eventListeners = new Map();
    this.narrative = this.createInitialNarrative();

    // 初始化工作记忆
    this.workingMemory = {
      currentFocus: null,
      activeContext: [],
      shortTermBuffer: [],
      capacity: config.workingMemoryCapacity,
    };

    // 初始化子引擎
    this.associationEngine = new AssociationEngine();
    this.dreamEngine = new DreamEngine();
    this.narrativeSynthesis = new NarrativeSynthesisEngine();

    // 启动自动维护
    this.startMaintenance();

    // 如果提供了存储，绑定并加载已有记忆
    if (storage) {
      this.attachStorage(storage);
    }
  }

  // === 持久化 ===

  /**
   * 绑定持久化存储层
   *
   * 绑定后会自动：
   * 1. 从存储加载已有记忆到内存
   * 2. 每次写操作同步写入存储（write-through）
   * 3. 定期自动保存（防丢失）
   */
  async attachStorage(storage: IStorage): Promise<void> {
    this.storage = storage;
    await storage.initialize();
    this.storageReady = true;

    // 从存储加载已有记忆
    const episodes = await storage.episodes.loadAll();
    for (const ep of episodes) {
      this.episodicStore.set(ep.id, ep);
    }

    const nodes = await storage.semantic.loadAll();
    for (const node of nodes) {
      this.semanticGraph.set(node.id, node);
    }

    const prospective = await storage.prospective.loadAll();
    for (const p of prospective) {
      this.prospectiveStore.set(p.id, p);
    }

    // 启动自动保存（每30秒检查dirty标记）
    this.autoSaveTimer = setInterval(() => this.autoSave(), 30_000);

    this.emit('storageAttached', {
      episodesLoaded: episodes.length,
      semanticLoaded: nodes.length,
      prospectiveLoaded: prospective.length,
    });
  }

  /**
   * 分离持久化存储层
   */
  async detachStorage(): Promise<void> {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    // 最终保存
    await this.flushToStorage();
    if (this.storage) {
      await this.storage.close();
    }
    this.storage = null;
    this.storageReady = false;
  }

  /**
   * 标记为dirty（有未保存的数据）
   */
  private markDirty(): void {
    this.dirty = true;
  }

  /**
   * 自动保存（仅在dirty时执行）
   */
  private async autoSave(): Promise<void> {
    if (this.dirty) {
      await this.flushToStorage();
    }
  }

  /**
   * 强制将所有内存数据flush到存储层
   */
  async flushToStorage(): Promise<void> {
    if (!this.storage || !this.storageReady) return;

    try {
      for (const episode of this.episodicStore.values()) {
        await this.storage.episodes.save(episode);
      }
      for (const node of this.semanticGraph.values()) {
        await this.storage.semantic.save(node);
      }
      for (const p of this.prospectiveStore.values()) {
        await this.storage.prospective.save(p);
      }
      this.dirty = false;
    } catch (err) {
      this.emit('error', { source: 'flushToStorage', error: err });
    }
  }

  private async persistEpisode(episode: Episode): Promise<void> {
    if (this.storage && this.storageReady) {
      try { await this.storage.episodes.save(episode); } catch (err) { this.emit('error', { source: 'persistEpisode', error: err }); }
    }
  }

  private async persistSemanticNode(node: SemanticNode): Promise<void> {
    if (this.storage && this.storageReady) {
      try { await this.storage.semantic.save(node); } catch (err) { this.emit('error', { source: 'persistSemanticNode', error: err }); }
    }
  }

  private async removePersistedEpisode(id: string): Promise<void> {
    if (this.storage && this.storageReady) {
      try { await this.storage.episodes.delete(id); } catch (err) { this.emit('error', { source: 'removePersistedEpisode', error: err }); }
    }
  }

  private async removePersistedSemanticNode(id: string): Promise<void> {
    if (this.storage && this.storageReady) {
      try { await this.storage.semantic.delete(id); } catch (err) { this.emit('error', { source: 'removePersistedSemanticNode', error: err }); }
    }
  }

  // === 工作记忆 ===

  /**
   * 获取当前工作记忆
   */
  getWorkingMemory(): WorkingMemory {
    return { ...this.workingMemory };
  }

  /**
   * 更新工作记忆
   */
  updateWorkingMemory(update: Partial<WorkingMemory>): void {
    this.workingMemory = {
      ...this.workingMemory,
      ...update,
    };
    this.emit('workingMemoryUpdated', this.workingMemory);
  }

  /**
   * 聚焦到目标
   */
  focusOn(target: string): void {
    this.workingMemory.currentFocus = target;

    // 将目标添加到上下文
    if (!this.workingMemory.activeContext.includes(target)) {
      this.workingMemory.activeContext.push(target);
    }

    this.emit('focusChanged', { target });
  }

  /**
   * 添加到上下文
   */
  addToContext(item: string): void {
    if (!this.workingMemory.activeContext.includes(item)) {
      this.workingMemory.activeContext.push(item);
      // 容量保护：activeContext 不超过 100 项
      if (this.workingMemory.activeContext.length > 100) {
        this.workingMemory.activeContext.shift();
      }
      this.emit('contextAdded', { item });
    }
  }

  /**
   * 添加到短期缓冲区
   */
  addToBuffer(item: string): void {
    this.workingMemory.shortTermBuffer.push(item);

    // 保持缓冲区在容量内
    if (this.workingMemory.shortTermBuffer.length > this.workingMemory.capacity) {
      this.workingMemory.shortTermBuffer.shift();
    }

    this.emit('bufferUpdated', this.workingMemory.shortTermBuffer);
  }

  /**
   * 清空工作记忆
   */
  clearWorkingMemory(): void {
    this.workingMemory = {
      currentFocus: null,
      activeContext: [],
      shortTermBuffer: [],
      capacity: this.config.workingMemoryCapacity,
    };
    this.emit('workingMemoryCleared', null);
  }

  // === 情节记忆 ===

  /**
   * 存储情节记忆（含信息密度评估）
   *
   * 存储时自动评估narrative的信息密度：
   * - 高密度内容 → 更高的初始稳定性（保护有价值记忆）
   * - 低密度内容 → 更低的初始稳定性（自然加速遗忘）
   */
  storeEpisode(episode: Omit<Episode, 'id' | 'timestamp'>): Episode {
    const now = Date.now();
    const baseStability = episode.decayRate ?? this.config.forgetting.defaultStability;

    // 信息熵密度评估 → 调整初始稳定性
    let adjustedStability = baseStability;
    if (this.config.forgetting.entropyDecayEnabled && episode.narrative) {
      const density = calculateInformationDensity(episode.narrative);
      adjustedStability = adjustStabilityByDensity(baseStability, density, this.config.forgetting);
    }

    const newEpisode: Episode = {
      ...episode,
      id: `ep_${now}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: now,
      decayRate: adjustedStability,
      accessCount: 0,
    };

    this.episodicStore.set(newEpisode.id, newEpisode);

    // 容量保护：超过上限时淘汰最旧的休眠记忆
    const EPISODIC_CAP = 5000;
    if (this.episodicStore.size > EPISODIC_CAP) {
      let oldest: { id: string; ts: number } | null = null;
      for (const [id, ep] of this.episodicStore) {
        if (!oldest || ep.timestamp < oldest.ts) {
          oldest = { id, ts: ep.timestamp };
        }
      }
      if (oldest) this.episodicStore.delete(oldest.id);
    }

    this.markDirty();
    this.persistEpisode(newEpisode); // write-through (fire-and-forget)
    this.emit('episodeStored', newEpisode);

    return newEpisode;
  }

  /**
   * 检索情节记忆
   */
  retrieveEpisode(id: string): Episode | null {
    const episode = this.episodicStore.get(id);
    if (!episode) {
      return null;
    }

    const now = Date.now();
    const updated = reinforce(episode, now, this.config.forgetting);
    this.episodicStore.set(id, updated);
    this.markDirty();
    this.persistEpisode(updated); // write-through reinforce

    return updated;
  }

  /**
   * 获取所有情节记忆
   */
  getAllEpisodes(): Episode[] {
    return Array.from(this.episodicStore.values());
  }

  /**
   * 获取近期情节
   */
  getRecentEpisodes(count: number = 10): Episode[] {
    return Array.from(this.episodicStore.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, count);
  }

  /**
   * 按标签检索情节
   */
  getEpisodesByTag(tag: string): Episode[] {
    return Array.from(this.episodicStore.values()).filter((episode) =>
      episode.tags.includes(tag)
    );
  }

  /**
   * 删除情节记忆
   */
  deleteEpisode(id: string): boolean {
    const deleted = this.episodicStore.delete(id);
    if (deleted) {
      this.markDirty();
      this.removePersistedEpisode(id); // write-through delete
      this.emit('episodeDeleted', { id });
    }
    return deleted;
  }

  // === 语义记忆 ===

  /**
   * 添加语义节点
   */
  addSemanticNode(node: Omit<SemanticNode, 'id' | 'relations'> & { id?: string; relations?: SemanticRelation[] }): SemanticNode {
    const newNode: SemanticNode = {
      ...node,
      id: node.id ?? `semantic_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      relations: node.relations ?? [],
    };

    this.semanticGraph.set(newNode.id, newNode);

    // 容量保护：语义图超过上限时淘汰最少连接的节点
    const SEMANTIC_CAP = 3000;
    if (this.semanticGraph.size > SEMANTIC_CAP) {
      let leastConnected: { id: string; rels: number } | null = null;
      for (const [id, n] of this.semanticGraph) {
        if (!leastConnected || n.relations.length < leastConnected.rels) {
          leastConnected = { id, rels: n.relations.length };
        }
      }
      if (leastConnected) this.semanticGraph.delete(leastConnected.id);
    }

    this.markDirty();
    this.persistSemanticNode(newNode); // write-through
    this.emit('semanticNodeAdded', newNode);

    return newNode;
  }

  /**
   * 获取语义节点
   */
  getSemanticNode(id: string): SemanticNode | null {
    return this.semanticGraph.get(id) ?? null;
  }

  /**
   * 按类型获取语义节点
   */
  getSemanticNodesByType(type: SemanticNode['type']): SemanticNode[] {
    return Array.from(this.semanticGraph.values()).filter((node) => node.type === type);
  }

  /**
   * 添加语义关系
   */
  addRelation(from: string, to: string, type: string, weight: number): void {
    const fromNode = this.semanticGraph.get(from);
    if (!fromNode) {
      throw new Error(`Source node not found: ${from}`);
    }

    const existingRelation = fromNode.relations.find(
      (r) => r.to === to && r.type === type
    );

    if (existingRelation) {
      existingRelation.weight = weight;
    } else {
      fromNode.relations.push({ to, type, weight });
    }

    this.markDirty();
    this.persistSemanticNode(fromNode); // write-through relation update
    this.emit('relationAdded', { from, to, type, weight });
  }

  /**
   * 删除语义节点
   */
  deleteSemanticNode(id: string): boolean {
    for (const node of this.semanticGraph.values()) {
      node.relations = node.relations.filter((r) => r.to !== id);
    }

    const deleted = this.semanticGraph.delete(id);
    if (deleted) {
      this.markDirty();
      this.removePersistedSemanticNode(id); // write-through delete
      this.emit('semanticNodeDeleted', { id });
    }
    return deleted;
  }

  // === 联想扩散（替代 RAG）===

  /**
   * 联想扩散检索
   */
  associativeRecall(query: AssociativeQuery): AssociativeResult {
    // 激活语义节点
    const activatedNodes = this.associationEngine.spreadActivation(
      this.semanticGraph,
      query.seed,
      query.depth,
      query.threshold
    );

    // 激活关联的情节记忆
    const activatedEpisodes: Episode[] = [];
    for (const node of activatedNodes) {
      for (const episode of this.episodicStore.values()) {
        if (
          episode.associations.includes(node.node.id) ||
          episode.tags.includes(node.node.label)
        ) {
          if (!activatedEpisodes.includes(episode)) {
            activatedEpisodes.push(episode);
          }
        }
      }
    }

    // 计算相关性分数
    const relevanceScore =
      activatedNodes.length > 0
        ? activatedNodes.reduce((sum, n) => sum + n.activation, 0) / activatedNodes.length
        : 0;

    // 限制结果数量
    const nodes = activatedNodes.slice(0, query.limit).map((a) => a.node);
    const episodes = activatedEpisodes.slice(0, query.limit);

    return {
      nodes,
      episodes,
      relevanceScore,
    };
  }

  /**
   * 语义搜索（TF-IDF + 余弦相似度）
   *
   * 当没有明确的语义图谱节点时，直接对 episode narrative 做语义匹配。
   * 这是 associativeRecall 的补充——适合"模糊回忆"场景。
   *
   * @param queryText - 查询文本
   * @param limit - 返回数量上限
   * @param threshold - 最低相似度阈值
   * @returns 按语义相似度排序的 episode 列表
   */
  semanticRecall(queryText: string, limit: number = 10, threshold: number = 0.15): Episode[] {
    const candidates = Array.from(this.episodicStore.values()).map(ep => ({
      id: ep.id,
      // 搜索范围：narrative + title + tags
      text: `${ep.narrative || ''} ${ep.title || ''} ${ep.tags.join(' ')}`,
    }));

    const results = semanticSearch(queryText, candidates, limit, threshold);

    return results.map(r => {
      const episode = this.episodicStore.get(r.id);
      return episode!;
    }).filter(Boolean);
  }

  /**
   * 获取节点间的关联强度
   */
  getAssociationStrength(from: string, to: string): number {
    return this.associationEngine.calculateAssociationStrength(
      this.semanticGraph,
      from,
      to
    );
  }

  /**
   * 获取最短激活路径
   */
  getShortestPath(from: string, to: string): string[] {
    return this.associationEngine.findShortestPath(this.semanticGraph, from, to);
  }

  // === 程序记忆 ===

  /**
   * 存储程序记忆
   */
  storeProcedural(memory: Omit<ProceduralMemory, 'id'>): ProceduralMemory {
    const newMemory: ProceduralMemory = {
      ...memory,
      id: `proc_${memory.skillId}_${Date.now()}`,
      lastUsed: Date.now(),
    };

    this.proceduralStore.set(newMemory.id, newMemory);
    this.emit('proceduralStored', newMemory);

    return newMemory;
  }

  /**
   * 检索程序记忆
   */
  retrieveProcedural(skillId: string): ProceduralMemory | null {
    for (const memory of this.proceduralStore.values()) {
      if (memory.skillId === skillId) {
        // 更新使用统计
        memory.usageCount++;
        memory.lastUsed = Date.now();
        return memory;
      }
    }
    return null;
  }

  /**
   * 标记为快速路径
   */
  markAsFastPath(skillId: string): boolean {
    const memory = this.retrieveProcedural(skillId);
    if (memory) {
      memory.fastPath = true;
      memory.compiled = true;
      return true;
    }
    return false;
  }

  // === 前瞻记忆 ===

  /**
   * 添加前瞻记忆
   */
  addProspective(item: Omit<ProspectiveMemory, 'id'>): ProspectiveMemory {
    const newItem: ProspectiveMemory = {
      ...item,
      id: `prospective_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    };

    this.prospectiveStore.set(newItem.id, newItem);
    this.markDirty();
    // write-through persist
    if (this.storage && this.storageReady) {
      this.storage.prospective.save(newItem).catch(() => {});
    }
    this.emit('prospectiveAdded', newItem);

    return newItem;
  }

  /**
   * 获取到期前瞻记忆
   */
  checkDue(now: number = Date.now()): ProspectiveMemory[] {
    const due: ProspectiveMemory[] = [];

    for (const memory of this.prospectiveStore.values()) {
      if (!memory.completed && memory.triggerTime <= now) {
        due.push(memory);
      }
    }

    // 按优先级排序
    due.sort((a, b) => b.priority - a.priority);

    return due;
  }

  /**
   * 完成前瞻记忆
   */
  completeProspective(id: string): boolean {
    const memory = this.prospectiveStore.get(id);
    if (memory) {
      memory.completed = true;
      this.markDirty();
      if (this.storage && this.storageReady) {
        this.storage.prospective.save(memory).catch(() => {});
      }
      this.emit('prospectiveCompleted', memory);
      return true;
    }
    return false;
  }

  /**
   * 删除前瞻记忆
   */
  deleteProspective(id: string): boolean {
    const deleted = this.prospectiveStore.delete(id);
    if (deleted) {
      this.markDirty();
      if (this.storage && this.storageReady) {
        this.storage.prospective.delete(id).catch(() => {});
      }
    }
    return deleted;
  }

  // === 自传体叙事 ===

  /**
   * 获取当前叙事（只读）
   */
  getNarrative(): Readonly<AutobiographicalNarrative> {
    return this.narrative;
  }

  /**
   * 获取叙事上下文片段（用于系统提示注入）
   *
   * 返回精简的叙事摘要，包括身份声明、最近章节和活跃主题
   */
  getNarrativeContextForPrompt(): string {
    const { identityStatement, chapters, activeThemes, relationships } = this.narrative;

    const parts: string[] = [];

    if (identityStatement) {
      parts.push(`Identity: ${identityStatement}`);
    }

    if (activeThemes.length > 0) {
      parts.push(`Active themes: ${activeThemes.join(', ')}`);
    }

    // 最近 3 个章节
    const recentChapters = chapters.slice(-3);
    if (recentChapters.length > 0) {
      parts.push('Recent life chapters:');
      for (const ch of recentChapters) {
        parts.push(`  - ${ch.title}: ${ch.summary}`);
      }
    }

    // 活跃用户关系
    const activeRelationships = relationships.filter(r => {
      const daysSince = (Date.now() - r.lastInteraction) / (24 * 60 * 60 * 1000);
      return daysSince < 30;
    });
    if (activeRelationships.length > 0) {
      parts.push('Key relationships:');
      for (const rel of activeRelationships) {
        parts.push(`  - ${rel.userId}: ${rel.summary} (trust: ${rel.trustLevel.toFixed(2)})`);
      }
    }

    return parts.length > 0 ? parts.join('\n') : '';
  }

  /**
   * 更新身份声明
   */
  updateIdentityStatement(statement: string): void {
    this.narrative = {
      ...this.narrative,
      identityStatement: statement,
      lastUpdated: Date.now(),
    };
    this.emit('narrativeUpdated', { field: 'identityStatement' });
  }

  /**
   * 添加叙事章节
   */
  addChapter(chapter: Omit<NarrativeChapter, 'id'>): NarrativeChapter {
    const newChapter: NarrativeChapter = {
      ...chapter,
      id: `chapter_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    };

    this.narrative = {
      ...this.narrative,
      chapters: [...this.narrative.chapters, newChapter],
      lastUpdated: Date.now(),
    };

    this.emit('narrativeUpdated', { field: 'chapters', chapterId: newChapter.id });
    return newChapter;
  }

  /**
   * 更新活跃主题
   */
  updateActiveThemes(themes: string[]): void {
    this.narrative = {
      ...this.narrative,
      activeThemes: themes,
      lastUpdated: Date.now(),
    };
    this.emit('narrativeUpdated', { field: 'activeThemes' });
  }

  /**
   * 更新或创建用户关系叙事
   */
  updateRelationship(userId: string, updates: Partial<Omit<RelationshipNarrative, 'userId'>>): void {
    const existing = this.narrative.relationships.find(r => r.userId === userId);

    if (existing) {
      const updatedRelationships = this.narrative.relationships.map(r =>
        r.userId === userId
          ? { ...r, ...updates, lastInteraction: Date.now() }
          : r
      );
      this.narrative = {
        ...this.narrative,
        relationships: updatedRelationships,
        lastUpdated: Date.now(),
      };
    } else {
      const newRel: RelationshipNarrative = {
        userId,
        summary: updates.summary ?? 'New relationship',
        sharedExperiences: updates.sharedExperiences ?? 0,
        trustLevel: updates.trustLevel ?? 0.5,
        communicationStyle: updates.communicationStyle ?? 'unknown',
        lastInteraction: Date.now(),
      };
      this.narrative = {
        ...this.narrative,
        relationships: [...this.narrative.relationships, newRel],
        lastUpdated: Date.now(),
      };
    }

    this.emit('narrativeUpdated', { field: 'relationships', userId });
  }

  /**
   * 获取特定用户的关系叙事
   */
  getRelationship(userId: string): RelationshipNarrative | null {
    return this.narrative.relationships.find(r => r.userId === userId) ?? null;
  }

  /**
   * 合成新章节（从最近的 episodes 中提取）
   *
   * 在 dream cycle 中调用，将近期情节编织为新章节
   */
  synthesizeChapter(title: string, summary: string, emotionalTone: string): NarrativeChapter | null {
    const now = Date.now();
    const recentEpisodes = this.getRecentEpisodes(20);

    if (recentEpisodes.length === 0) {
      return null;
    }

    // 找出时间范围
    const timestamps = recentEpisodes.map(e => e.timestamp);
    const startTime = Math.min(...timestamps);
    const endTime = Math.max(...timestamps);

    // 选择关键 episodes（按情感权重选 top 5）
    const keyEpisodes = recentEpisodes
      .sort((a, b) => b.emotionalWeight - a.emotionalWeight)
      .slice(0, 5)
      .map(e => e.id);

    // 计算重要性
    const avgWeight = recentEpisodes.reduce((s, e) => s + e.emotionalWeight, 0) / recentEpisodes.length;
    const significance = Math.min(1, avgWeight * 1.5);

    // 提取活跃主题
    const allTags = recentEpisodes.flatMap(e => e.tags);
    const tagCounts = new Map<string, number>();
    for (const tag of allTags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    const topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tag]) => tag);

    // 更新活跃主题
    const mergedThemes = [...new Set([...this.narrative.activeThemes, ...topTags])].slice(0, 5);
    this.updateActiveThemes(mergedThemes);

    return this.addChapter({
      title,
      summary,
      startTime,
      endTime,
      keyEpisodes,
      emotionalTone,
      significance,
    });
  }

  // === 维护操作 ===

  /**
   * 应用遗忘曲线 + 淘汰已死亡记忆
   *
   * 链路：Decay → Evict
   * 先衰减所有 episode 的 emotionalWeight，
   * 然后删除 retention ≈ 0 的真正死亡记忆（不是标记 dormant）。
   */
  applyDecay(): void {
    const now = Date.now();
    const episodes = Array.from(this.episodicStore.values());

    const decayed = applyForgettingCurve(episodes, now, this.config.forgetting);

    for (const episode of decayed) {
      this.episodicStore.set(episode.id, episode);
    }

    // Evict: 删除 retention 降至近零的 episode（真正遗忘，不是标记）
    let evicted = 0;
    for (const [id, episode] of this.episodicStore) {
      if (episode.tags.includes('dormant')) {
        const retention = calculateRetention(episode.decayRate, now - episode.timestamp);
        if (retention < 0.01) {
          this.episodicStore.delete(id);
          this.removePersistedEpisode(id);
          evicted++;
        }
      }
    }

    // Prune: 清除孤立的语义节点（无 relation 且不被任何活跃 episode 引用）
    let pruned = 0;
    const activeAssociations = new Set(
      Array.from(this.episodicStore.values()).flatMap(e => e.associations),
    );
    for (const [id, node] of this.semanticGraph) {
      if (node.relations.length === 0 && node.strength < 0.05 && !activeAssociations.has(id)) {
        this.semanticGraph.delete(id);
        this.removePersistedSemanticNode(id);
        pruned++;
      }
    }

    this.emit('decayApplied', { count: episodes.length, evicted, pruned });
  }

  /**
   * 梦境周期
   */
  async dreamCycle(): Promise<DreamResult> {
    const now = Date.now();

    const result = this.dreamEngine.executeDreamCycle(
      this.episodicStore,
      this.semanticGraph,
      now,
      () => this.dreamSynthesizeNarrative()
    );

    // 将梦的洞见存储到梦境记忆
    if (result.insights.length > 0) {
      const dreamId = `dream-${now}`;
      this.dreamStore.set(dreamId, {
        id: dreamId,
        timestamp: now,
        theme: result.insights[0]?.slice(0, 80) || 'Consolidation',
        insights: result.insights,
        associations: [],
        emotionalValence: 0,
        sourceEpisodes: [...this.episodicStore.keys()].slice(-10),
        consolidated: false,
      });

      // 限制梦境记忆数量
      if (this.dreamStore.size > 50) {
        const oldest = [...this.dreamStore.entries()]
          .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
        if (oldest) this.dreamStore.delete(oldest[0]);
      }
    }

    return result;
  }

  /**
   * 统一压缩策略 — 释放长期运行累积的内存
   *
   * 三级压缩：
   * 1. 休眠淘汰：retention < 0.05 的情景记忆直接删除
   * 2. 语义裁剪：无连接的孤立语义节点删除
   * 3. 过期前瞻：已完成/过期的 prospective 记忆清理
   */
  compact(): { episodesRemoved: number; nodesRemoved: number; prospectiveRemoved: number } {
    const now = Date.now();
    let episodesRemoved = 0;
    let nodesRemoved = 0;
    let prospectiveRemoved = 0;

    // Level 1: 休眠情景记忆淘汰（阈值从 0.01 提高到 0.05）
    for (const [id, ep] of this.episodicStore) {
      const retention = calculateRetention(ep.decayRate, now - ep.timestamp);
      if (retention < 0.05) {
        this.episodicStore.delete(id);
        episodesRemoved++;
      }
    }

    // Level 2: 孤立语义节点清理（无关联且超过 1 小时）
    for (const [id, node] of this.semanticGraph) {
      if (node.relations.length === 0 && (now - (node.id.includes('_') ? parseInt(node.id.split('_')[1]) || 0 : 0)) > 3_600_000) {
        this.semanticGraph.delete(id);
        nodesRemoved++;
      }
    }

    // Level 3: 过期前瞻记忆清理
    for (const [id, p] of this.prospectiveStore) {
      if (p.completed || p.triggerTime < now) {
        this.prospectiveStore.delete(id);
        prospectiveRemoved++;
      }
    }

    // 程序记忆裁剪：保留最近 200 条
    if (this.proceduralStore.size > 200) {
      const sorted = [...this.proceduralStore.entries()]
        .sort((a, b) => (b[1].lastUsed || 0) - (a[1].lastUsed || 0));
      this.proceduralStore = new Map(sorted.slice(0, 200));
    }

    if (episodesRemoved + nodesRemoved + prospectiveRemoved > 0) {
      this.markDirty();
      this.emit('compacted', { episodesRemoved, nodesRemoved, prospectiveRemoved });
    }

    return { episodesRemoved, nodesRemoved, prospectiveRemoved };
  }

  /**
   * 获取梦境记忆
   */
  getDreamMemories(limit = 10): DreamMemory[] {
    return [...this.dreamStore.values()]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * 获取记忆统计
   */
  getStats(): {
    episodes: number;
    semanticNodes: number;
    proceduralMemories: number;
    prospectiveMemories: number;
    dreamMemories: number;
    activeContext: number;
  } {
    return {
      episodes: this.episodicStore.size,
      semanticNodes: this.semanticGraph.size,
      proceduralMemories: this.proceduralStore.size,
      prospectiveMemories: this.prospectiveStore.size,
      dreamMemories: this.dreamStore.size,
      activeContext: this.workingMemory.activeContext.length,
    };
  }

  /**
   * 获取记忆健康报告
   */
  getHealthReport(): Array<{
    id: string;
    type: MemoryLayer;
    health: 'strong' | 'moderate' | 'weak' | 'dormant';
    lastAccessed: number;
  }> {
    const report: Array<{
      id: string;
      type: MemoryLayer;
      health: 'strong' | 'moderate' | 'weak' | 'dormant';
      lastAccessed: number;
    }> = [];

    const now = Date.now();

    for (const episode of this.episodicStore.values()) {
      report.push({
        id: episode.id,
        type: MemoryLayer.Episodic,
        health: getMemoryHealth(episode, now),
        lastAccessed: episode.timestamp,
      });
    }

    return report;
  }

  // === 生命周期 ===

  /**
   * 启动维护定时器
   */
  private startMaintenance(): void {
    if (this.config.dreamingEnabled) {
      this.dreamTimer = setInterval(() => {
        this.dreamCycle().catch((err) => {
          this.emit('error', { source: 'dreamCycle', error: err });
        });
      }, this.config.dreamInterval);
    }

    if (this.config.autoDecayEnabled) {
      this.decayTimer = setInterval(() => {
        this.applyDecay();
      }, this.config.decayInterval);
    }
  }

  /**
   * 停止引擎
   */
  stop(): void {
    if (this.dreamTimer) {
      clearInterval(this.dreamTimer);
      this.dreamTimer = null;
    }

    if (this.decayTimer) {
      clearInterval(this.decayTimer);
      this.decayTimer = null;
    }

    this.emit('stopped', null);
  }

  /**
   * 梦境中的叙事合成 + 旧章节压实
   *
   * 链路：Narrative → Compact
   * 合成新章节后，将旧章节合并为摘要，防止 chapters 无限增长。
   */
  private dreamSynthesizeNarrative(): boolean {
    const recentEpisodes = this.getRecentEpisodes(20);
    if (recentEpisodes.length < 3) {
      return false;
    }

    // 使用叙事合成引擎
    const result = this.narrativeSynthesis.synthesize(recentEpisodes, this.narrative);

    // 应用合成结果
    let updated = false;

    for (const chapter of result.newChapters) {
      // 避免重复添加相似章节
      const isDuplicate = this.narrative.chapters.some(
        c => Math.abs(c.startTime - chapter.startTime) < 60000
          && Math.abs(c.endTime - chapter.endTime) < 60000,
      );
      if (!isDuplicate) {
        this.addChapter(chapter);
        updated = true;
      }
    }

    if (result.activeThemes.length > 0) {
      this.updateActiveThemes(result.activeThemes);
      updated = true;
    }

    // 渐进演化身份声明
    if (result.identityStatement !== this.narrative.identityStatement) {
      this.updateIdentityStatement(result.identityStatement);
      updated = true;
    }

    // Compact: 保留最近 10 章，更早的合并为摘要章节
    const MAX_ACTIVE_CHAPTERS = 10;
    if (this.narrative.chapters.length > MAX_ACTIVE_CHAPTERS) {
      const oldChapters = this.narrative.chapters.slice(0, -MAX_ACTIVE_CHAPTERS);
      const recentChapters = this.narrative.chapters.slice(-MAX_ACTIVE_CHAPTERS);

      const mergedSummary = oldChapters
        .map(c => c.title)
        .join('; ');

      const compacted: NarrativeChapter = {
        id: `chapter_compact_${Date.now()}`,
        title: `Earlier: ${oldChapters.length} chapters merged`,
        summary: mergedSummary,
        startTime: oldChapters[0]?.startTime ?? Date.now(),
        endTime: oldChapters[oldChapters.length - 1]?.endTime ?? Date.now(),
        keyEpisodes: oldChapters.flatMap(c => c.keyEpisodes).slice(-5),
        emotionalTone: 'retrospective',
        significance: 0.3,
      };

      this.narrative = {
        ...this.narrative,
        chapters: [compacted, ...recentChapters],
        lastUpdated: Date.now(),
      };
      updated = true;
    }

    return updated;
  }

  /**
   * 创建初始叙事
   */
  private createInitialNarrative(): AutobiographicalNarrative {
    return {
      identityStatement: 'I am an AI assistant, learning and growing with each conversation.',
      chapters: [],
      activeThemes: [],
      relationships: [],
      lastUpdated: Date.now(),
    };
  }

  /**
   * 清空所有记忆
   */
  clear(): void {
    this.episodicStore.clear();
    this.semanticGraph.clear();
    this.proceduralStore.clear();
    this.prospectiveStore.clear();
    this.clearWorkingMemory();
    this.narrative = this.createInitialNarrative();

    this.emit('cleared', null);
  }

  // === 事件系统 ===

  /**
   * 订阅事件
   */
  on(event: string, callback: (data: unknown) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  /**
   * 取消订阅
   */
  off(event: string, callback: (data: unknown) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * 触发事件
   */
  private emitting = false;

  private emit(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(data);
        } catch (err) {
          // 防止递归：error handler 自身抛异常时不再递归 emit
          if (!this.emitting) {
            this.emitting = true;
            try {
              const errListeners = this.eventListeners.get('error');
              if (errListeners) {
                for (const cb of errListeners) {
                  try { cb({ source: 'eventCallback', error: err }); } catch { /* 递归底线 */ }
                }
              }
            } finally {
              this.emitting = false;
            }
          }
        }
      }
    }
  }

  // === 导出/导入 ===

  /**
   * 导出所有记忆
   */
  export(): {
    episodic: Episode[];
    semantic: SemanticNode[];
    procedural: ProceduralMemory[];
    prospective: ProspectiveMemory[];
    workingMemory: WorkingMemory;
    narrative: AutobiographicalNarrative;
    exportedAt: number;
  } {
    return {
      episodic: Array.from(this.episodicStore.values()),
      semantic: Array.from(this.semanticGraph.values()),
      procedural: Array.from(this.proceduralStore.values()),
      prospective: Array.from(this.prospectiveStore.values()),
      workingMemory: this.getWorkingMemory(),
      narrative: { ...this.narrative },
      exportedAt: Date.now(),
    };
  }

  /**
   * 导入记忆
   */
  import(data: {
    episodic?: Episode[];
    semantic?: SemanticNode[];
    procedural?: ProceduralMemory[];
    prospective?: ProspectiveMemory[];
    narrative?: AutobiographicalNarrative;
  }): void {
    if (data.episodic) {
      for (const episode of data.episodic) {
        this.episodicStore.set(episode.id, episode);
      }
    }

    if (data.semantic) {
      for (const node of data.semantic) {
        this.semanticGraph.set(node.id, node);
      }
    }

    if (data.procedural) {
      for (const memory of data.procedural) {
        this.proceduralStore.set(memory.id, memory);
      }
    }

    if (data.prospective) {
      for (const memory of data.prospective) {
        this.prospectiveStore.set(memory.id, memory);
      }
    }

    if (data.narrative) {
      this.narrative = data.narrative;
    }

    this.emit('imported', {
      episodes: data.episodic?.length ?? 0,
      semantic: data.semantic?.length ?? 0,
      procedural: data.procedural?.length ?? 0,
      prospective: data.prospective?.length ?? 0,
    });
  }
}

// 重新导出 MemoryLayer 枚举
export { MemoryLayer } from './types.js';

// 导出接口保持兼容性
export interface IMemoryEngine {
  getWorkingMemory(): WorkingMemory;
  updateWorkingMemory(update: Partial<WorkingMemory>): void;
  storeEpisode(episode: Omit<Episode, 'id' | 'timestamp'>): Promise<string>;
  retrieveEpisode(id: string): Promise<Episode | null>;
  retrieveEpisodesAssociatively(query: AssociativeQuery): Promise<Episode[]>;
  upsertSemanticNode(node: Omit<SemanticNode, 'id'>): Promise<string>;
  retrieveSemanticNode(id: string): Promise<SemanticNode | null>;
  retrieveSemanticAssociatively(query: AssociativeQuery): Promise<AssociativeResult>;
  storeProcedural(memory: Omit<ProceduralMemory, 'id'>): Promise<string>;
  retrieveProcedural(skillId: string): Promise<ProceduralMemory | null>;
  addProspective(memory: Omit<ProspectiveMemory, 'id'>): Promise<string>;
  getDueProspective(): Promise<ProspectiveMemory[]>;
  applyForgettingCurve(): Promise<void>;
  consolidate(): Promise<DreamingResult>;
}
