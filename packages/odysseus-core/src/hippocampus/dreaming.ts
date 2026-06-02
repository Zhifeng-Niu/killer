/**
 * Hippocampus - 梦境周期
 *
 * 记忆巩固：重播、提取模式、衰减低权重记忆
 * 模拟睡眠时的记忆整合过程
 */

import type { Episode, SemanticNode, SemanticRelation, NarrativeChapter } from './types.js';
import { applyForgettingCurve, decay, getMemoryHealth } from './forgetting.js';
import { MemoryBlockRefiner, type RefinementResult } from './memory-block-refiner.js';

/**
 * 梦境结果
 */
export interface DreamResult {
  episodesReplayed: number;
  patternsExtracted: number;
  memoriesConsolidated: number;
  memoriesDecayed: number;
  insights: string[];
  narrativeSynthesized: boolean;
  /** 反事实梦境分支 */
  counterfactualBranches: CounterfactualBranch[];
  /** RiM风格隐式推理精炼结果 */
  memoryBlockRefinement?: RefinementResult;
}

/**
 * 反事实梦境分支
 *
 * 对一个已发生的情节，模拟"如果当时做了不同选择会怎样"。
 * 通过语义图谱的关联展开替代路径，评估哪条路径可能更好。
 */
export interface CounterfactualBranch {
  /** 原始情节 ID */
  sourceEpisodeId: string;
  /** 原始情节标题 */
  originalOutcome: string;
  /** 假设的替代行动 */
  alternativeAction: string;
  /** 预测的替代结果 */
  projectedOutcome: string;
  /** 替代路径上的语义节点 */
  projectedPath: string[];
  /** 替代结果的可信度 [0, 1] */
  confidence: number;
  /** 替代结果是否优于原始 */
  improvement: boolean;
}

/**
 * 梦境周期配置
 */
export interface DreamingConfig {
  /**
   * 每次梦境重播的情节数量
   */
  replayCount: number;

  /**
   * 重播时间窗口（毫秒），只重播近期记忆
   */
  replayWindow: number;

  /**
   * 模式提取阈值（关联强度）
   */
  patternThreshold: number;

  /**
   * 情感权重衰减阈值
   */
  decayThreshold: number;

  /**
   * 最大洞察数量
   */
  maxInsights: number;

  /**
   * 反事实梦境开关
   */
  counterfactualEnabled: boolean;

  /**
   * 反事实分支最大深度
   */
  counterfactualDepth: number;

  /**
   * RiM风格隐式推理精炼开关
   */
  memoryBlockRefiningEnabled: boolean;
}

/**
 * 默认梦境周期配置
 */
export const DEFAULT_DREAMING_CONFIG: DreamingConfig = {
  replayCount: 10,
  replayWindow: 7 * 24 * 60 * 60 * 1000, // 7 天
  patternThreshold: 0.5,
  decayThreshold: 0.2,
  maxInsights: 3,
  counterfactualEnabled: true,
  counterfactualDepth: 3,
  memoryBlockRefiningEnabled: true,
};

/**
 * 提取的模式
 */
interface ExtractedPattern {
  sourceEpisodes: string[];
  pattern: string;
  confidence: number;
}

/**
 * 梦境引擎
 *
 * 执行记忆巩固的梦境周期
 */
export class DreamEngine {
  private config: DreamingConfig;
  private readonly blockRefiner: MemoryBlockRefiner;

  constructor(config: DreamingConfig = DEFAULT_DREAMING_CONFIG) {
    this.config = config;
    this.blockRefiner = new MemoryBlockRefiner();
  }

