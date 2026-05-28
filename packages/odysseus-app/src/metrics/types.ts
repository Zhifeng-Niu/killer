/**
 * Metrics Collection System
 *
 * 收集和暴露 Agent 运行指标：
 * - Counter: 单调递增计数（请求数、错误数）
 * - Gauge: 可增可减的当前值（活跃连接、内存使用）
 * - Histogram: 分布统计（延迟、token 数量）
 */

// ─── 指标原语 ────────────────────────────────────

/**
 * 单调计数器
 */
export class Counter {
  private value = 0;

  constructor(
    public readonly name: string,
    public readonly labels: Record<string, string> = {},
  ) {}

  inc(amount = 1): void {
    this.value += amount;
  }

  get(): number {
    return this.value;
  }

  reset(): void {
    this.value = 0;
  }

  snapshot(): { type: 'counter'; name: string; value: number; labels: Record<string, string> } {
    return { type: 'counter', name: this.name, value: this.value, labels: { ...this.labels } };
  }
}

/**
 * 可增减仪表盘
 */
export class Gauge {
  private value = 0;

  constructor(
    public readonly name: string,
    public readonly labels: Record<string, string> = {},
  ) {}

  inc(amount = 1): void {
    this.value += amount;
  }

  dec(amount = 1): void {
    this.value -= amount;
  }

  set(value: number): void {
    this.value = value;
  }

  get(): number {
    return this.value;
  }

  snapshot(): { type: 'gauge'; name: string; value: number; labels: Record<string, string> } {
    return { type: 'gauge', name: this.name, value: this.value, labels: { ...this.labels } };
  }
}

/**
 * 直方图（分桶统计）
 */
export class Histogram {
  private readonly buckets: number[];
  private readonly counts: number[];
  private sum = 0;
  private count = 0;

  constructor(
    public readonly name: string,
    buckets: number[] = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    public readonly labels: Record<string, string> = {},
  ) {
    this.buckets = [...buckets].sort((a, b) => a - b);
    this.counts = new Array(this.buckets.length + 1).fill(0);
  }

  observe(value: number): void {
    this.sum += value;
    this.count++;

    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        this.counts[i]++;
        return;
      }
    }
    this.counts[this.buckets.length]++;
  }

  /**
   * 计时辅助 — 返回 stop 函数
   */
  startTimer(): () => void {
    const start = performance.now();
    return () => {
      this.observe((performance.now() - start) / 1000);
    };
  }

  getStats(): { count: number; sum: number; avg: number; p50: number; p95: number; p99: number } {
    const sorted = [...this.buckets];
    return {
      count: this.count,
      sum: this.sum,
      avg: this.count > 0 ? this.sum / this.count : 0,
      p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1] ?? 0,
      p99: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))] ?? 0,
    };
  }

  snapshot(): { type: 'histogram'; name: string; stats: ReturnType<Histogram['getStats']>; labels: Record<string, string> } {
    return { type: 'histogram', name: this.name, stats: this.getStats(), labels: { ...this.labels } };
  }

  reset(): void {
    this.counts.fill(0);
    this.sum = 0;
    this.count = 0;
  }
}

// ─── 指标收集器 ────────────────────────────────────

export type MetricSnapshot = ReturnType<Counter['snapshot'] | Gauge['snapshot'] | Histogram['snapshot']>;

/**
 * 指标收集器 — 全局单例
 */
export class MetricsCollector {
  private static instance: MetricsCollector | null = null;
  private readonly counters: Map<string, Counter> = new Map();
  private readonly gauges: Map<string, Gauge> = new Map();
  private readonly histograms: Map<string, Histogram> = new Map();
  private readonly startTime = Date.now();

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  static reset(): void {
    MetricsCollector.instance = null;
  }

  private constructor() {}

  // ─── 注册指标 ────────────────────────────────────

  counter(name: string, labels?: Record<string, string>): Counter {
    const key = this.key(name, labels);
    let c = this.counters.get(key);
    if (!c) {
      c = new Counter(name, labels);
      this.counters.set(key, c);
    }
    return c;
  }

  gauge(name: string, labels?: Record<string, string>): Gauge {
    const key = this.key(name, labels);
    let g = this.gauges.get(key);
    if (!g) {
      g = new Gauge(name, labels);
      this.gauges.set(key, g);
    }
    return g;
  }

  histogram(name: string, buckets?: number[], labels?: Record<string, string>): Histogram {
    const key = this.key(name, labels);
    let h = this.histograms.get(key);
    if (!h) {
      h = new Histogram(name, buckets, labels);
      this.histograms.set(key, h);
    }
    return h;
  }

