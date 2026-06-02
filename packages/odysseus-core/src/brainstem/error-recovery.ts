/**
 * Brainstem - 增强错误恢复系统
 *
 * 为长程任务提供稳健的错误处理：
 * - 断路器（Circuit Breaker）
 * - 指数退避与抖动
 * - 优雅降级
 * - 状态恢复
 */

import type { KernelLogger } from './types.js';
import { SILENT_LOGGER } from './types.js';

// ─── 断路器 ───

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerConfig {
  /** 触发断路的连续失败次数 */
  failureThreshold: number;
  /** 断路器打开持续时间（毫秒） */
  resetTimeoutMs: number;
  /** 半开状态下允许的探测请求数 */
  halfOpenMaxProbes: number;
  /** 成功次数达到此值后关闭断路器 */
  successThreshold: number;
}

export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 60_000,    // 1 分钟
  halfOpenMaxProbes: 3,
  successThreshold: 2,
};

/** 断路器状态快照 */
export interface CircuitSnapshot {
  name: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
  openedAt: number | null;
}

/**
 * 断路器
 *
 * 保护外部资源（LLM、工具、网络）免受级联故障
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureAt: number | null = null;
  private lastSuccessAt: number | null = null;
  private openedAt: number | null = null;

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig = DEFAULT_CIRCUIT_CONFIG,
    private readonly logger: KernelLogger = SILENT_LOGGER,
  ) {}

  /**
   * 执行受保护的调用
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - (this.openedAt ?? 0) >= this.config.resetTimeoutMs) {
        this.transitionTo('half_open');
      } else {
        throw new CircuitOpenError(this.name, this.openedAt);
      }
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error: unknown) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * 获取当前状态
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * 获取快照
   */
  snapshot(): CircuitSnapshot {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureAt: this.lastFailureAt,
      lastSuccessAt: this.lastSuccessAt,
      openedAt: this.openedAt,
    };
  }

  /**
   * 手动重置
   */
  reset(): void {
    this.transitionTo('closed');
  }

  private recordSuccess(): void {
    this.successCount += 1;
    this.lastSuccessAt = Date.now();

    if (this.state === 'half_open') {
      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo('closed');
      }
    }
  }

  private recordFailure(): void {
    this.failureCount += 1;
    this.lastFailureAt = Date.now();

    if (this.state === 'half_open') {
      this.transitionTo('open');
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.transitionTo('open');
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === 'open') {
      this.openedAt = Date.now();
      this.successCount = 0;
    } else if (newState === 'closed') {
      this.failureCount = 0;
      this.successCount = 0;
      this.openedAt = null;
    } else if (newState === 'half_open') {
      this.successCount = 0;
    }

    if (oldState !== newState) {
      this.logger.info(`[CircuitBreaker] ${this.name}: ${oldState} → ${newState}`);
    }
  }
}

/**
 * 断路器打开时抛出的错误
 */
export class CircuitOpenError extends Error {
  constructor(
    public readonly circuitName: string,
    public readonly openedAt: number | null,
  ) {
    super(`Circuit "${circuitName}" is open${openedAt ? ` since ${new Date(openedAt).toISOString()}` : ''}`);
    this.name = 'CircuitOpenError';
  }
}

// ─── 指数退避 ───

export interface BackoffConfig {
  /** 初始延迟（毫秒） */
  initialDelayMs: number;
  /** 最大延迟（毫秒） */
  maxDelayMs: number;
  /** 退避乘数 */
  multiplier: number;
  /** 抖动因子 (0-1) */
  jitterFactor: number;
  /** 最大重试次数 */
  maxRetries: number;
}

export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 60_000,
  multiplier: 2,
  jitterFactor: 0.2,
  maxRetries: 10,
};

/**
 * 指数退避重试器
 */
export class ExponentialBackoff {
  private attempt: number = 0;

  constructor(private readonly config: BackoffConfig = DEFAULT_BACKOFF_CONFIG) {}