  /**
   * 执行梦境周期
   *
   * 1. 随机选取近期情节重播
   * 2. 提取模式写入语义记忆
   * 3. 衰减低权重记忆
   * 4. 生成创造性洞察
   * 5. 合成叙事章节
   *
   * @param episodicStore - 情节记忆存储
   * @param semanticGraph - 语义图谱
   * @param now - 当前时间戳
   * @param synthesizeNarrative - 可选的叙事合成回调，返回 true 表示成功合成
   * @returns 梦境结果
   */
  executeDreamCycle(
    episodicStore: Map<string, Episode>,
    semanticGraph: Map<string, SemanticNode>,
    now: number,
    synthesizeNarrative?: () => boolean
  ): DreamResult {
    const result: DreamResult = {
      episodesReplayed: 0,
      patternsExtracted: 0,
      memoriesConsolidated: 0,
      memoriesDecayed: 0,
      insights: [],
      narrativeSynthesized: false,
      counterfactualBranches: [],
    };

    // 1. 选取近期情节进行重播
    let recentEpisodes: Episode[] = [];
    try {
      recentEpisodes = this.selectRecentEpisodes(episodicStore, now);
      result.episodesReplayed = recentEpisodes.length;
    } catch {
      // 选段失败不阻断后续步骤
    }

    // 2. 提取模式
    let patterns: ExtractedPattern[] = [];
    try {
      patterns = this.extractPatterns(recentEpisodes, semanticGraph);
      result.patternsExtracted = patterns.length;
    } catch {
      // 模式提取失败不阻断后续步骤
    }

    // 3. 巩固记忆
    try {
      const consolidated = this.consolidateMemories(recentEpisodes, semanticGraph);
      result.memoriesConsolidated = consolidated;
    } catch {
      // 巩固失败不阻断后续步骤
    }

    // 4. 衰减低权重记忆
    try {
      const decayed = this.decayWeakMemories(episodicStore, now);
      result.memoriesDecayed = decayed;
    } catch {
      // 衰减失败不阻断后续步骤
    }

    // 5. 生成洞察（包含情感维度分析）
    try {
      result.insights = this.generateInsights(patterns, semanticGraph, recentEpisodes);
    } catch {
      // 洞察生成失败不阻断
    }

    // 5.5 反事实梦境：对不满意情节模拟替代路径
    if (this.config.counterfactualEnabled && recentEpisodes.length > 0) {
      try {
        result.counterfactualBranches = this.dreamCounterfactual(
          recentEpisodes,
          semanticGraph
        );
        // 将反事实洞察注入主洞察列表
        for (const branch of result.counterfactualBranches) {
          if (branch.improvement) {
            result.insights.push(
              `Counterfactual: "${branch.originalOutcome}" → if "${branch.alternativeAction}" then "${branch.projectedOutcome}"`
            );
          }
        }
        result.insights = result.insights.slice(0, this.config.maxInsights);
      } catch {
        // 反事实梦境失败不阻断
      }
    }

    // 5.6 RiM风格隐式推理精炼：用memory block替代逐条处理
    if (this.config.memoryBlockRefiningEnabled && recentEpisodes.length > 0) {
      try {
        const refinement = this.blockRefiner.refine(recentEpisodes, semanticGraph);
        result.memoryBlockRefinement = refinement;
        // 将精炼洞察注入主洞察列表
        for (const insight of refinement.newInsights) {
          result.insights.push(`[RiM] ${insight}`);
        }
        result.insights = result.insights.slice(0, this.config.maxInsights);
      } catch {
        // 精炼失败不阻断
      }
    }

    // 6. 合成叙事（如果提供了回调）
    if (synthesizeNarrative) {
      try {
        result.narrativeSynthesized = synthesizeNarrative();
      } catch {
        // 叙事合成失败不影响已完成的步骤
      }
    }

    return result;
  }

  /**
   * 选取近期情节进行重播
   */
  private selectRecentEpisodes(
    episodicStore: Map<string, Episode>,
    now: number
  ): Episode[] {
    const cutoff = now - this.config.replayWindow;
    const recent: Episode[] = [];

    for (const episode of episodicStore.values()) {
      if (episode.timestamp >= cutoff && !episode.tags.includes('dormant')) {
        recent.push(episode);
      }
    }

    // 按情感权重排序，优先重播重要记忆
    recent.sort((a, b) => b.emotionalWeight - a.emotionalWeight);

    // 随机采样（模拟梦境的非线性）
    return this.weightedSample(recent, this.config.replayCount);
  }

