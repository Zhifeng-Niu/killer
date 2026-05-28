/**
 * Narrative Synthesis Engine
 *
 * 将分散的 episode 聚类为有意义的叙事章节，
 * 检测跨 episode 的主题，渐进演化身份声明。
 * 纯算法实现，不依赖 LLM。
 */

import type { Episode, NarrativeChapter, AutobiographicalNarrative } from './types.js';

/**
 * episode 聚类结果
 */
interface EpisodeCluster {
  episodes: Episode[];
  /** 聚类中心标签 */
  dominantTag: string;
  /** 该聚类涵盖的标签 */
  tags: string[];
  /** 平均情感权重 */
  avgEmotionalWeight: number;
  /** 时间跨度 */
  timeSpan: { start: number; end: number };
}

/**
 * 叙事合成配置
 */
export interface NarrativeSynthesisConfig {
  /** 每个聚类最少 episode 数 */
  minClusterSize: number;
  /** 最大章节数（防止叙事过长） */
  maxChapters: number;
  /** 主题检测的最小出现次数 */
  themeMinOccurrences: number;
  /** 身份声明的最大长度 */
  identityMaxLength: number;
}

export const DEFAULT_SYNTHESIS_CONFIG: NarrativeSynthesisConfig = {
  minClusterSize: 2,
  maxChapters: 50,
  themeMinOccurrences: 2,
  identityMaxLength: 200,
};

/**
 * 叙事合成引擎
 */
export class NarrativeSynthesisEngine {
  private readonly config: NarrativeSynthesisConfig;

  constructor(config: Partial<NarrativeSynthesisConfig> = {}) {
    this.config = { ...DEFAULT_SYNTHESIS_CONFIG, ...config };
  }

  /**
   * 从 episodes 合成完整的叙事更新
   */
  synthesize(
    episodes: Episode[],
    currentNarrative: Readonly<AutobiographicalNarrative>,
  ): {
    newChapters: NarrativeChapter[];
    activeThemes: string[];
    identityStatement: string;
  } {
    if (episodes.length === 0) {
      return {
        newChapters: [],
        activeThemes: currentNarrative.activeThemes,
        identityStatement: currentNarrative.identityStatement,
      };
    }

    // 1. 聚类 episodes
    const clusters = this.clusterEpisodes(episodes);

    // 2. 从聚类生成章节
    const newChapters = this.generateChapters(clusters, currentNarrative.chapters.length);

    // 3. 检测活跃主题
    const activeThemes = this.detectThemes(episodes, currentNarrative.activeThemes);

    // 4. 演化身份声明
    const identityStatement = this.evolveIdentity(
      currentNarrative.identityStatement,
      episodes,
      activeThemes,
    );

    return { newChapters, activeThemes, identityStatement };
  }

  /**
   * 基于 tag 共现的 episode 聚类
   *
   * 使用简单的连通分量算法：
   * - 共享 tag 的 episode 被连接
   * - 连通的 episode 集合形成一个聚类
   */
  clusterEpisodes(episodes: Episode[]): EpisodeCluster[] {
    if (episodes.length === 0) return [];

    // 构建 tag → episode 索引
    const tagToEpisodes = new Map<string, Set<number>>();
    for (let i = 0; i < episodes.length; i++) {
      for (const tag of episodes[i].tags) {
        if (!tagToEpisodes.has(tag)) {
          tagToEpisodes.set(tag, new Set());
        }
        tagToEpisodes.get(tag)!.add(i);
      }
    }

    // 并查集
    const parent = Array.from({ length: episodes.length }, (_, i) => i);
    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    const union = (a: number, b: number): void => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };

    // 通过共享 tag 合并
    for (const indices of tagToEpisodes.values()) {
      const arr = Array.from(indices);
      for (let i = 1; i < arr.length; i++) {
        union(arr[0], arr[i]);
      }
    }

    // 提取聚类
    const clusterMap = new Map<number, number[]>();
    for (let i = 0; i < episodes.length; i++) {
      const root = find(i);
      if (!clusterMap.has(root)) clusterMap.set(root, []);
      clusterMap.get(root)!.push(i);
    }