  /**
   * 执行带重试的异步操作
   */
  async execute<T>(
    fn: () => Promise<T>,
    isRetryable: (error: unknown) => boolean = () => true,
  ): Promise<T> {
    this.attempt = 0;

    while (true) {
      try {
        return await fn();
      } catch (error: unknown) {
        this.attempt += 1;

        if (this.attempt > this.config.maxRetries || !isRetryable(error)) {
          throw error;
        }

        const delay = this.computeDelay();
        await this.sleep(delay);
      }
    }
  }

  /**
   * 获取当前尝试次数
   */
  getAttempt(): number {
    return this.attempt;
  }

  /**
   * 计算下一次延迟
   */
  computeDelay(): number {
    const base = Math.min(
      this.config.initialDelayMs * Math.pow(this.config.multiplier, this.attempt - 1),
      this.config.maxDelayMs,
    );
    const jitter = base * this.config.jitterFactor * Math.random();
    return Math.floor(base + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ─── 降级策略 ───

export type FallbackFn<T> = (error: unknown) => Promise<T>;

/**
 * 降级执行器
 *
 * 按优先级尝试多个策略，直到一个成功
 */
export class FallbackExecutor {
  constructor(private readonly logger: KernelLogger = SILENT_LOGGER) {}

  /**
   * 按顺序尝试多个策略
   */
  async execute<T>(
    strategies: Array<{
      name: string;
      execute: () => Promise<T>;
    }>,
  ): Promise<{ result: T; strategyUsed: string }> {
    let lastError: unknown = null;

    for (const strategy of strategies) {
      try {
        const result = await strategy.execute();
        return { result, strategyUsed: strategy.name };
      } catch (error: unknown) {
        lastError = error;
        this.logger.info(`[FallbackExecutor] ${strategy.name} failed: ${String(error)}`);
      }
    }

    throw lastError ?? new Error('All fallback strategies exhausted');
  }
}

// ─── 错误恢复管理器 ───

export interface ErrorRecoveryConfig {
  circuitBreaker: CircuitBreakerConfig;
  backoff: BackoffConfig;
}

export const DEFAULT_ERROR_RECOVERY_CONFIG: ErrorRecoveryConfig = {
  circuitBreaker: DEFAULT_CIRCUIT_CONFIG,
  backoff: DEFAULT_BACKOFF_CONFIG,
};

/**
 * 错误恢复管理器
 *
 * 统一管理断路器、退避和降级策略
 */
export class ErrorRecoveryManager {
  private readonly circuits: Map<string, CircuitBreaker> = new Map();
  private readonly logger: KernelLogger;

  constructor(
    private readonly config: ErrorRecoveryConfig = DEFAULT_ERROR_RECOVERY_CONFIG,
    logger: KernelLogger = SILENT_LOGGER,
  ) {
    this.logger = logger;
  }

  /**
   * 获取或创建断路器
   */
  getCircuit(name: string): CircuitBreaker {
    let circuit = this.circuits.get(name);
    if (!circuit) {
      circuit = new CircuitBreaker(name, this.config.circuitBreaker, this.logger);
      this.circuits.set(name, circuit);
    }
    return circuit;
  }

  /**
   * 带完整恢复策略的执行
   */
  async executeWithRecovery<T>(
    name: string,
    primary: () => Promise<T>,
    fallback?: FallbackFn<T>,
  ): Promise<T> {
    const circuit = this.getCircuit(name);
    const backoff = new ExponentialBackoff(this.config.backoff);

    try {
      return await circuit.execute(() =>
        backoff.execute(primary, (error) => !(error instanceof CircuitOpenError)),
      );
    } catch (error: unknown) {
      if (fallback) {
        this.logger.info(`[ErrorRecoveryManager] Using fallback for ${name}`);
        return await fallback(error);
      }
      throw error;
    }
  }

  /**
   * 获取所有断路器状态
   */
  getAllCircuitStates(): CircuitSnapshot[] {
    return Array.from(this.circuits.values()).map(c => c.snapshot());
  }

  /**
   * 重置所有断路器
   */
  resetAll(): void {
    for (const circuit of this.circuits.values()) {
      circuit.reset();
    }
  }
}
