/**
 * Prefrontal Cortex - 迭代优化器
 *
 * 执行 → 评估 → 调整的闭环优化系统：
 * - 质量指标追踪
 * - 自动策略调整
 * - 自我批评与改进建议
 * - 收敛检测
 */

import type { Plan, PlanStep, StepResult } from './types.js';

/** 质量指标 */
export interface QualityMetric {
  name: string;
  value: number;
  direction: 'lower' | 'higher';
  unit: string;
  timestamp: number;
}

/** 优化策略 */
export type RefinementStrategy =
  | 'continue'       // 继续当前路径
  | 'backtrack'      // 回退到上一个检查点
  | 'replan'         // 重新规划剩余步骤
  | 'decompose'      // 将当前步骤分解为更小的子步骤
  | 'escalate';      // 请求更高层级介入

/** 评估结果 */
export interface EvaluationResult {
  overallQuality: number;   // 0-1
  metrics: QualityMetric[];
  trend: 'improving' | 'stable' | 'degrading';
  suggestedStrategy: RefinementStrategy;
  reasoning: string;
  confidence: number;       // 0-1
}

/** 优化轮次记录 */
export interface RefinementRound {
  roundNumber: number;
  timestamp: number;
  evaluation: EvaluationResult;
  actionTaken: string;
  metricsSnapshot: QualityMetric[];
}

/** 优化器配置 */
export interface IterativeRefinerConfig {
  /** 最大优化轮次，0 = 无限制 */
  maxRounds: number;
  /** 收敛阈值：质量变化低于此值视为收敛 */
  convergenceThreshold: number;
  /** 连续稳定轮次后视为收敛 */
  convergencePatience: number;
  /** 退化容忍度：连续退化 N 轮后触发策略切换 */
  degradationTolerance: number;
}

export const DEFAULT_REFINER_CONFIG: IterativeRefinerConfig = {
  maxRounds: 0,              // 无限制
  convergenceThreshold: 0.01,
  convergencePatience: 3,
  degradationTolerance: 3,
};

/**
 * 迭代优化器
 */
export class IterativeRefiner {
  private readonly config: IterativeRefinerConfig;

  /** 质量指标历史 */
  private readonly metricHistory: Map<string, QualityMetric[]> = new Map();

  /** 优化轮次 */
  private rounds: RefinementRound[] = [];

  /** 连续退化计数 */
  private degradationCount: number = 0;

  /** 连续稳定计数 */
  private stableCount: number = 0;

  /** 当前策略 */
  private currentStrategy: RefinementStrategy = 'continue';

  constructor(config: Partial<IterativeRefinerConfig> = {}) {
    this.config = { ...DEFAULT_REFINER_CONFIG, ...config };
  }

  /**
   * 记录指标值
   */
  recordMetric(metric: QualityMetric): void {
    const history = this.metricHistory.get(metric.name) ?? [];
    history.push(metric);
    this.metricHistory.set(metric.name, [...history]);
  }

  /**
   * 评估当前质量状态
   */
  evaluate(): EvaluationResult {
    const metrics = this.getCurrentMetrics();
    const overallQuality = this.computeOverallQuality(metrics);
    const trend = this.detectTrend();
    const suggestedStrategy = this.selectStrategy(trend, overallQuality);
    const confidence = this.estimateConfidence();

    const evaluation: EvaluationResult = {
      overallQuality,
      metrics,
      trend,
      suggestedStrategy,
      reasoning: this.generateReasoning(trend, overallQuality, suggestedStrategy),
      confidence,
    };

    this.recordRound(evaluation);
    this.updateCounts(trend);

    return evaluation;
  }

  /**
   * 获取优化历史
   */
  getHistory(): RefinementRound[] {
    return [...this.rounds];
  }

  /**
   * 获取当前策略
   */
  getCurrentStrategy(): RefinementStrategy {
    return this.currentStrategy;
  }

  /**
   * 应用策略建议
   */
  applyStrategy(strategy: RefinementStrategy): void {
    this.currentStrategy = strategy;
    if (strategy !== 'continue') {
      this.degradationCount = 0;
    }
  }

  /**
   * 检测是否已收敛
   */
  isConverged(): boolean {
    return this.stableCount >= this.config.convergencePatience;
  }

