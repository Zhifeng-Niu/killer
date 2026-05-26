/**
 * Evaluator - 4层验证管道
 *
 * Layer 0: Syntax  — 快速语法检查 (10s)
 * Layer 1: Guard   — 用户定义的约束 (120s)
 * Layer 2: Metric  — 指标测量 (600s)
 * Layer 3: Quality — 质量检查 (60s, 软约束)
 */

import type {
  MetricDefinition,
  MetricLayerResult,
  MetricValue,
  QualityLayerResult,
  QualityWarning,
  VerificationResult,
  LayerResult,
} from './types.js';

/**
 * 验证管道 — 对实验结果进行 4 层检查
 */
export class Evaluator {
  private readonly metrics: MetricDefinition[];
  private readonly guardCommand: string;
  private readonly guardTimeout: number;

  constructor(
    metrics: MetricDefinition[],
    guardCommand?: string,
    guardTimeout?: number,
  ) {
    this.metrics = metrics;
    this.guardCommand = guardCommand ?? '';
    this.guardTimeout = guardTimeout ?? 120_000;
  }

  /**
   * 执行完整验证管道
   *
   * 前层失败则跳过后层（除了 Layer 0 失败直接返回）
   */
  async verify(
    previousBest: Record<string, number | null>,
    syntaxChecker?: (code: string) => Promise<LayerResult>,
    code?: string,
  ): Promise<VerificationResult> {
    const startTime = Date.now();

    // Layer 0: Syntax
    const syntax = code && syntaxChecker
      ? await syntaxChecker(code)
      : this.passLayer('syntax check skipped');

    if (!syntax.passed) {
      return this.buildResult(syntax, this.failLayer('skipped'), this.emptyMetricLayer(), this.emptyQualityLayer(), startTime);
    }

    // Layer 1: Guard
    const guard = this.guardCommand
      ? await this.runGuard()
      : this.passLayer('no guard defined');

    if (!guard.passed) {
      return this.buildResult(syntax, guard, this.emptyMetricLayer(), this.emptyQualityLayer(), startTime);
    }

    // Layer 2: Metric
    const metric = await this.measureMetrics(previousBest);

    // Layer 3: Quality (always runs, never blocks)
    const quality = await this.runQualityChecks();

    return this.buildResult(syntax, guard, metric, quality, startTime);
  }

  /**
   * 根据实验结果和 orientation 做出 keep/discard 决策
   */
  decide(
    verification: VerificationResult,
    orientation: 'engineer' | 'creative' | 'production',
    noveltyScore: number,
  ): 'keep' | 'discard' | 'surprise' {
    // Guard 失败 → 始终 discard
    if (!verification.guard.passed) return 'discard';

    const hasMetricImprovement = Object.values(
      verification.metric.improved,
    ).some(v => v);

    switch (orientation) {
      case 'engineer':
        // 保守：必须通过所有检查且指标不退步
        return hasMetricImprovement || verification.overall === 'pass'
          ? 'keep'
          : 'discard';

      case 'creative': {
        // 发散：任何有趣信号都保留
        if (hasMetricImprovement) return 'keep';
        if (noveltyScore > 0.5) return 'surprise';
        return 'discard';
      }

      case 'production':
        // 渐进：必须通过且指标改善且无新问题
        if (!hasMetricImprovement) return 'discard';
        if (verification.quality.warnings.some(w => w.severity === 'error')) {
          return 'discard';
        }
        return 'keep';
    }
  }

  // ── Layer implementations ──

  private async runGuard(): Promise<LayerResult> {
    const start = Date.now();
    try {
      // 在运行时环境中，guard 命令由外部执行器运行
      // 这里仅返回占位结果，实际执行在 Cerebellum 编排器中
      return {
        passed: true,
        duration: Date.now() - start,
        output: 'guard evaluation delegated to executor',
      };
    } catch (error) {
      return {
        passed: false,
        duration: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async measureMetrics(
    previousBest: Record<string, number | null>,
  ): Promise<MetricLayerResult> {
    const start = Date.now();
    const values: Record<string, MetricValue> = {};
    const improved: Record<string, boolean> = {};

    for (const metric of this.metrics) {
      // 占位 — 实际测量值由外部执行器提供
      const currentValue = previousBest[metric.name] ?? null;
      const prev = previousBest[metric.name] ?? null;

      values[metric.name] = {
        name: metric.name,
        value: currentValue ?? 0,
        previousBest: prev,
        direction: metric.direction,
        delta: prev !== null && currentValue !== null
          ? currentValue - prev
          : null,
      };

      improved[metric.name] = prev !== null && currentValue !== null
        ? metric.direction === 'lower'
          ? currentValue < prev
          : currentValue > prev
        : true;
    }

    return {
      passed: Object.values(improved).some(v => v),
      duration: Date.now() - start,
      values,
      improved,
    };
  }

  private async runQualityChecks(): Promise<QualityLayerResult> {
    const start = Date.now();
    const warnings: QualityWarning[] = [];

    // 基本质量检查占位
    return {
      passed: warnings.filter(w => w.severity === 'error').length === 0,
      duration: Date.now() - start,
      warnings,
      summary: `${warnings.length} quality warnings`,
    };
  }

  /**
   * 用外部测量结果更新 metric 层
   */
  updateMetricValues(
    base: VerificationResult,
    measuredValues: Record<string, number>,
    previousBest: Record<string, number | null>,
  ): VerificationResult {
    const values: Record<string, MetricValue> = {};
    const improved: Record<string, boolean> = {};

    for (const metric of this.metrics) {
      const current = measuredValues[metric.name];
      const prev = previousBest[metric.name];

      values[metric.name] = {
        name: metric.name,
        value: current,
        previousBest: prev,
        direction: metric.direction,
        delta: prev !== null ? current - prev : null,
      };

      improved[metric.name] = prev !== null
        ? metric.direction === 'lower'
          ? current < prev
          : current > prev
        : true;
    }

    const metricLayer: MetricLayerResult = {
      passed: Object.values(improved).some(v => v),
      duration: base.metric.duration,
      values,
      improved,
    };

    return {
      ...base,
      metric: metricLayer,
      overall: this.computeOverall(base.syntax, base.guard, metricLayer, base.quality),
    };
  }

  // ── Helpers ──

  private buildResult(
    syntax: LayerResult,
    guard: LayerResult,
    metric: MetricLayerResult,
    quality: QualityLayerResult,
    startTime: number,
  ): VerificationResult {
    return {
      syntax,
      guard,
      metric,
      quality,
      overall: this.computeOverall(syntax, guard, metric, quality),
      totalDuration: Date.now() - startTime,
    };
  }

  private computeOverall(
    syntax: LayerResult,
    guard: LayerResult,
    metric: MetricLayerResult,
    quality: QualityLayerResult,
  ): 'pass' | 'fail' | 'warning' {
    if (!syntax.passed || !guard.passed) return 'fail';
    if (quality.warnings.some(w => w.severity === 'error')) return 'warning';
    if (!metric.passed) return 'warning';
    return 'pass';
  }

  private passLayer(note: string): LayerResult {
    return { passed: true, duration: 0, output: note };
  }

  private failLayer(reason: string): LayerResult {
    return { passed: false, duration: 0, error: reason };
  }

  private emptyMetricLayer(): MetricLayerResult {
    return { passed: true, duration: 0, values: {}, improved: {} };
  }

  private emptyQualityLayer(): QualityLayerResult {
    return { passed: true, duration: 0, warnings: [], summary: 'skipped' };
  }
}
