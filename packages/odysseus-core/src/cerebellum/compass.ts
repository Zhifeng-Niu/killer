/**
 * Compass - 策略指南针
 *
 * 根据任务导向和尝试历史，推荐下一步实验策略。
 * 三种模式：engineer (保守) / creative (发散) / production (渐进)
 */

import type {
  AttemptHistory,
  CompassReading,
  Orientation,
  StrategyHint,
  StrategyPattern,
} from './types.js';

/**
 * 每种 orientation 的默认策略参数
 */
const ORIENTATION_DEFAULTS: Record<
  Orientation,
  { scope: StrategyHint['scope']; riskTolerance: number }
> = {
  engineer: { scope: 'small', riskTolerance: 0.2 },
  creative: { scope: 'large', riskTolerance: 0.8 },
  production: { scope: 'small', riskTolerance: 0.1 },
};

/**
 * 策略指南针 — 选择下一次实验的最佳方法
 */
export class Compass {
  /**
   * 读取当前策略状态
   */
  read(
    orientation: Orientation,
    history: AttemptHistory,
    proposedHypothesis: string,
  ): CompassReading {
    const divergence = this.calculateDivergence(history, proposedHypothesis);
    const stuckLevel = history.consecutiveDiscards;

    const strategy = this.selectStrategy(
      orientation,
      stuckLevel,
      divergence,
      history,
    );

    return {
      orientation,
      divergence,
      stuckLevel,
      recommendedStrategy: strategy,
      noveltyScore: divergence,
    };
  }

  /**
   * 为给定 orientation 和历史选择策略
   */
  private selectStrategy(
    orientation: Orientation,
    stuckLevel: number,
    divergence: number,
    history: AttemptHistory,
  ): StrategyHint {
    const defaults = ORIENTATION_DEFAULTS[orientation];

    // 创意模式下随机游走 (1/5 概率)
    if (orientation === 'creative' && Math.random() < 0.2) {
      return {
        scope: 'medium',
        riskTolerance: 0.9,
        forceDivergence: true,
        pattern: 'random_walk',
      };
    }

    // 卡住时的恢复策略
    if (stuckLevel >= 5) {
      return this.stuckRecoveryStrategy(orientation, history);
    }

    // 创意模式下强制发散
    const forceDivergence =
      orientation === 'creative' && divergence < 0.3 && history.totalWaypoints >= 3;

    const pattern = this.selectPattern(
      orientation,
      stuckLevel,
      divergence,
      history,
    );

    return {
      scope: forceDivergence ? 'large' : defaults.scope,
      riskTolerance: defaults.riskTolerance,
      forceDivergence,
      pattern,
    };
  }

  /**
   * 选择策略模式
   */
  private selectPattern(
    orientation: Orientation,
    stuckLevel: number,
    divergence: number,
    history: AttemptHistory,
  ): StrategyPattern {
    switch (orientation) {
      case 'engineer':
        return 'hypothesis_driven';

      case 'creative': {
        // 低发散时强制跨域或反向思考
        if (divergence < 0.3) {
          return history.deadEnds.length > 3
            ? 'inversion'
            : 'cross_pollination';
        }
        return 'hypothesis_driven';
      }

      case 'production':
        return 'progressive_minimal';
    }
  }

  /**
   * 卡住时的恢复策略
   */
  private stuckRecoveryStrategy(
    orientation: Orientation,
    history: AttemptHistory,
  ): StrategyHint {
    // 分析失败模式
    const recentDeadEnds = history.deadEnds.slice(-5);
    const samePattern = recentDeadEnds.length >= 3;

    if (orientation === 'creative' || samePattern) {
      // 创意模式或重复失败时，移除一个约束
      return {
        scope: 'large',
        riskTolerance: 0.9,
        forceDivergence: true,
        pattern: 'constraint_removal',
      };
    }

    // 工程和生产模式，尝试反向思考
    return {
      scope: 'medium',
      riskTolerance: 0.5,
      forceDivergence: true,
      pattern: 'inversion',
    };
  }

  /**
   * 计算与最近实验的发散度
   */
  private calculateDivergence(
    history: AttemptHistory,
    hypothesis: string,
  ): number {
    const recent = [
      ...history.wins.slice(-3),
      ...history.deadEnds.slice(-3),
    ].slice(-3);

    if (recent.length === 0) return 1.0;

    const similarities = recent.map(r =>
      this.textSimilarity(r.hypothesis, hypothesis),
    );
    const avg = similarities.reduce((a, b) => a + b, 0) / similarities.length;
    return 1 - avg;
  }

  /**
   * Jaccard 词集合相似度
   */
  private textSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = [...wordsA].filter(w => wordsB.has(w));
    const union = new Set([...wordsA, ...wordsB]);
    return union.size === 0 ? 0 : intersection.length / union.size;
  }
}
