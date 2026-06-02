/**
 * MemoryGuard — 统一内存防护
 *
 * 监控和限制 Odysseus 各模块的内存使用，
 * 防止长时间运行导致 terminal 崩溃。
 *
 * 核心策略：
 * 1. 软限制（softLimit）：触发自动裁剪
 * 2. 硬限制（hardLimit）：强制清理
 * 3. 定期 GC 提示（如果可用）
 */

// ── Configuration ──

export interface MemoryLimits {
  conversationHistory: number;
  consciousnessEvents: number;
  tuiMessages: number;
  responseTimes: number;
  recentTopics: number;
  intentHistory: number;
  rhythmSamples: number;
  knowledgeEntities: number;
  recentResponses: number;
  recentToolResults: number;
  activeContext: number;
  episodicStore: number;
  semanticNodes: number;
}

const DEFAULT_LIMITS: MemoryLimits = {
  conversationHistory: 200,
  consciousnessEvents: 2000,
  tuiMessages: 150,
  responseTimes: 200,
  recentTopics: 50,
  intentHistory: 100,
  rhythmSamples: 200,
  knowledgeEntities: 500,
  recentResponses: 50,
  recentToolResults: 100,
  activeContext: 100,
  episodicStore: 5000,
  semanticNodes: 3000,
};

// ── Array trimming ──

export function trimArray<T>(arr: T[], limit: number): T[] {
  if (arr.length <= limit) return arr;
  return arr.slice(-limit);
}

export function trimMapBySize<K, V>(map: Map<K, V>, limit: number, evictionOrder?: (entry: [K, V]) => number): Map<K, V> {
  if (map.size <= limit) return map;

  const entries = Array.from(map.entries());

  if (evictionOrder) {
    entries.sort((a, b) => evictionOrder(a) - evictionOrder(b));
  }

  const toKeep = entries.slice(-limit);
  return new Map(toKeep);
}

// ── Agent-level trimming ──

export interface TrimmableAgentState {
  conversationHistory: Array<{ role: string; content: string; timestamp: number }>;
  responseTimes: number[];
  recentTopics: string[];
  intentHistory: Array<unknown>;
  rhythmSamples: Array<unknown>;
  knowledgeGraph: { entities: Map<string, unknown>; relations: Array<unknown> };
  recentResponses: string[];
  recentToolResults: Array<unknown>;
}

export function trimAgentState(state: TrimmableAgentState, limits: Partial<MemoryLimits> = {}): void {
  const l = { ...DEFAULT_LIMITS, ...limits };

  if (state.conversationHistory.length > l.conversationHistory) {
    state.conversationHistory = state.conversationHistory.slice(-l.conversationHistory);
  }

  state.responseTimes = trimArray(state.responseTimes, l.responseTimes);
  state.recentTopics = trimArray(state.recentTopics, l.recentTopics);
  state.intentHistory = trimArray(state.intentHistory, l.intentHistory);
  state.rhythmSamples = trimArray(state.rhythmSamples, l.rhythmSamples);
  state.recentResponses = trimArray(state.recentResponses, l.recentResponses);
  state.recentToolResults = trimArray(state.recentToolResults, l.recentToolResults);

  if (state.knowledgeGraph.entities.size > l.knowledgeEntities) {
    const entries = Array.from(state.knowledgeGraph.entities.entries());
    const kept = entries.slice(-l.knowledgeEntities);
    state.knowledgeGraph.entities = new Map<string, unknown>(kept);
  }
}

// ── Memory estimation ──

export function estimateObjectSize(obj: unknown): number {
  return JSON.stringify(obj).length * 2; // rough: 2 bytes per char for UTF-16
}

export function getMemoryReport(sources: {
  conversationHistory?: unknown[];
  consciousnessEvents?: unknown[];
  tuiMessages?: unknown[];
  episodicStore?: Map<unknown, unknown>;
  semanticGraph?: Map<unknown, unknown>;
}): {
  estimatedBytes: number;
  estimatedMB: string;
  breakdown: Record<string, { count: number; estimatedBytes: number }>;
} {
  const breakdown: Record<string, { count: number; estimatedBytes: number }> = {};
  let total = 0;

  for (const [name, data] of Object.entries(sources)) {
    if (!data) continue;
    const count = data instanceof Map ? data.size : Array.isArray(data) ? data.length : 0;
    const size = estimateObjectSize(data);
    breakdown[name] = { count, estimatedBytes: size };
    total += size;
  }

  return {
    estimatedBytes: total,
    estimatedMB: (total / (1024 * 1024)).toFixed(2),
    breakdown,
  };
}

// ── GC hint ──

export function hintGC(): void {
  if (typeof globalThis.gc === 'function') {
    globalThis.gc();
  }
}

// ── Periodic guard ──

export class PeriodicMemoryGuard {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTrimAt = 0;
  private readonly trimIntervalMs: number;
  private readonly trimFn: () => void;

  constructor(trimFn: () => void, intervalMs = 60_000) {
    this.trimFn = trimFn;
    this.trimIntervalMs = intervalMs;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const now = Date.now();
      if (now - this.lastTrimAt >= this.trimIntervalMs) {
        this.trimFn();
        this.lastTrimAt = now;
        hintGC();
      }
    }, this.trimIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
