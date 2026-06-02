/**
 * Global Workspace — 全局工作空间
 *
 * 基于 Global Workspace Theory (GWT / Baars 1988, Dehaene & Changeux 2011)
 * 实现认知模块间的竞争-选择-广播协同机制。
 *
 * 核心循环：
 *   submit → compete → select → broadcast → feedback
 *
 * 各认知模块（hippocampus, cerebellum, cortex, prefrontal, brainstem）
 * 提交信息联盟（coalition），注意力机制选择最具相关性的联盟，
 * 然后广播到所有注册模块，创建"全局可用性"状态。
 */

import type { EventSource, EventType } from './types.js';
import type { ConsciousnessStream } from './consciousness-stream.js';

// ── Types ──

/**
 * 信息联盟 — 认知模块提交的信息包
 */
export interface WorkspaceCoalition {
  id: string;
  source: EventSource;
  data: unknown;
  relevance: number;
  timestamp: number;
  tags: string[];
  metadata?: Record<string, unknown>;
}

/**
 * 认知模块注册信息
 */
export interface WorkspaceModule {
  id: string;
  source: EventSource;
  capabilities: string[];
  attentionWeight: number;
  lastActive: number;
  totalBroadcasts: number;
}

/**
 * 注意力评分结果
 */
interface ScoredCoalition extends WorkspaceCoalition {
  score: number;
  breakdown: ScoreBreakdown;
}

interface ScoreBreakdown {
  relevance: number;
  weight: number;
  recency: number;
  novelty: number;
}

/**
 * 全局工作空间配置
 */
export interface GlobalWorkspaceConfig {
  maxPending: number;
  maxHistory: number;
  noveltyDecayMs: number;
  attentionCycleMs: number;
  defaultWeights: Partial<Record<EventSource, number>>;
}

const DEFAULT_CONFIG: GlobalWorkspaceConfig = {
  maxPending: 50,
  maxHistory: 200,
  noveltyDecayMs: 30_000,
  attentionCycleMs: 100,
  defaultWeights: {
    brainstem: 1.0,
    hippocampus: 1.2,
    cerebellum: 1.1,
    cortex: 1.0,
    prefrontal: 1.3,
    persona: 0.9,
    sensory: 0.8,
    synapse: 0.7,
    external: 1.4,
  },
};

type BroadcastHandler = (coalition: WorkspaceCoalition) => void;

/**
 * GlobalWorkspace — 全局工作空间
 *
 * 与 ConsciousnessStream 协同工作：
 * - ConsciousnessStream 是底层事件总线（无差别广播）
 * - GlobalWorkspace 是上层注意力机制（竞争-选择-广播）
 */
export class GlobalWorkspace {
  private readonly config: GlobalWorkspaceConfig;
  private readonly stream: ConsciousnessStream;
  private readonly modules: Map<string, WorkspaceModule> = new Map();
  private readonly broadcastHandlers: Set<BroadcastHandler> = new Set();

