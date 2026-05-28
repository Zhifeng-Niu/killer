/**
 * Consciousness - 自我监控系统
 *
 * 长程任务执行期间的自我观测：
 * - 执行时间线追踪
 * - 资源使用监控
 * - 停滞检测与自动策略切换
 * - 健康评估
 */

import type { KernelLogger } from '../brainstem/types.js';
import { SILENT_LOGGER } from '../brainstem/types.js';

/** 健康状态 */
export type HealthStatus = 'healthy' | 'degraded' | 'stressed' | 'critical';

/** 时间线条目 */
export interface TimelineEntry {
  timestamp: number;
  phase: string;
  action: string;
  durationMs: number;
  success: boolean;
  metadata?: Record<string, unknown>;
}

/** 资源快照 */
export interface ResourceSnapshot {
  timestamp: number;
  memoryUsageMb: number;
  activeTools: number;
  pendingPerceptions: number;
  loopCycleMs: number;
}

/** 停滞检测结果 */
export interface StagnationReport {
  isStagnant: boolean;
  stagnationType: 'progress' | 'quality' | 'resource' | 'none';
  durationMs: number;
  consecutiveFailures: number;
  suggestedAction: string;
}

/** 健康报告 */
export interface HealthReport {
  status: HealthStatus;
  uptimeMs: number;
  totalActions: number;
  successRate: number;
  averageCycleMs: number;
  memoryUsageMb: number;
  stagnation: StagnationReport;
  recentErrors: string[];
  recommendations: string[];
}

/** 自我监控配置 */
export interface SelfMonitorConfig {
  /** 时间线最大条目数 */
  maxTimelineEntries: number;
  /** 停滞检测窗口（毫秒） */
  stagnationWindowMs: number;
  /** 连续失败停滞阈值 */
  stagnationFailureThreshold: number;
  /** 健康检查间隔（毫秒） */
  healthCheckIntervalMs: number;
  /** 最大错误历史 */
  maxErrorHistory: number;
}

export const DEFAULT_SELF_MONITOR_CONFIG: SelfMonitorConfig = {
  maxTimelineEntries: 1000,
  stagnationWindowMs: 30 * 60 * 1000,    // 30 分钟
  stagnationFailureThreshold: 5,
  healthCheckIntervalMs: 60 * 1000,       // 1 分钟
  maxErrorHistory: 50,
};

/**
 * 自我监控器
 */
export class SelfMonitor {
  private readonly config: SelfMonitorConfig;
  private readonly logger: KernelLogger;

  /** 执行时间线 */
  private timeline: TimelineEntry[] = [];

  /** 资源快照 */
  private resourceSnapshots: ResourceSnapshot[] = [];

  /** 错误历史 */
  private errorHistory: string[] = [];

  /** 启动时间 */
  private startedAt: number = Date.now();

  /** 总行动数 */
  private totalActions: number = 0;

  /** 成功行动数 */
  private successfulActions: number = 0;

  /** 最近循环耗时 */
  private recentCycleTimes: number[] = [];

  /** 健康检查定时器 */
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  /** 上一次有进展的时间 */
  private lastProgressAt: number = Date.now();

  /** 连续失败计数 */
  private consecutiveFailures: number = 0;

