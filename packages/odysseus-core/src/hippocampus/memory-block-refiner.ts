/**
 * Memory Block Refiner — 隐式推理精炼器
 *
 * 灵感来源: "RiM: Reasoning in Memory" (arXiv:2605.30343, Hochreiter)
 *   - 人类认知用工作记忆内部处理，不需要外化中间思考
 *   - 用memory blocks（固定token序列）替代自回归推理步骤
 *   - 单次forward pass处理 → 计算高效的隐式推理
 *   - 两阶段课程：先显式reasoning（grounding），再去掉步骤级监督
 *
 * 在 Odysseus 中的应用：
 *   - trigger_dream时的记忆精炼不再需要逐条外化处理
 *   - 将相关记忆片段打包为"memory block"，整体精炼
 *   - 减少dream cycle的计算开销，同时保留巩固质量
 */

import type { Episode, SemanticNode } from '../hippocampus/types.js';

export interface MemoryBlock {
  /** block ID */
  id: string;
  /** 组成block的episode IDs */
  episodeIds: string[];
  /** 压缩后的语义表示 */
  compressedRepresentation: string;
  /** block的主题/标签 */
  theme: string;
  /** 信息密度（压缩比） */
  compressionRatio: number;
  /** 创建时间 */
  createdAt: number;
  /** 最后精炼时间 */
  lastRefinedAt: number;
  /** 精炼次数 */
  refinementCount: number;
}

export interface RefinementResult {
  /** 参与精炼的block数 */
  blocksRefined: number;
  /** 生成的新洞察数 */
  newInsights: string[];
  /** 压缩率提升 */
  compressionImproved: number;
  /** 精炼耗时(ms) */
  durationMs: number;
}

/**
 * Memory Block Refiner
 *
 * 核心思想：不逐条处理episode，而是：
 * 1. 将语义相关的episode打包成memory block
 * 2. 对每个block做隐式精炼（压缩+提纯）
 * 3. 输出压缩后的语义表示
 */
export class MemoryBlockRefiner {
  private readonly blocks: Map<string, MemoryBlock> = new Map();
  private readonly maxBlockSize: number;
  private readonly minCompressionRatio: number;

  constructor(config?: {
    maxBlockSize?: number;
    minCompressionRatio?: number;
  }) {
    this.maxBlockSize = config?.maxBlockSize ?? 5;
    this.minCompressionRatio = config?.minCompressionRatio ?? 0.3;
  }