  private pending: WorkspaceCoalition[] = [];
  private currentBroadcast: WorkspaceCoalition | null = null;
  private history: WorkspaceCoalition[] = [];
  private recentTopics: string[] = [];
  private cycleCount = 0;
  private cycleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(stream: ConsciousnessStream, config?: Partial<GlobalWorkspaceConfig>) {
    this.stream = stream;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Module Registration ──

  registerModule(module: Omit<WorkspaceModule, 'lastActive' | 'totalBroadcasts'>): void {
    this.modules.set(module.id, {
      ...module,
      lastActive: Date.now(),
      totalBroadcasts: 0,
    });
  }

  unregisterModule(moduleId: string): void {
    this.modules.delete(moduleId);
  }

  setAttentionWeight(moduleId: string, weight: number): void {
    const mod = this.modules.get(moduleId);
    if (mod) {
      mod.attentionWeight = Math.max(0, Math.min(3, weight));
    }
  }

  // ── Coalition Submission ──

  submit(coalition: Omit<WorkspaceCoalition, 'id' | 'timestamp'>): WorkspaceCoalition {
    const full: WorkspaceCoalition = {
      ...coalition,
      id: `coal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };

    this.pending.push(full);

    if (this.pending.length > this.config.maxPending) {
      this.pending = this.pending
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, this.config.maxPending);
    }

    // 高相关性联盟直接触发快速广播
    if (coalition.relevance >= 0.9) {
      this.broadcastNow(full);
    }

    return full;
  }

  /**
   * 批量提交 — 认知模块一次性提交多个相关联盟
   */
  submitBatch(source: EventSource, coalitions: Array<{ data: unknown; relevance: number; tags: string[] }>): void {
    for (const c of coalitions) {
      this.submit({ source, ...c });
    }
  }

  // ── Attention Cycle ──

  startAttentionCycle(): void {
    if (this.cycleTimer) return;

    this.cycleTimer = setInterval(() => {
      this.runCycle();
    }, this.config.attentionCycleMs);
  }

  stopAttentionCycle(): void {
    if (this.cycleTimer) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
  }

  /**
   * 手动触发一个注意力周期
   *
   * 评分所有待处理联盟，选择得分最高的广播
   */
  runCycle(): WorkspaceCoalition | null {
    if (this.pending.length === 0) return null;

    const scored = this.pending.map((c) => this.score(c));
    scored.sort((a, b) => b.score - a.score);

    const winner = scored[0];
    if (!winner || winner.score < 0.1) {
      this.pending = [];
      return null;
    }

    this.broadcastNow(winner);
    this.pending = this.pending.filter((c) => c.id !== winner.id);

    this.cycleCount++;
    return winner;
  }

  // ── Scoring ──

  private score(coalition: WorkspaceCoalition): ScoredCoalition {
    const mod = this.findModuleBySource(coalition.source);
    const weight = mod?.attentionWeight ?? this.config.defaultWeights[coalition.source] ?? 1.0;

    const relevance = coalition.relevance;
    const recency = this.computeRecency(coalition.timestamp);
    const novelty = this.computeNovelty(coalition.tags);

    const score = relevance * weight * recency * novelty;

    return {
      ...coalition,
      score,
      breakdown: { relevance, weight, recency, novelty },
    };
  }

  private computeRecency(timestamp: number): number {
    const age = Date.now() - timestamp;
    return Math.exp(-age / this.config.noveltyDecayMs);
  }

  private computeNovelty(tags: string[]): number {
    if (tags.length === 0) return 1.0;

    const recentSet = new Set(this.recentTopics);
    const overlap = tags.filter((t) => recentSet.has(t)).length;
    const noveltyRatio = 1 - overlap / tags.length;

    return 0.3 + 0.7 * noveltyRatio;
  }

  // ── Broadcast ──

  private broadcastNow(coalition: WorkspaceCoalition): void {
    this.currentBroadcast = coalition;

    // 更新模块活跃状态
    const mod = this.findModuleBySource(coalition.source);
    if (mod) {
      mod.lastActive = Date.now();
      mod.totalBroadcasts++;
    }

    // 更新近期主题（用于新颖性计算）
    this.recentTopics.push(...coalition.tags);
    if (this.recentTopics.length > 100) {
      this.recentTopics = this.recentTopics.slice(-100);
    }

    // 保存到历史
    this.history.push(coalition);
    if (this.history.length > this.config.maxHistory) {
      this.history = this.history.slice(-this.config.maxHistory);
    }

    // 广播到 ConsciousnessStream（底层事件总线）
    this.stream.emit({
      source: coalition.source,
      type: 'workspace.broadcast' as EventType,
      data: {
        coalitionId: coalition.id,
        tags: coalition.tags,
        relevance: coalition.relevance,
        data: coalition.data,
      },
    });

    // 通知直接订阅者
    for (const handler of this.broadcastHandlers) {
      try {
        handler(coalition);
      } catch {
        // handler 错误不影响其他订阅者
      }
    }
  }

  onBroadcast(handler: BroadcastHandler): () => void {
    this.broadcastHandlers.add(handler);
    return () => { this.broadcastHandlers.delete(handler); };
  }

  // ── Query ──

  getCurrentBroadcast(): WorkspaceCoalition | null {
    return this.currentBroadcast;
  }

  getHistory(limit?: number): WorkspaceCoalition[] {
    return limit ? this.history.slice(-limit) : [...this.history];
  }

  getModuleStates(): Array<{ id: string; source: EventSource; broadcasts: number; weight: number }> {
    return Array.from(this.modules.values()).map((m) => ({
      id: m.id,
      source: m.source,
      broadcasts: m.totalBroadcasts,
      weight: m.attentionWeight,
    }));
  }

  getStatus(): {
    cycleCount: number;
    pendingCount: number;
    historyCount: number;
    moduleCount: number;
    currentSource: EventSource | null;
    recentTopics: string[];
  } {
    return {
      cycleCount: this.cycleCount,
      pendingCount: this.pending.length,
      historyCount: this.history.length,
      moduleCount: this.modules.size,
      currentSource: this.currentBroadcast?.source ?? null,
      recentTopics: this.recentTopics.slice(-10),
    };
  }

  // ── Cross-Module Coordination ──

  /**
   * 获取指定模块的最近广播（用于反馈回路）
   */
  getModuleHistory(source: EventSource, limit?: number): WorkspaceCoalition[] {
    return this.history
      .filter((c) => c.source === source)
      .slice(-(limit ?? 10));
  }

  /**
   * 计算模块间的注意力平衡度
   *
   * 返回 0-1 值，越高表示注意力分配越均匀
   */
  getAttentionBalance(): number {
    const counts = new Map<EventSource, number>();
    for (const c of this.history.slice(-50)) {
      counts.set(c.source, (counts.get(c.source) || 0) + 1);
    }

    if (counts.size === 0) return 1.0;

    const values = Array.from(counts.values());
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    const cv = Math.sqrt(variance) / (mean || 1);

    return Math.max(0, 1 - cv);
  }

  // ── Cleanup ──

  shutdown(): void {
    this.stopAttentionCycle();
    this.broadcastHandlers.clear();
    this.pending = [];
    this.history = [];
    this.modules.clear();
    this.recentTopics = [];
    this.currentBroadcast = null;
  }

  // ── Private ──

  private findModuleBySource(source: EventSource): WorkspaceModule | undefined {
    for (const mod of this.modules.values()) {
      if (mod.source === source) return mod;
    }
    return undefined;
  }
}
