/**
 * Brainstem - 执行上下文管理器
 *
 * 跨步骤的状态传递与结果累积。
 * 每个 ToolChain 步骤可读写共享上下文。
 */

/**
 * 执行上下文
 */
export class ExecutionContext {
  private readonly store: Map<string, unknown> = new Map();
  private readonly results: Map<string, { output: unknown; timestamp: number }> = new Map();
  private readonly metadata: Map<string, unknown> = new Map();
  private history: Array<{ key: string; value: unknown; timestamp: number }> = [];

  /**
   * 设置键值对
   */
  set(key: string, value: unknown): void {
    this.store.set(key, value);
    this.history = [...this.history, { key, value, timestamp: Date.now() }];
  }

  /**
   * 获取值
   */
  get<T = unknown>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  /**
   * 获取值，带默认值
   */
  getOrDefault<T>(key: string, defaultValue: T): T {
    return (this.store.get(key) as T) ?? defaultValue;
  }

  /**
   * 检查键是否存在
   */
  has(key: string): boolean {
    return this.store.has(key);
  }

  /**
   * 记录步骤输出
   */
  recordStepOutput(stepId: string, output: unknown): void {
    this.results.set(stepId, { output, timestamp: Date.now() });
  }

  /**
   * 获取步骤输出
   */
  getStepOutput<T = unknown>(stepId: string): T | undefined {
    return this.results.get(stepId)?.output as T | undefined;
  }

  /**
   * 获取上一步的输出
   */
  getPreviousOutput<T = unknown>(currentStepId: string): T | undefined {
    const stepIds = Array.from(this.results.keys());
    const currentIndex = stepIds.indexOf(currentStepId);
    if (currentIndex <= 0) return undefined;
    return this.results.get(stepIds[currentIndex - 1])?.output as T | undefined;
  }

  /**
   * 获取所有步骤输出（按时间排序）
   */
  getAllOutputs(): Array<{ stepId: string; output: unknown; timestamp: number }> {
    return Array.from(this.results.entries())
      .map(([stepId, result]) => ({ stepId, ...result }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * 设置元数据
   */
  setMetadata(key: string, value: unknown): void {
    this.metadata.set(key, value);
  }

  /**
   * 获取元数据
   */
  getMetadata<T = unknown>(key: string): T | undefined {
    return this.metadata.get(key) as T | undefined;
  }

  /**
   * 创建快照
   */
  snapshot(): {
    store: Record<string, unknown>;
    results: Record<string, { output: unknown; timestamp: number }>;
    metadata: Record<string, unknown>;
    historyLength: number;
  } {
    return {
      store: Object.fromEntries(this.store),
      results: Object.fromEntries(this.results),
      metadata: Object.fromEntries(this.metadata),
      historyLength: this.history.length,
    };
  }

  /**
   * 从快照恢复
   */
  restore(snapshot: {
    store?: Record<string, unknown>;
    results?: Record<string, { output: unknown; timestamp: number }>;
    metadata?: Record<string, unknown>;
  }): void {
    this.store.clear();
    this.results.clear();
    this.metadata.clear();
    this.history = [];

    if (snapshot.store) {
      for (const [k, v] of Object.entries(snapshot.store)) {
        this.store.set(k, v);
      }
    }
    if (snapshot.results) {
      for (const [k, v] of Object.entries(snapshot.results)) {
        this.results.set(k, v);
      }
    }
    if (snapshot.metadata) {
      for (const [k, v] of Object.entries(snapshot.metadata)) {
        this.metadata.set(k, v);
      }
    }
  }

  /**
   * 清空上下文
   */
  clear(): void {
    this.store.clear();
    this.results.clear();
    this.metadata.clear();
    this.history = [];
  }
}