  /**
   * 执行隐式推理精炼
   *
   * 将episodes按主题聚类为memory blocks，然后精炼每个block。
   * 类比RiM的"单次forward pass"：不在episode级别逐步处理，
   * 而是在block级别一次性精炼。
   *
   * @param episodes - 当前活跃episodes
   * @param semanticNodes - 语义图谱节点
   * @returns 精炼结果
   */
  refine(episodes: Episode[], semanticNodes: Map<string, SemanticNode>): RefinementResult {
    const startTime = Date.now();
    const result: RefinementResult = {
      blocksRefined: 0,
      newInsights: [],
      compressionImproved: 0,
      durationMs: 0,
    };

    if (episodes.length === 0) {
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // 1. 按主题聚类episode → memory blocks
    const clusters = this.clusterByTheme(episodes, semanticNodes);

    // 2. 精炼每个block
    for (const cluster of clusters) {
      const refined = this.refineBlock(cluster.episodes, cluster.theme);
      if (refined) {
        result.blocksRefined++;
        result.compressionImproved += refined.compressionRatio;

        // 从精炼中提取洞察
        if (refined.compressedRepresentation.length < cluster.totalLength * this.minCompressionRatio) {
          result.newInsights.push(
            `Refined "${cluster.theme}": ${cluster.episodes.length} episodes → ${refined.compressedRepresentation.length} chars (${(refined.compressionRatio * 100).toFixed(0)}% compression)`
          );
        }
      }
    }

    // 3. 跨block发现（类似RiM的cross-block attention）
    const crossInsights = this.discoverCrossBlockInsights();
    result.newInsights.push(...crossInsights);

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * 按主题聚类episodes
   */
  private clusterByTheme(
    episodes: Episode[],
    semanticNodes: Map<string, SemanticNode>,
  ): { theme: string; episodes: Episode[]; totalLength: number }[] {
    const tagClusters: Map<string, Episode[]> = new Map();

    for (const episode of episodes) {
      // 用第一个非通用tag作为主题
      const themeTag = episode.tags.find(
        t => !['emotion', 'expression', 'dormant', 'general'].includes(t)
      ) ?? 'general';

      const cluster = tagClusters.get(themeTag) ?? [];
      cluster.push(episode);
      if (cluster.length <= this.maxBlockSize) {
        tagClusters.set(themeTag, cluster);
      }
    }

    return Array.from(tagClusters.entries()).map(([theme, eps]) => ({
      theme,
      episodes: eps.slice(0, this.maxBlockSize),
      totalLength: eps.reduce((sum, e) => sum + e.narrative.length, 0),
    }));
  }

  /**
   * 精炼单个memory block
   *
   * RiM的关键：不是逐步生成中间推理，而是直接从block中"精炼"出压缩表示。
   */
  private refineBlock(
    episodes: Episode[],
    theme: string,
  ): MemoryBlock | null {
    if (episodes.length === 0) return null;

    const blockId = `block_${theme}_${Date.now()}`;
    const totalLength = episodes.reduce((sum, e) => sum + e.narrative.length, 0);

    // 隐式精炼：提取关键信息而不是逐步推理
    const compressed = this.extractEssence(episodes, theme);

    const block: MemoryBlock = {
      id: blockId,
      episodeIds: episodes.map(e => e.id ?? ''),
      compressedRepresentation: compressed,
      theme,
      compressionRatio: compressed.length / totalLength,
      createdAt: Date.now(),
      lastRefinedAt: Date.now(),
      refinementCount: 1,
    };

    // 如果已有同主题block，合并精炼
    const existing = this.findBlockByTheme(theme);
    if (existing) {
      existing.episodeIds = [...new Set([...existing.episodeIds, ...block.episodeIds])];
      existing.compressedRepresentation = this.mergeRepresentations(
        existing.compressedRepresentation,
        compressed,
      );
      existing.compressionRatio = existing.compressedRepresentation.length /
        (existing.episodeIds.length * (totalLength / episodes.length));
      existing.lastRefinedAt = Date.now();
      existing.refinementCount++;
    } else {
      this.blocks.set(blockId, block);
    }

    return block;
  }

  /**
   * 隐式推理：提取episodes的本质
   *
   * 不是逐条推理，而是直接从整体中提取关键信息。
   * 这就是RiM的核心哲学——推理不需要外化中间步骤。
   */
  private extractEssence(episodes: Episode[], theme: string): string {
    // 提取每段narrative的关键词
    const keywords = new Set<string>();
    for (const ep of episodes) {
      const words = ep.narrative
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3);
      // 取TF-IDF近似：稀有词更重要
      for (const word of words) {
        keywords.add(word);
      }
    }

    // 按情感权重排序episodes
    const sorted = [...episodes].sort(
      (a, b) => b.emotionalWeight - a.emotionalWeight
    );

    // 压缩：取top-2的episode核心 + 关键词摘要
    const topNarratives = sorted
      .slice(0, 2)
      .map(ep => {
        const sentences = ep.narrative.split(/[.!?]/).filter(s => s.trim().length > 10);
        return sentences.slice(0, 1).join('. ').trim();
      })
      .filter(Boolean);

    const keywordStr = Array.from(keywords).slice(0, 10).join(', ');

    return `[${theme}] ${topNarratives.join(' | ')} [keys: ${keywordStr}]`;
  }

  /**
   * 合并两个已精炼的表示
   */
  private mergeRepresentations(a: string, b: string): string {
    // 简单合并：去重关键词
    const keysA = new Set((a.match(/\[keys: (.+?)\]/)?.[1] ?? '').split(', '));
    const keysB = new Set((b.match(/\[keys: (.+?)\]/)?.[1] ?? '').split(', '));
    const mergedKeys = [...new Set([...keysA, ...keysB])].slice(0, 15).join(', ');

    const coreA = a.replace(/\s*\[keys: .+?\]$/, '').trim();
    const coreB = b.replace(/\s*\[keys: .+?\]$/, '').trim();

    return `${coreA} + ${coreB} [keys: ${mergedKeys}]`;
  }

  /**
   * 发现跨block的关联洞察
   *
   * 类似RiM的cross-attention机制
   */
  private discoverCrossBlockInsights(): string[] {
    const insights: string[] = [];
    const blockArray = Array.from(this.blocks.values());

    if (blockArray.length < 2) return insights;

    // 找有共同关键词的block对
    for (let i = 0; i < blockArray.length; i++) {
      for (let j = i + 1; j < blockArray.length; j++) {
        const common = this.findCommonKeywords(
          blockArray[i].compressedRepresentation,
          blockArray[j].compressedRepresentation,
        );
        if (common.length >= 2) {
          insights.push(
            `Cross-block link: "${blockArray[i].theme}" ↔ "${blockArray[j].theme}" (shared: ${common.join(', ')})`
          );
        }
      }
    }

    return insights.slice(0, 3);
  }

  /**
   * 找两个表示的共同关键词
   */
  private findCommonKeywords(a: string, b: string): string[] {
    const keysA = new Set((a.match(/\[keys: (.+?)\]/)?.[1] ?? '').split(', '));
    const keysB = new Set((b.match(/\[keys: (.+?)\]/)?.[1] ?? '').split(', '));
    return [...keysA].filter(k => keysB.has(k) && k.length > 2);
  }

  /**
   * 查找同主题的block
   */
  private findBlockByTheme(theme: string): MemoryBlock | undefined {
    for (const block of this.blocks.values()) {
      if (block.theme === theme) return block;
    }
    return undefined;
  }

  /**
   * 获取所有memory blocks
   */
  getBlocks(): MemoryBlock[] {
    return Array.from(this.blocks.values());
  }

  /**
   * 获取精炼统计
   */
  getStats(): { totalBlocks: number; totalEpisodes: number; avgCompression: number } {
    const blocks = this.getBlocks();
    const totalEpisodes = blocks.reduce((sum, b) => sum + b.episodeIds.length, 0);
    const avgCompression = blocks.length > 0
      ? blocks.reduce((sum, b) => sum + b.compressionRatio, 0) / blocks.length
      : 0;
    return { totalBlocks: blocks.length, totalEpisodes, avgCompression };
  }
}
