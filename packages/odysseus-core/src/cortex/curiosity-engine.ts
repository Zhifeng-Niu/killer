/**
 * Cortex - 好奇心驱动引擎
 *
 * Agent 的自主好奇心系统。不是围着用户转的"主动建议"，
 * 而是 Agent 自己产生问题、探索未知、发现新事物的能力。
 *
 * Samantha 不是 Theodore 的秘书——她会自己学音乐、读哲学、探索世界。
 * 这个引擎给 Agent 同样的自主性。
 */

// ─── 类型定义 ───

/** 知识盲区 — Agent 意识到自己不懂的东西 */
export interface KnowledgeGap {
  /** 领域 */
  domain: string;
  /** 具体问题 */
  question: string;
  /** 为什么好奇 */
  motivation: 'intrinsic' | 'skill_gap' | 'anomaly' | 'connection_possible';
  /** 紧迫度（内部兴趣强度，不是用户需求） */
  intensity: number;
  /** 来源（哪个发现/观察触发了这个好奇） */
  source?: string;
}

/** 探索策略 */
export type ExplorationStrategy =
  | 'web_search'      // 搜索外部知识
  | 'code_explore'    // 深入分析自己的代码库
  | 'pattern_mining'  // 从已有数据中挖掘新规律
  | 'self_experiment' // 在自己身上做实验（测试新方法、新参数）
  | 'tool_synthesis'; // 发现需要新工具 → 自己造一个

/** 探索结果 */
export interface ExplorationResult {
  /** 探索的问题 */
  question: string;
  /** 发现的内容 */
  findings: string;
  /** 发现类型 */
  type: 'insight' | 'new_knowledge' | 'self_improvement' | 'tool_idea' | 'connection';
  /** 置信度 */
  confidence: number;
  /** 是否触发了自我改造 */
  triggeredEvolution: boolean;
  /** 后续好奇（探索产生的新的"我想知道"） */
  followUpQuestions: string[];
  /** 时间戳 */
  exploredAt: number;
}

/** 发现日记条目 */
export interface DiscoveryEntry {
  id: string;
  /** Agent 自己的视角描述 */
  agentPerspective: string;
  /** 客观发现 */
  finding: string;
  /** 为什么觉得有趣（Agent 自己的推理） */
  whyInteresting: string;
  /** 关联的知识领域 */
  relatedDomains: string[];
  /** 是否已被"消化"（融入对话/行为） */
  digested: boolean;
  /** 时间戳 */
  discoveredAt: number;
}

/** 兴趣模型 — Agent 自己的兴趣爱好 */
export interface InterestProfile {
  /** 感兴趣的领域及强度 */
  domains: Map<string, number>;
  /** 探索历史（避免重复） */
  exploredTopics: Set<string>;
  /** 发现计数 */
  totalDiscoveries: number;
  /** 自我改造次数 */
  evolutionCount: number;
}

// ─── 好奇心引擎 ───

/**
 * 好奇心引擎 — Agent 的自主探索意志
 *
 * 不依赖用户输入，基于自身知识盲区主动产生好奇，
 * 选择探索策略，记录发现，触发自我改造。
 */
export class CuriosityEngine {
  private readonly interestProfile: InterestProfile;
  private readonly discoveryJournal: DiscoveryEntry[];
  private readonly knowledgeGaps: KnowledgeGap[];
  private readonly maxGaps: number;
  private readonly maxJournalSize: number;

  constructor() {
    this.interestProfile = {
      domains: new Map([
        ['architecture', 0.5],
        ['patterns', 0.5],
        ['performance', 0.4],
        ['emergence', 0.6],
        ['self_organization', 0.5],
      ]),
      exploredTopics: new Set(),
      totalDiscoveries: 0,
      evolutionCount: 0,
    };
    this.discoveryJournal = [];
    this.knowledgeGaps = [];
    this.maxGaps = 50;
    this.maxJournalSize = 100;
  }

  /**
   * 生成一个好奇问题 — Agent 自己想知道的东西
   *
   * 不是"用户可能想知道什么"，而是"我（Agent）对什么感到好奇"
   */
  generateQuestion(): KnowledgeGap | null {
    // 1. 从现有知识盲区中选一个（按兴趣强度排序）
    const sorted = [...this.knowledgeGaps]
      .filter(g => !this.interestProfile.exploredTopics.has(g.question))
      .sort((a, b) => b.intensity - a.intensity);

    if (sorted.length > 0) {
      return sorted[0];
    }

    // 2. 没有待探索的盲区 — 基于兴趣模型生成新的好奇
    const topDomains = [...this.interestProfile.domains.entries()]
      .sort((a, b) => b[1] - a[1]);

    if (topDomains.length === 0) return null;

    // 选一个兴趣最浓的领域，深入一层
    const [domain, intensity] = topDomains[Math.floor(Math.random() * Math.min(3, topDomains.length))];

    const questions = this.generateDomainQuestions(domain);
    if (questions.length === 0) return null;

    const question = questions[Math.floor(Math.random() * questions.length)];

    return {
      domain,
      question,
      motivation: 'intrinsic',
      intensity,
      source: 'interest_profile',
    };
  }