  /**
   * 提取模式
   */
  private extractPatterns(
    episodes: Episode[],
    semanticGraph: Map<string, SemanticNode>
  ): ExtractedPattern[] {
    const patterns: ExtractedPattern[] = [];

    // 基于标签提取模式
    const tagGroups = this.groupByTags(episodes);

    for (const [tag, taggedEpisodes] of tagGroups) {
      if (taggedEpisodes.length >= 2) {
        // 找出共同关联
        const commonAssociations = this.findCommonAssociations(taggedEpisodes);

        if (commonAssociations.length > 0) {
          patterns.push({
            sourceEpisodes: taggedEpisodes.map((e) => e.id),
            pattern: `Pattern: ${tag} -> ${commonAssociations.join(', ')}`,
            confidence: this.calculatePatternConfidence(taggedEpisodes),
          });
        }
      }
    }

    // 基于序列提取模式（时间上连续的事件）
    const sequences = this.findSequences(episodes);
    for (const seq of sequences) {
      if (seq.length >= 3) {
        patterns.push({
          sourceEpisodes: seq.map((e) => e.id),
          pattern: `Sequence: ${seq.map((e) => e.title).join(' -> ')}`,
          confidence: 0.7,
        });
      }
    }

    // 新增：情感梯度模式 — 检测情感沿时间轴的系统性变化
    const emotionalPatterns = this.extractEmotionalGradientPatterns(episodes);
    patterns.push(...emotionalPatterns);

    // 新增：跨标签共现模式 — 检测标签组合
    const cooccurrencePatterns = this.extractCooccurrencePatterns(episodes);
    patterns.push(...cooccurrencePatterns);

    return patterns.filter((p) => p.confidence >= this.config.patternThreshold);
  }

