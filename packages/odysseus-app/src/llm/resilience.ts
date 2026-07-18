/**
 * Resilience - 断路器和重试模式
 *
 * 为 LLM 调用提供容错能力
 */

import type { LLMProvider, LLMCompletion, LLMToolCallCompletion, ToolDefinition, ChatMessage } from '@odysseus/core';
import { LLMError } from '@odysseus/core';

/**
 * 断路器状态
 */
type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * 断路器配置
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;  // 触发断开的失败次数
  resetTimeoutMs: number;    // 断开后等待重试的时间
  halfOpenMaxAttempts: number; // 半开状态最大尝试次数
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxAttempts: 1,
};

/**
 * 重试配置
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * 断路器 + 重试包装器
 *
 * 包装 LLMProvider，提供：
 * - 指数退避重试
 * - 断路器模式（连续失败后停止调用）
 * - 自动恢复（半开状态尝试）
 */
export class ResilientLLMProvider implements LLMProvider {
  private readonly inner: LLMProvider;
  private readonly circuitConfig: CircuitBreakerConfig;
  private readonly retryConfig: RetryConfig;

  // 断路器状态
  private circuitState: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;

  constructor(
    inner: LLMProvider,
    circuitConfig?: Partial<CircuitBreakerConfig>,
    retryConfig?: Partial<RetryConfig>,
  ) {
    this.inner = inner;
    this.circuitConfig = { ...DEFAULT_CIRCUIT_CONFIG, ...circuitConfig };
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  getModel(): string {
    return this.inner.getModel();
  }

  setModel(model: string): void {
    if ('setModel' in this.inner && typeof this.inner.setModel === 'function') {
      this.inner.setModel(model);
    }
  }

  async complete(prompt: string, context?: string, history?: ChatMessage[]): Promise<LLMCompletion> {
    return this.executeWithResilience(() => this.inner.complete(prompt, context, history));
  }

  async *stream(prompt: string, context?: string, history?: ChatMessage[]): AsyncIterable<string> {
    // 流式调用使用重试但不使用断路器（流可能部分失败）
    const lastError: Error[] = [];

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        const stream = this.inner.stream(prompt, context, history);
        for await (const chunk of stream) {
          yield chunk;
        }
        return;
      } catch (error) {
        lastError.push(error instanceof Error ? error : new Error(String(error)));
        if (attempt < this.retryConfig.maxAttempts) {
          await this.delay(this.calculateDelay(attempt));
        }
      }
    }

    throw lastError[lastError.length - 1] ?? new Error('Stream failed');
  }

  /**
   * 透传原生 function calling — 带断路器和重试保护
   */
  async completeWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[],
  ): Promise<LLMToolCallCompletion> {
    if (!this.inner.completeWithTools) {
      throw new LLMError(
        `Provider "${this.inner.getModel()}" does not support native function calling`,
        this.inner.getModel(),
      );
    }
    return this.executeWithResilience(() => this.inner.completeWithTools!(messages, tools));
  }

  /**
   * 获取断路器状态
   */
  getCircuitState(): CircuitState {
    this.maybeTransitionToHalfOpen();
    return this.circuitState;
  }

  /**
   * 重置断路器
   */
  reset(): void {
    this.circuitState = 'closed';
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
  }

  /**
   * 使用重试和断路器执行操作
   */
  private async executeWithResilience<T>(fn: () => Promise<T>): Promise<T> {
    // 检查断路器状态
    if (this.circuitState === 'open') {
      this.maybeTransitionToHalfOpen();
      if (this.circuitState === 'open') {
        throw new LLMError(`AI 服务暂时不可用（连续多次失败），将自动重试。如持续出现，请检查 API key 或运行 /health 诊断。`, this.inner.getModel());
      }
    }

    const lastError: Error[] = [];

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        const result = await fn();

        // 成功 → 重置断路器
        this.onSuccess();
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        lastError.push(err);

        this.onFailure();

        // 如果断路器打开，不再重试
        if ((this.circuitState as string) === 'open') {
          break;
        }

        // 指数退避
        if (attempt < this.retryConfig.maxAttempts) {
          await this.delay(this.calculateDelay(attempt));
        }
      }
    }

    throw lastError[lastError.length - 1] ?? new Error('All attempts failed');
  }

  /**
   * 记录成功
   */
  private onSuccess(): void {
    this.failureCount = 0;
    this.circuitState = 'closed';
    this.halfOpenAttempts = 0;
  }

  /**
   * 记录失败
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.circuitState === 'half-open') {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.circuitConfig.halfOpenMaxAttempts) {
        this.circuitState = 'open';
      }
    } else if (this.failureCount >= this.circuitConfig.failureThreshold) {
      this.circuitState = 'open';
    }
  }

  /**
   * 检查是否应该转换到半开状态
   */
  private maybeTransitionToHalfOpen(): void {
    if (this.circuitState === 'open') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.circuitConfig.resetTimeoutMs) {
        this.circuitState = 'half-open';
        this.halfOpenAttempts = 0;
      }
    }
  }

  /**
   * 计算退避延迟
   */
  private calculateDelay(attempt: number): number {
    const delay = this.retryConfig.baseDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
    // 添加随机抖动 (0-25%)
    const jitter = delay * 0.25 * Math.random();
    return Math.min(delay + jitter, this.retryConfig.maxDelayMs);
  }

  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 获取完整诊断信息（用于 /health 和 /metrics 端点）
   */
  getDiagnostics(): {
    model: string;
    circuitState: CircuitState;
    failureCount: number;
    lastFailureTime: number | null;
    halfOpenAttempts: number;
    config: {
      failureThreshold: number;
      resetTimeoutMs: number;
      maxRetryAttempts: number;
    };
  } {
    return {
      model: this.inner.getModel(),
      circuitState: this.getCircuitState(),
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime || null,
      halfOpenAttempts: this.halfOpenAttempts,
      config: {
        failureThreshold: this.circuitConfig.failureThreshold,
        resetTimeoutMs: this.circuitConfig.resetTimeoutMs,
        maxRetryAttempts: this.retryConfig.maxAttempts,
      },
    };
  }
}