  // ─── 预定义指标快捷方式 ─────────────────────────────

  /** LLM 调用延迟 */
  get llmLatency(): Histogram {
    return this.histogram('llm_latency_seconds', [0.1, 0.25, 0.5, 1, 2, 5, 10, 30]);
  }

  /** LLM 调用计数 */
  get llmCalls(): Counter {
    return this.counter('llm_calls_total');
  }

  /** LLM 错误计数 */
  get llmErrors(): Counter {
    return this.counter('llm_errors_total');
  }

  /** Token 使用量 */
  get tokensUsed(): Counter {
    return this.counter('llm_tokens_total');
  }

  /** 工具调用次数 */
  get toolCalls(): Counter {
    return this.counter('tool_calls_total');
  }

  /** 工具执行延迟 */
  get toolLatency(): Histogram {
    return this.histogram('tool_latency_seconds', [0.001, 0.01, 0.05, 0.1, 0.5, 1]);
  }

  /** 活跃连接数 */
  get activeConnections(): Gauge {
    return this.gauge('active_connections');
  }

  /** 活跃 cells 数 */
  get activeCells(): Gauge {
    return this.gauge('active_cells');
  }

  /** 请求计数 */
  get requestsTotal(): Counter {
    return this.counter('requests_total');
  }

  /** 情感事件计数 */
  get emotionEvents(): Counter {
    return this.counter('emotion_events_total');
  }

  /** 情感效价（当前值） */
  get emotionValence(): Gauge {
    return this.gauge('emotion_valence');
  }

  /** 情感唤醒度（当前值） */
  get emotionArousal(): Gauge {
    return this.gauge('emotion_arousal');
  }

  /** 记忆存储计数 */
  get memoryStores(): Counter {
    return this.counter('memory_stores_total');
  }

  /** 记忆召回计数 */
  get memoryRecalls(): Counter {
    return this.counter('memory_recalls_total');
  }

  /** 记忆总数 */
  get memoryTotal(): Gauge {
    return this.gauge('memory_total');
  }

  /** Dream 周期计数 */
  get dreamCycles(): Counter {
    return this.counter('dream_cycles_total');
  }

  /** Dream 周期持续时间 */
  get dreamLatency(): Histogram {
    return this.histogram('dream_latency_seconds', [0.1, 0.5, 1, 2, 5, 10]);
  }

  /** Cell 创建计数 */
  get cellSpawns(): Counter {
    return this.counter('cell_spawns_total');
  }

  /** 目标创建计数 */
  get goalsCreated(): Counter {
    return this.counter('goals_created_total');
  }

  // ─── 快照 ────────────────────────────────────

  /**
   * 生成所有指标的快照
   */
  snapshot(): {
    uptime_seconds: number;
    timestamp: number;
    metrics: MetricSnapshot[];
  } {
    const metrics: MetricSnapshot[] = [];

    for (const c of this.counters.values()) metrics.push(c.snapshot());
    for (const g of this.gauges.values()) metrics.push(g.snapshot());
    for (const h of this.histograms.values()) metrics.push(h.snapshot());

    return {
      uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: Date.now(),
      metrics,
    };
  }

  /**
   * 健康检查摘要
   */
  healthCheck(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    llm: { calls: number; errors: number; errorRate: number; avgLatency: number };
    tools: { calls: number; avgLatency: number };
    circuitBreaker?: string;
  } {
    const llmCalls = this.counter('llm_calls_total').get();
    const llmErrors = this.counter('llm_errors_total').get();
    const llmStats = this.histogram('llm_latency_seconds').getStats();
    const toolCallsVal = this.counter('tool_calls_total').get();
    const toolStats = this.histogram('tool_latency_seconds').getStats();

    const errorRate = llmCalls > 0 ? llmErrors / llmCalls : 0;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (errorRate > 0.5) status = 'unhealthy';
    else if (errorRate > 0.2) status = 'degraded';

    return {
      status,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      llm: {
        calls: llmCalls,
        errors: llmErrors,
        errorRate: Math.round(errorRate * 1000) / 1000,
        avgLatency: Math.round(llmStats.avg * 1000) / 1000,
      },
      tools: {
        calls: toolCallsVal,
        avgLatency: Math.round(toolStats.avg * 1000) / 1000,
      },
    };
  }

  /**
   * 重置所有指标
   */
  reset(): void {
    for (const c of this.counters.values()) c.reset();
    for (const g of this.gauges.values()) g.set(0);
    for (const h of this.histograms.values()) h.reset();
  }

  private key(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${labelStr}}`;
  }
}