  /**
   * 提取情感梯度模式
   *
   * 检测情感沿时间轴的系统性变化趋势，如"每次讨论X话题后情绪下降"。
   */
  private extractEmotionalGradientPatterns(episodes: Episode[]): ExtractedPattern[] {
    if (episodes.length < 5) return [];

    // 按时间排序
    const sorted = [...episodes].sort((a, b) => a.timestamp - b.timestamp);
    const patterns: ExtractedPattern[] = [];

    // 计算全局情感趋势
    let risingCount = 0;
    let fallingCount = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].emotionalWeight > sorted[i - 1].emotionalWeight) risingCount++;
      else if (sorted[i].emotionalWeight < sorted[i - 1].emotionalWeight) fallingCount++;
    }

    // 检测显著的情感趋势
    if (risingCount > sorted.length * 0.6) {
      patterns.push({
        sourceEpisodes: sorted.map(e => e.id),
        pattern: `Emotional trend: rising momentum (${risingCount}/${sorted.length - 1} transitions upward)`,
        confidence: risingCount / (sorted.length - 1),
      });
    } else if (fallingCount > sorted.length * 0.6) {
      patterns.push({
        sourceEpisodes: sorted.map(e => e.id),
        pattern: `Emotional trend: declining momentum (${fallingCount}/${sorted.length - 1} transitions downward)`,
        confidence: fallingCount / (sorted.length - 1),
      });
    }

    return patterns;
  }

  /**
   * 提取跨标签共现模式
   *
   * 检测频繁一起出现的标签组合。
   */
  private extractCooccurrencePatterns(episodes: Episode[]): ExtractedPattern[] {
    if (episodes.length < 3) return [];

    const patterns: ExtractedPattern[] = [];
    const pairCounts = new Map<string, { count: number; episodes: Episode[] }>();

    for (const ep of episodes) {
      const tags = [...new Set(ep.tags)];
      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const pair = [tags[i], tags[j]].sort().join(' + ');
          const existing = pairCounts.get(pair);
          if (existing) {
            existing.count++;
            existing.episodes.push(ep);
          } else {
            pairCounts.set(pair, { count: 1, episodes: [ep] });
          }
        }
      }
    }

    // 只报告出现 ≥ 2 次的共现
    for (const [pair, data] of pairCounts) {
      if (data.count >= 2) {
        patterns.push({
          sourceEpisodes: data.episodes.map(e => e.id),
          pattern: `Co-occurrence: "${pair}" appeared together ${data.count} times`,
          confidence: Math.min(data.count / episodes.length * 2, 1),
        });
      }
    }

    return patterns;
  }

  /**
   * 巩固记忆
   */
  private consolidateMemories(
    episodes: Episode[],
    semanticGraph: Map<string, SemanticNode>
  ): number {
    let consolidated = 0;

    for (const episode of episodes) {
      // 检查是否需要创建语义节点
      for (const tag of episode.tags) {
        const existingNode = Array.from(semanticGraph.values()).find(
          (n) => n.label === tag
        );

        if (!existingNode) {
          // 创建新的语义节点
          const newNode: SemanticNode = {
            id: `semantic_${tag}_${Date.now()}`,
            type: 'concept',
            label: tag,
            properties: {
              source: 'dream_consolidation',
              episodeCount: 1,
            },
            relations: [],
            strength: episode.emotionalWeight,
          };
          semanticGraph.set(newNode.id, newNode);
          consolidated++;
        } else {
          // 增强现有节点
          existingNode.strength = Math.min(
            existingNode.strength + episode.emotionalWeight * 0.1,
            1
          );
          const props = existingNode.properties as { episodeCount?: number };
          props.episodeCount = (props.episodeCount || 0) + 1;
        }
      }

      // 创建情节间的语义关联
      for (const assocId of episode.associations) {
        if (semanticGraph.has(assocId)) {
          const node = semanticGraph.get(assocId)!;
          if (!node.relations.find((r) => r.to === episode.id)) {
            node.relations.push({
              to: episode.id,
              type: 'episodic_link',
              weight: episode.emotionalWeight,
            });
            consolidated++;
          }
        }
      }
    }

    return consolidated;
  }

  /**
   * 衰减低权重记忆 + 淘汰死亡记忆
   *
   * 链路：Dream → Decay → Evict
   * 低权重的标记 dormant；已长期 dormant 且 retention ≈ 0 的直接删除。
   */
  private decayWeakMemories(
    episodicStore: Map<string, Episode>,
    now: number
  ): number {
    let decayed = 0;
    let evicted = 0;

    for (const [id, episode] of episodicStore) {
      const health = getMemoryHealth(episode, now);
      const updated = decay(episode, now);

      if (updated.emotionalWeight < this.config.decayThreshold) {
        // 已 dormant 且 retention 极低 → 真正删除
        if (updated.tags.includes('dormant')) {
          const timeSince = now - updated.timestamp;
          const retention = Math.exp(-timeSince / Math.max(updated.decayRate, 1));
          if (retention < 0.005) {
            episodicStore.delete(id);
            evicted++;
            continue;
          }
        }
        // 标记为休眠
        if (!updated.tags.includes('dormant')) {
          updated.tags.push('dormant');
          decayed++;
        }
        episodicStore.set(id, updated);
      } else if (health === 'weak') {
        episodicStore.set(id, updated);
      }
    }

    return decayed + evicted;
  }

  /**
   * 生成创造性洞察
   */
  private generateInsights(
    patterns: ExtractedPattern[],
    semanticGraph: Map<string, SemanticNode>,
    recentEpisodes?: Episode[]
  ): string[] {
    const insights: string[] = [];

    // 基于模式生成洞察
    for (const pattern of patterns.slice(0, this.config.maxInsights)) {
      if (pattern.confidence > 0.7) {
        insights.push(`Insight: ${pattern.pattern}`);
      }
    }

    // 跨模式连接生成洞察
    if (patterns.length >= 2) {
      const combinations = this.combinePatterns(patterns);
      insights.push(...combinations.slice(0, this.config.maxInsights - insights.length));
    }

    // 情感维度洞察：当记忆与特定情感强关联时，生成情感反思
    if (recentEpisodes && recentEpisodes.length > 0 && insights.length < this.config.maxInsights) {
      const emotionalInsight = this.generateEmotionalInsight(recentEpisodes);
      if (emotionalInsight) {
        insights.push(emotionalInsight);
      }
    }

    return insights.slice(0, this.config.maxInsights);
  }

  /**
   * 生成情感维度洞察
   *
   * 当多个高情感记忆共享相同的情感标签时，生成关于情感模式的反思。
   * 这模拟了人类梦境中的"情感加工"——大脑在睡眠中重新处理情绪体验。
   */
  private generateEmotionalInsight(episodes: Episode[]): string | null {
    // 按情感权重筛选显著记忆
    const significant = episodes.filter(ep => ep.emotionalWeight > 0.5);
    if (significant.length < 2) return null;

    // 按标签分组找情感主题
    const tagCounts = new Map<string, { count: number; totalWeight: number; episodes: Episode[] }>();
    for (const ep of significant) {
      for (const tag of ep.tags) {
        const existing = tagCounts.get(tag);
        if (existing) {
          existing.count++;
          existing.totalWeight += ep.emotionalWeight;
          existing.episodes.push(ep);
        } else {
          tagCounts.set(tag, { count: 1, totalWeight: ep.emotionalWeight, episodes: [ep] });
        }
      }
    }

    // 找出重复出现的情感主题
    for (const [tag, data] of tagCounts) {
      if (data.count >= 2) {
        const titles = data.episodes.map(e => e.title.toLowerCase()).join(', ');
        return `Emotional pattern: "${tag}" appeared in ${data.count} significant memories (${titles}). This theme carries emotional weight.`;
      }
    }

    return null;
  }

  /**
   * 反事实梦境
   *
   * 对情感权重偏低（< 0.5）的情节，沿语义图谱展开替代分支，
   * 模拟"如果当时做了不同选择会怎样"。
   */
  private dreamCounterfactual(
    episodes: Episode[],
    semanticGraph: Map<string, SemanticNode>
  ): CounterfactualBranch[] {
    const branches: CounterfactualBranch[] = [];

    // 筛选不满意的情节（低情感权重 = 不太成功的经历）
    const candidates = episodes.filter((e) => e.emotionalWeight < 0.5);
    if (candidates.length === 0) return branches;

    for (const episode of candidates.slice(0, this.config.counterfactualDepth)) {
      const branch = this.exploreAlternative(episode, semanticGraph);
      if (branch) {
        branches.push(branch);
      }
    }

    return branches;
  }

  /**
   * 为单个情节探索替代路径
   *
   * 沿情节的标签和关联在语义图谱中寻找未走的路。
   */
  private exploreAlternative(
    episode: Episode,
    semanticGraph: Map<string, SemanticNode>
  ): CounterfactualBranch | null {
    // 找到该情节标签对应的语义节点
    const tagNodes = episode.tags
      .map((tag) =>
        Array.from(semanticGraph.values()).find((n) => n.label === tag)
      )
      .filter((n): n is SemanticNode => n !== undefined);

    if (tagNodes.length === 0) return null;

    // 沿语义关联展开，寻找当前情节未走的路径
    const unexploredRelations: SemanticRelation[] = [];
    for (const node of tagNodes) {
      for (const relation of node.relations) {
        // 排除情节本身已关联的路径
        if (!episode.associations.includes(relation.to) && relation.weight > 0.3) {
          unexploredRelations.push(relation);
        }
      }
    }

    if (unexploredRelations.length === 0) return null;

    // 选择权重最高的未探索路径作为替代行动
    const bestAlternative = unexploredRelations.sort((a, b) => b.weight - a.weight)[0]!;
    const targetNode = semanticGraph.get(bestAlternative.to);
    if (!targetNode) return null;

    // 沿替代路径展开，收集投影路径
    const projectedPath = this.projectPath(targetNode, semanticGraph, 2);

    // 评估替代结果
    const projectedWeight = bestAlternative.weight;
    const improvement = projectedWeight > episode.emotionalWeight;
    const confidence = Math.min(
      bestAlternative.weight * 0.8,
      targetNode.strength * 0.6
    );

    return {
      sourceEpisodeId: episode.id,
      originalOutcome: episode.title,
      alternativeAction: `explore ${targetNode.label} (${targetNode.type})`,
      projectedOutcome: projectedPath.join(' → ') || targetNode.label,
      projectedPath,
      confidence,
      improvement,
    };
  }

  /**
   * 从起始节点沿语义图谱投影路径
   */
  private projectPath(
    startNode: SemanticNode,
    semanticGraph: Map<string, SemanticNode>,
    depth: number
  ): string[] {
    const path = [startNode.label];
    let current = startNode;

    for (let i = 0; i < depth; i++) {
      const strongRelations = current.relations
        .filter((r) => r.weight > 0.4)
        .sort((a, b) => b.weight - a.weight);

      if (strongRelations.length === 0) break;

      const nextRelation = strongRelations[0]!;
      const nextNode = semanticGraph.get(nextRelation.to);
      if (!nextNode || path.includes(nextNode.label)) break;

      path.push(nextNode.label);
      current = nextNode;
    }

    return path;
  }

  /**
   * 按标签分组
   */
  private groupByTags(episodes: Episode[]): Map<string, Episode[]> {
    const groups = new Map<string, Episode[]>();

    for (const episode of episodes) {
      for (const tag of episode.tags) {
        if (!groups.has(tag)) {
          groups.set(tag, []);
        }
        groups.get(tag)!.push(episode);
      }
    }

    return groups;
  }

  /**
   * 找出共同关联
   */
  private findCommonAssociations(episodes: Episode[]): string[] {
    if (episodes.length === 0) return [];

    const common = new Set(episodes[0].associations);

    for (let i = 1; i < episodes.length; i++) {
      const otherSet = new Set(episodes[i].associations);
      for (const item of common) {
        if (!otherSet.has(item)) {
          common.delete(item);
        }
      }
    }

    return Array.from(common);
  }

  /**
   * 计算模式置信度
   */
  private calculatePatternConfidence(episodes: Episode[]): number {
    if (episodes.length === 0) return 0;

    // 基于情感权重一致性
    const avgWeight =
      episodes.reduce((sum, e) => sum + e.emotionalWeight, 0) / episodes.length;

    // 基于时间接近度
    const timestamps = episodes.map((e) => e.timestamp).sort((a, b) => a - b);
    let timeGap = 0;
    for (let i = 1; i < timestamps.length; i++) {
      timeGap += timestamps[i] - timestamps[i - 1];
    }
    const avgGap = timeGap / (timestamps.length - 1 || 1);

    // 时间越接近、情感越一致，置信度越高
    const timeScore = Math.max(0, 1 - avgGap / (24 * 60 * 60 * 1000)); // 一天内为高分
    const weightScore = avgWeight;

    return (timeScore + weightScore) / 2;
  }

  /**
   * 查找时序模式
   */
  private findSequences(episodes: Episode[]): Episode[][] {
    const sorted = [...episodes].sort((a, b) => a.timestamp - b.timestamp);
    const sequences: Episode[][] = [];
    let currentSeq: Episode[] = [];

    for (let i = 0; i < sorted.length; i++) {
      if (currentSeq.length === 0) {
        currentSeq.push(sorted[i]);
      } else {
        const last = currentSeq[currentSeq.length - 1];
        const gap = sorted[i].timestamp - last.timestamp;

        // 如果时间间隔较短，认为是序列
        if (gap < 60 * 60 * 1000) { // 1 小时内
          currentSeq.push(sorted[i]);
        } else {
          if (currentSeq.length >= 3) {
            sequences.push([...currentSeq]);
          }
          currentSeq = [sorted[i]];
        }
      }
    }

    if (currentSeq.length >= 3) {
      sequences.push(currentSeq);
    }

    return sequences;
  }

  /**
   * 组合模式生成新洞察
   */
  private combinePatterns(patterns: ExtractedPattern[]): string[] {
    const insights: string[] = [];

    for (let i = 0; i < patterns.length - 1; i++) {
      for (let j = i + 1; j < patterns.length; j++) {
        const overlap = this.findOverlap(
          patterns[i].sourceEpisodes,
          patterns[j].sourceEpisodes
        );

        if (overlap.size > 0) {
          insights.push(
            `Cross-pattern: ${patterns[i].pattern} intersects ${patterns[j].pattern}`
          );
        }
      }

      if (insights.length >= this.config.maxInsights) {
        break;
      }
    }

    return insights;
  }

  /**
   * 查找两个数组的重叠
   */
  private findOverlap(a: string[], b: string[]): Set<string> {
    const setA = new Set(a);
    const overlap = new Set<string>();

    for (const item of b) {
      if (setA.has(item)) {
        overlap.add(item);
      }
    }

    return overlap;
  }

  /**
   * 加权随机采样
   */
  private weightedSample<T>(items: T[], count: number): T[] {
    if (items.length <= count) {
      return [...items];
    }

    const sampled: T[] = [];
    const weights = items.map((item) => {
      if (typeof item === 'object' && item !== null && 'emotionalWeight' in item) {
        return (item as { emotionalWeight: number }).emotionalWeight;
      }
      return 1;
    });

    let totalWeight = weights.reduce((sum, w) => sum + w, 0);

    for (let i = 0; i < count && items.length > 0; i++) {
      const random = Math.random() * totalWeight;
      let cumulative = 0;

      for (let j = 0; j < items.length; j++) {
        cumulative += weights[j];
        if (random <= cumulative) {
          sampled.push(items[j]!);
          totalWeight -= weights[j]!;
          items.splice(j, 1);
          weights.splice(j, 1);
          break;
        }
      }
    }

    return sampled;
  }
}