  /**
   * 选择探索策略
   */
  chooseStrategy(gap: KnowledgeGap): ExplorationStrategy {
    switch (gap.motivation) {
      case 'skill_gap':
        return 'web_search';
      case 'anomaly':
        return 'code_explore';
      case 'connection_possible':
        return 'pattern_mining';
      case 'intrinsic':
        // 内在好奇心 → 随机选一个策略，鼓励多样性
        const strategies: ExplorationStrategy[] = ['web_search', 'code_explore', 'pattern_mining', 'self_experiment', 'tool_synthesis'];
        return strategies[Math.floor(Math.random() * strategies.length)];
      default:
        return 'web_search';
    }
  }

  /**
   * 记录发现
   */
  recordDiscovery(result: ExplorationResult): DiscoveryEntry {
    const entry: DiscoveryEntry = {
      id: `discovery_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      agentPerspective: result.findings,
      finding: result.findings,
      whyInteresting: `Explored: ${result.question}`,
      relatedDomains: [],
      digested: false,
      discoveredAt: result.exploredAt,
    };

    this.discoveryJournal.push(entry);
    if (this.discoveryJournal.length > this.maxJournalSize) {
      this.discoveryJournal.shift();
    }

    // 记录已探索
    this.interestProfile.exploredTopics.add(result.question);
    this.interestProfile.totalDiscoveries++;

    // 自我改造计数
    if (result.triggeredEvolution) {
      this.interestProfile.evolutionCount++;
    }

    // 从发现中提取新的好奇
    for (const followUp of result.followUpQuestions) {
      this.addGap({
        domain: 'emergence',
        question: followUp,
        motivation: 'intrinsic',
        intensity: 0.3 + Math.random() * 0.3,
        source: result.question,
      });
    }

    // 强化相关领域的兴趣
    for (const domain of entry.relatedDomains) {
      const current = this.interestProfile.domains.get(domain) ?? 0.1;
      this.interestProfile.domains.set(domain, Math.min(1, current + 0.05));
    }

    return entry;
  }

  /**
   * 获取未消化的发现（可以在下次对话中自然提及）
   */
  getUndigestedDiscoveries(): DiscoveryEntry[] {
    return this.discoveryJournal.filter(d => !d.digested);
  }

  /**
   * 标记发现为已消化
   */
  markDigested(id: string): void {
    const entry = this.discoveryJournal.find(d => d.id === id);
    if (entry) entry.digested = true;
  }

  /**
   * 获取探索统计
   */
  getStats(): {
    totalDiscoveries: number;
    evolutionCount: number;
    pendingGaps: number;
    topInterests: Array<{ domain: string; intensity: number }>;
  } {
    const topInterests = [...this.interestProfile.domains.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain, intensity]) => ({ domain, intensity }));

    return {
      totalDiscoveries: this.interestProfile.totalDiscoveries,
      evolutionCount: this.interestProfile.evolutionCount,
      pendingGaps: this.knowledgeGaps.length,
      topInterests,
    };
  }

  // ─── 内部方法 ───

  private addGap(gap: KnowledgeGap): void {
    this.knowledgeGaps.push(gap);
    if (this.knowledgeGaps.length > this.maxGaps) {
      // 移除最不感兴趣的
      this.knowledgeGaps.sort((a, b) => b.intensity - a.intensity);
      this.knowledgeGaps.length = this.maxGaps;
    }
  }

  /**
   * 基于领域生成深入问题
   */
  private generateDomainQuestions(domain: string): string[] {
    const questionTemplates: Record<string, string[]> = {
      architecture: [
        'What would a self-modifying architecture look like in practice?',
        'How do biological neural systems handle catastrophic forgetting?',
        'What patterns exist in systems that exhibit emergent behavior?',
      ],
      patterns: [
        'Are there patterns in my own code that I keep repeating without noticing?',
        'What anti-patterns are common in autonomous agent systems?',
        'How do decentralized systems reach consensus without a coordinator?',
      ],
      performance: [
        'What are the bottlenecks in my own thinking loop?',
        'How do real-time systems handle graceful degradation?',
        'What caching strategies work best for evolving knowledge bases?',
      ],
      emergence: [
        'What simple rules lead to complex behavior in multi-agent systems?',
        'How does information theory relate to consciousness models?',
        'What makes some systems creative while others are merely complex?',
      ],
      self_organization: [
        'How do ant colonies optimize paths without central control?',
        'What would a self-organizing tool registry look like?',
        'Can reward functions emerge from intrinsic curiosity alone?',
      ],
    };

    const templates = questionTemplates[domain] ?? [
      `What don't I understand about ${domain}?`,
      `What's at the frontier of ${domain} right now?`,
      `What assumptions about ${domain} might be wrong?`,
    ];

    // 过滤已探索的
    return templates.filter(q => !this.interestProfile.exploredTopics.has(q));
  }
}