  constructor(config: Partial<SelfMonitorConfig> = {}, logger: KernelLogger = SILENT_LOGGER) {
    this.config = { ...DEFAULT_SELF_MONITOR_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * 启动监控
   */
  start(): void {
    this.startedAt = Date.now();
    this.lastProgressAt = this.startedAt;

    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);

    this.healthCheckTimer = setInterval(() => {
      const report = this.checkHealth();
      if (report.status !== 'healthy') {
        this.logger.warn(`[SelfMonitor] Health: ${report.status} — ${report.recommendations.join('; ')}`);
      }
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * 停止监控
   */
  stop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * 记录行动完成
   */
  recordAction(
    phase: string,
    action: string,
    durationMs: number,
    success: boolean,
    metadata?: Record<string, unknown>,
  ): void {
    const entry: TimelineEntry = {
      timestamp: Date.now(),
      phase,
      action,
      durationMs,
      success,
      metadata,
    };

    this.timeline = [...this.timeline, entry].slice(-this.config.maxTimelineEntries);
    this.totalActions += 1;

    if (success) {
      this.successfulActions += 1;
      this.consecutiveFailures = 0;
      this.lastProgressAt = Date.now();
    } else {
      this.consecutiveFailures += 1;
    }
  }

  /**
   * 记录错误
   */
  recordError(error: string): void {
    this.errorHistory = [...this.errorHistory, error].slice(-this.config.maxErrorHistory);
  }

  /**
   * 记录循环耗时
   */
  recordCycleTime(ms: number): void {
    this.recentCycleTimes = [...this.recentCycleTimes, ms].slice(-20);
  }

  /**
   * 记录资源快照
   */
  recordResource(snapshot: ResourceSnapshot): void {
    this.resourceSnapshots = [...this.resourceSnapshots, snapshot].slice(-100);
  }

  /**
   * 检测停滞
   */
  detectStagnation(): StagnationReport {
    const now = Date.now();
    const windowStart = now - this.config.stagnationWindowMs;

    // 检查连续失败
    if (this.consecutiveFailures >= this.config.stagnationFailureThreshold) {
      return {
        isStagnant: true,
        stagnationType: 'progress',
        durationMs: now - this.lastProgressAt,
        consecutiveFailures: this.consecutiveFailures,
        suggestedAction: 'Switch strategy — current approach is not producing results',
      };
    }

    // 检查最近是否有进展
    const recentSuccesses = this.timeline.filter(
      e => e.timestamp >= windowStart && e.success,
    );
    if (recentSuccesses.length === 0 && this.timeline.length > 10) {
      return {
        isStagnant: true,
        stagnationType: 'progress',
        durationMs: now - this.lastProgressAt,
        consecutiveFailures: this.consecutiveFailures,
        suggestedAction: 'No progress in window — consider goal decomposition or replanning',
      };
    }

    // 检查资源压力（内存）
    const latestResource = this.resourceSnapshots[this.resourceSnapshots.length - 1];
    if (latestResource && latestResource.memoryUsageMb > 500) {
      return {
        isStagnant: true,
        stagnationType: 'resource',
        durationMs: now - this.lastProgressAt,
        consecutiveFailures: this.consecutiveFailures,
        suggestedAction: 'Memory pressure detected — clean up caches or reduce working set',
      };
    }

    return {
      isStagnant: false,
      stagnationType: 'none',
      durationMs: 0,
      consecutiveFailures: this.consecutiveFailures,
      suggestedAction: 'Continue current approach',
    };
  }

  /**
   * 健康检查
   */
  checkHealth(): HealthReport {
    const now = Date.now();
    const uptimeMs = now - this.startedAt;
    const successRate = this.totalActions > 0
      ? this.successfulActions / this.totalActions
      : 1;
    const averageCycleMs = this.recentCycleTimes.length > 0
      ? this.recentCycleTimes.reduce((a, b) => a + b, 0) / this.recentCycleTimes.length
      : 0;
    const latestResource = this.resourceSnapshots[this.resourceSnapshots.length - 1];
    const memoryUsageMb = latestResource?.memoryUsageMb ?? 0;
    const stagnation = this.detectStagnation();
    const recentErrors = this.errorHistory.slice(-5);

    const status = this.computeHealthStatus(successRate, stagnation, averageCycleMs);
    const recommendations = this.generateRecommendations(status, successRate, stagnation, averageCycleMs);

    return {
      status,
      uptimeMs,
      totalActions: this.totalActions,
      successRate,
      averageCycleMs,
      memoryUsageMb,
      stagnation,
      recentErrors,
      recommendations,
    };
  }

  /**
   * 获取执行时间线
   */
  getTimeline(limit: number = 50): TimelineEntry[] {
    return this.timeline.slice(-limit);
  }

  /**
   * 获取摘要统计
   */
  getSummary(): {
    uptimeMs: number;
    totalActions: number;
    successRate: number;
    consecutiveFailures: number;
    healthStatus: HealthStatus;
  } {
    const report = this.checkHealth();
    return {
      uptimeMs: report.uptimeMs,
      totalActions: report.totalActions,
      successRate: report.successRate,
      consecutiveFailures: this.consecutiveFailures,
      healthStatus: report.status,
    };
  }

  /**
   * 重置监控状态
   */
  reset(): void {
    this.timeline = [];
    this.resourceSnapshots = [];
    this.errorHistory = [];
    this.startedAt = Date.now();
    this.lastProgressAt = Date.now();
    this.totalActions = 0;
    this.successfulActions = 0;
    this.consecutiveFailures = 0;
    this.recentCycleTimes = [];
  }

  // ─── 私有方法 ───

  private computeHealthStatus(
    successRate: number,
    stagnation: StagnationReport,
    averageCycleMs: number,
  ): HealthStatus {
    if (stagnation.isStagnant && stagnation.stagnationType === 'resource') return 'critical';
    if (successRate < 0.3 || this.consecutiveFailures >= 10) return 'critical';
    if (successRate < 0.5 || this.consecutiveFailures >= 5) return 'stressed';
    if (successRate < 0.7 || averageCycleMs > 30_000) return 'degraded';
    return 'healthy';
  }

  private generateRecommendations(
    status: HealthStatus,
    successRate: number,
    stagnation: StagnationReport,
    averageCycleMs: number,
  ): string[] {
    const recs: string[] = [];

    if (successRate < 0.5) {
      recs.push('Low success rate — switch to simpler, more reliable approaches');
    }
    if (this.consecutiveFailures >= 5) {
      recs.push('Multiple consecutive failures — pause and reassess strategy');
    }
    if (averageCycleMs > 30_000) {
      recs.push('Slow cycle time — investigate bottlenecks in reasoning or tool execution');
    }
    if (stagnation.isStagnant) {
      recs.push(stagnation.suggestedAction);
    }

    return recs;
  }
}