  /**
   * 获取指标趋势
   */
  getMetricTrend(name: string): 'improving' | 'stable' | 'degrading' | 'unknown' {
    const history = this.metricHistory.get(name);
    if (!history || history.length < 2) return 'unknown';

    const recent = history.slice(-5);
    const metric = recent[0];
    if (!metric) return 'unknown';

    const values = recent.map(m => m.value);
    const direction = metric.direction;

    let improvements = 0;
    for (let i = 1; i < values.length; i++) {
      const improved = direction === 'lower'
        ? values[i] < values[i - 1]
        : values[i] > values[i - 1];
      if (improved) improvements++;
    }

    const ratio = improvements / (values.length - 1);
    if (ratio > 0.6) return 'improving';
    if (ratio < 0.4) return 'degrading';
    return 'stable';
  }

  /**
   * 重置优化器状态
   */
  reset(): void {
    this.metricHistory.clear();
    this.rounds = [];
    this.degradationCount = 0;
    this.stableCount = 0;
    this.currentStrategy = 'continue';
  }

  // ─── 私有方法 ───

  private getCurrentMetrics(): QualityMetric[] {
    const metrics: QualityMetric[] = [];
    for (const [, history] of this.metricHistory) {
      if (history.length > 0) {
        metrics.push(history[history.length - 1]);
      }
    }
    return metrics;
  }

  private computeOverallQuality(metrics: QualityMetric[]): number {
    if (metrics.length === 0) return 0.5;

    let totalScore = 0;
    for (const metric of metrics) {
      const normalized = metric.direction === 'lower'
        ? 1 - Math.min(metric.value / 100, 1)
        : Math.min(metric.value / 100, 1);
      totalScore += normalized;
    }

    return totalScore / metrics.length;
  }

  private detectTrend(): 'improving' | 'stable' | 'degrading' {
    if (this.rounds.length < 2) return 'stable';

    const recent = this.rounds.slice(-3);
    let improving = 0;
    let degrading = 0;

    for (let i = 1; i < recent.length; i++) {
      const diff = recent[i].evaluation.overallQuality
        - recent[i - 1].evaluation.overallQuality;
      if (diff > this.config.convergenceThreshold) improving++;
      else if (diff < -this.config.convergenceThreshold) degrading++;
    }

    if (improving > degrading) return 'improving';
    if (degrading > improving) return 'degrading';
    return 'stable';
  }

  private selectStrategy(
    trend: 'improving' | 'stable' | 'degrading',
    quality: number,
  ): RefinementStrategy {
    if (trend === 'degrading') {
      if (this.degradationCount >= this.config.degradationTolerance) {
        return this.degradationCount >= this.config.degradationTolerance * 2
          ? 'escalate'
          : 'replan';
      }
      return 'backtrack';
    }

    if (trend === 'stable' && quality < 0.3) {
      return 'decompose';
    }

    if (trend === 'stable' && this.stableCount >= this.config.convergencePatience) {
      return quality >= 0.7 ? 'continue' : 'decompose';
    }

    return 'continue';
  }

  private estimateConfidence(): number {
    const metricCount = this.metricHistory.size;
    const roundCount = this.rounds.length;
    const dataFactor = Math.min(metricCount / 3, 1);
    const historyFactor = Math.min(roundCount / 5, 1);
    return (dataFactor + historyFactor) / 2;
  }

  private generateReasoning(
    trend: string,
    quality: number,
    strategy: RefinementStrategy,
  ): string {
    const parts: string[] = [];
    parts.push(`Quality: ${(quality * 100).toFixed(1)}%, Trend: ${trend}`);

    if (strategy === 'backtrack') {
      parts.push('Degradation detected — reverting to last stable state');
    } else if (strategy === 'replan') {
      parts.push('Persistent degradation — replanning remaining steps');
    } else if (strategy === 'decompose') {
      parts.push('Stalled progress — decomposing into finer steps');
    } else if (strategy === 'escalate') {
      parts.push('Severe degradation — escalating for higher-level intervention');
    } else {
      parts.push('On track — continuing current approach');
    }

    return parts.join('. ');
  }

  private recordRound(evaluation: EvaluationResult): void {
    const round: RefinementRound = {
      roundNumber: this.rounds.length + 1,
      timestamp: Date.now(),
      evaluation,
      actionTaken: evaluation.suggestedStrategy,
      metricsSnapshot: [...evaluation.metrics],
    };
    this.rounds = [...this.rounds, round];
  }

  private updateCounts(trend: 'improving' | 'stable' | 'degrading'): void {
    if (trend === 'degrading') {
      this.degradationCount += 1;
      this.stableCount = 0;
    } else if (trend === 'stable') {
      this.stableCount += 1;
    } else {
      this.degradationCount = Math.max(0, this.degradationCount - 1);
      this.stableCount = 0;
    }
  }
}