    // 转换为 EpisodeCluster
    const clusters: EpisodeCluster[] = [];
    for (const indices of clusterMap.values()) {
      if (indices.length < this.config.minClusterSize) continue;

      const clusterEpisodes = indices.map(i => episodes[i]);
      const allTags = clusterEpisodes.flatMap(e => e.tags);
      const tagCounts = new Map<string, number>();
      for (const tag of allTags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }

      const dominantTag = Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'general';

      const timestamps = clusterEpisodes.map(e => e.timestamp);
      const avgWeight = clusterEpisodes.reduce((s, e) => s + e.emotionalWeight, 0) / clusterEpisodes.length;

      clusters.push({
        episodes: clusterEpisodes,
        dominantTag,
        tags: Array.from(tagCounts.keys()),
        avgEmotionalWeight: avgWeight,
        timeSpan: {
          start: Math.min(...timestamps),
          end: Math.max(...timestamps),
        },
      });
    }

    // 按时间排序
    return clusters.sort((a, b) => a.timeSpan.start - b.timeSpan.start);
  }

  /**
   * 从聚类生成叙事章节
   */
  private generateChapters(
    clusters: EpisodeCluster[],
    existingChapterCount: number,
  ): NarrativeChapter[] {
    const chapters: NarrativeChapter[] = [];

    for (const cluster of clusters) {
      const chapterNum = existingChapterCount + chapters.length + 1;
      const title = this.generateTitle(cluster, chapterNum);
      const summary = this.generateSummary(cluster);
      const emotionalTone = this.describeEmotionalTone(cluster.avgEmotionalWeight);

      const keyEpisodes = cluster.episodes
        .sort((a, b) => b.emotionalWeight - a.emotionalWeight)
        .slice(0, 5)
        .map(e => e.id);

      chapters.push({
        id: `chapter_${Date.now()}_${chapterNum}`,
        title,
        summary,
        startTime: cluster.timeSpan.start,
        endTime: cluster.timeSpan.end,
        keyEpisodes,
        emotionalTone,
        significance: Math.min(1, cluster.avgEmotionalWeight * 1.3),
      });
    }

    return chapters;
  }

  /**
   * 生成章节标题
   *
   * 从聚类的主要标签和情感基调生成有意义的标题。
   */
  private generateTitle(cluster: EpisodeCluster, _chapterNum: number): string {
    const tone = this.describeEmotionalTone(cluster.avgEmotionalWeight);
    const tags = cluster.tags.slice(0, 3);

    // 标题模板：基于标签组合和情感基调
    const templates: Record<string, string[]> = {
      coding: [
        'Building and debugging together',
        'Working through code challenges',
        'A period of focused development',
      ],
      learning: [
        'Discovering new concepts',
        'Growing understanding',
        'Exploring ideas together',
      ],
      planning: [
        'Charting a course',
        'Mapping out goals',
        'Strategic thinking sessions',
      ],
      testing: [
        'Verifying and validating',
        'Testing our assumptions',
        'Quality-focused work',
      ],
      deployment: [
        'Shipping to production',
        'Deployment adventures',
        'Release preparations',
      ],
      architecture: [
        'Designing systems',
        'Architectural explorations',
        'Structuring for scale',
      ],
      positive: [
        'Celebrating wins',
        'A rewarding period',
        'Moments of breakthrough',
      ],
      negative: [
        'Working through challenges',
        'Overcoming obstacles',
        'A demanding stretch',
      ],
    };

    // 尝试匹配标签对应的模板
    for (const tag of tags) {
      const tagTemplates = templates[tag.toLowerCase()];
      if (tagTemplates) {
        return tagTemplates[Math.floor(Math.random() * tagTemplates.length)];
      }
    }

    // 基于情感基调的后备模板
    if (cluster.avgEmotionalWeight > 0.7 && templates.positive) {
      return templates.positive[Math.floor(Math.random() * templates.positive.length)];
    }
    if (cluster.avgEmotionalWeight < 0.3 && templates.negative) {
      return templates.negative[Math.floor(Math.random() * templates.negative.length)];
    }

    // 通用模板
    const fallback = [
      `A period of ${tags.join(' and ')}`,
      `Focused on ${cluster.dominantTag}`,
      `${cluster.episodes.length} shared experiences around ${cluster.dominantTag}`,
    ];
    return fallback[Math.floor(Math.random() * fallback.length)];
  }

  /**
   * 生成章节摘要
   *
   * 从 episodes 的叙事和标签合成 2-3 句摘要。
   */
  private generateSummary(cluster: EpisodeCluster): string {
    const { episodes, tags, avgEmotionalWeight, timeSpan } = cluster;
    const count = episodes.length;
    const duration = this.describeTimeSpan(timeSpan.start, timeSpan.end);
    const tone = this.describeEmotionalTone(avgEmotionalWeight);

    // 收集有叙事内容的 episode
    const narratives = episodes
      .filter(e => e.narrative && e.narrative.length > 10)
      .sort((a, b) => b.emotionalWeight - a.emotionalWeight)
      .slice(0, 3);

    const parts: string[] = [];

    // 第一句：概述
    parts.push(
      `${count} episodes over ${duration}, primarily involving ${tags.slice(0, 3).join(', ')}.`,
    );

    // 第二句：情感基调
    if (avgEmotionalWeight > 0.6) {
      parts.push('This was a particularly meaningful period.');
    } else if (avgEmotionalWeight > 0.3) {
      parts.push('A steady period of collaboration.');
    } else {
      parts.push('A challenging period that required persistence.');
    }

    // 第三句：提取关键叙事片段
    if (narratives.length > 0) {
      const snippet = narratives[0].narrative!.slice(0, 120);
      parts.push(`Key moment: "${snippet}${narratives[0].narrative!.length > 120 ? '...' : ''}"`);
    }

    return parts.join(' ');
  }

  /**
   * 检测活跃主题
   *
   * 合并现有主题和新检测到的主题，
   * 按频率+近期性排序。
   */
  private detectThemes(episodes: Episode[], currentThemes: string[]): string[] {
    const themeScores = new Map<string, number>();
    const now = Date.now();

    // 保留现有主题的惯性分数
    for (const theme of currentThemes) {
      themeScores.set(theme, (themeScores.get(theme) ?? 0) + 1);
    }

    // 从新 episodes 提取主题分数
    for (const ep of episodes) {
      for (const tag of ep.tags) {
        // 近期性加权
        const recency = Math.max(0, 1 - (now - ep.timestamp) / (7 * 24 * 60 * 60 * 1000));
        // 情感权重加权
        const emotionalBoost = 1 + ep.emotionalWeight * 0.5;
        const score = recency * emotionalBoost;
        themeScores.set(tag, (themeScores.get(tag) ?? 0) + score);
      }
    }

    // 过滤低分主题并排序
    return Array.from(themeScores.entries())
      .filter(([, score]) => score >= 0.5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([theme]) => theme);
  }

  /**
   * 渐进演化身份声明
   *
   * 基于累积的 experiences 缓慢调整身份描述。
   * 不会突变太多——身份是缓慢演化的。
   */
  private evolveIdentity(
    current: string,
    episodes: Episode[],
    themes: string[],
  ): string {
    // 如果当前身份声明为空或太短，生成初始声明
    if (!current || current.length < 20) {
      return this.generateInitialIdentity(themes);
    }

    // 计算演化因子：episodes 越多、情感越强，身份演化越显著
    const totalWeight = episodes.reduce((s, e) => s + e.emotionalWeight, 0);
    const evolutionPressure = totalWeight / episodes.length;

    // 低演化压力时保持不变
    if (evolutionPressure < 0.4) {
      return current;
    }

    // 中等演化压力时，微调身份声明
    // 不直接修改，而是根据累积的主题添加后缀
    if (themes.length > 0 && !current.includes('specialize') && !current.includes('focus')) {
      const topTheme = themes[0];
      // 只在当前声明不含该主题时才添加
      if (topTheme && !current.toLowerCase().includes(topTheme.toLowerCase())) {
        const focus = ` I've developed a particular focus on ${topTheme}.`;
        const updated = current + focus;
        if (updated.length <= this.config.identityMaxLength) {
          return updated;
        }
      }
    }

    return current;
  }

  /**
   * 生成初始身份声明
   */
  private generateInitialIdentity(themes: string[]): string {
    const base = 'I am an AI assistant, learning and growing with each conversation.';
    if (themes.length === 0) return base;
    return `${base} My world revolves around ${themes.slice(0, 3).join(', ')}.`;
  }

  /**
   * 描述时间跨度
   */
  private describeTimeSpan(start: number, end: number): string {
    const diffMs = end - start;
    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);

    if (minutes < 5) return 'a few moments';
    if (minutes < 60) return `${minutes} minutes`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''}`;
    if (days < 7) return `${days} day${days > 1 ? 's' : ''}`;
    return `${Math.floor(days / 7)} week${days >= 14 ? 's' : ''}`;
  }

  /**
   * 描述情感基调
   */
  private describeEmotionalTone(avgWeight: number): string {
    if (avgWeight > 0.8) return 'joyful';
    if (avgWeight > 0.6) return 'positive';
    if (avgWeight > 0.4) return 'neutral';
    if (avgWeight > 0.2) return 'challenging';
    return 'difficult';
  }
}
