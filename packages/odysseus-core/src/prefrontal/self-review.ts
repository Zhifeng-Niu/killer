/**
 * Prefrontal Cortex - 自审查引擎
 *
 * 执行 → 审查 → 修正 → 再验证 循环。
 * 每个 plan step 执行后进行质量审查，不通过则自动修正。
 */

import type { PlanStep, StepResult } from './types.js';

/**
 * 审查维度
 */
export type ReviewDimension =
  | 'correctness'
  | 'completeness'
  | 'consistency'
  | 'efficiency';

/**
 * 审查结果
 */
export interface ReviewResult {
  /** 是否通过 */
  passed: boolean;
  /** 总分 (0-1) */
  score: number;
  /** 各维度评分 */
  dimensions: Record<ReviewDimension, number>;
  /** 发现的问题 */
  issues: string[];
  /** 修正建议 */
  suggestions: string[];
  /** 是否建议重试 */
  shouldRetry: boolean;
}

/**
 * 审查上下文
 */
export interface ReviewContext {
  /** 步骤描述 */
  stepDescription: string;
  /** 执行结果 */
  result: StepResult;
  /** 前序步骤结果（用于一致性检查） */
  previousResults: Array<{ description: string; result: StepResult }>;
  /** 期望输出描述（如果有） */
  expectedOutput?: string;
}

/**
 * 自审查配置
 */
export interface SelfReviewConfig {
  /** 通过阈值 (0-1) */
  passThreshold: number;
  /** 最大修正轮次 */
  maxCorrectionRounds: number;
  /** 各维度权重 */
  dimensionWeights: Record<ReviewDimension, number>;
}

const DEFAULT_CONFIG: SelfReviewConfig = {
  passThreshold: 0.5,
  maxCorrectionRounds: 2,
  dimensionWeights: {
    correctness: 0.35,
    completeness: 0.25,
    consistency: 0.2,
    efficiency: 0.2,
  },
};

/**
 * 自审查引擎
 *
 * 在每个 plan step 执行后进行多维度质量审查：
 * - correctness: 结果是否正确（成功且无错误信号）
 * - completeness: 结果是否完整（非空、有实质内容）
 * - consistency: 与前序步骤是否一致（不矛盾）
 * - efficiency: 执行效率（时长合理）
 */
export class SelfReviewer {
  private readonly config: SelfReviewConfig;

  constructor(config?: Partial<SelfReviewConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 审查步骤执行结果
   */
  review(ctx: ReviewContext): ReviewResult {
    const dimensions: Record<ReviewDimension, number> = {
      correctness: this.scoreCorrectness(ctx),
      completeness: this.scoreCompleteness(ctx),
      consistency: this.scoreConsistency(ctx),
      efficiency: this.scoreEfficiency(ctx),
    };

    const score = this.weightedScore(dimensions);
    const issues = this.collectIssues(ctx, dimensions);
    const passed = score >= this.config.passThreshold && issues.length === 0;

    return {
      passed,
      score,
      dimensions,
      issues,
      suggestions: this.generateSuggestions(ctx, issues),
      shouldRetry: !passed && this.canRetry(ctx),
    };
  }

  /**
   * 执行自审查循环：审查 → 修正建议 → 重试
   *
   * 返回最终审查结果和修正轮次数。
   */
  reviewLoop(
    ctx: ReviewContext,
    executor: (step: PlanStep, correctionHints: string[]) => Promise<StepResult>,
    step: PlanStep,
  ): Promise<{ review: ReviewResult; corrections: number }> {
    let corrections = 0;
    let currentCtx = ctx;

    const review = this.review(currentCtx);

    if (review.passed || !review.shouldRetry) {
      return Promise.resolve({ review, corrections });
    }

    // 修正循环
    const loop = async (): Promise<{ review: ReviewResult; corrections: number }> => {
      while (corrections < this.config.maxCorrectionRounds) {
        corrections++;
        const correctedResult = await executor(step, review.suggestions);

        currentCtx = {
          ...currentCtx,
          result: correctedResult,
        };

        const newReview = this.review(currentCtx);
        if (newReview.passed || !newReview.shouldRetry) {
          return { review: newReview, corrections };
        }
      }

      // 超过最大修正轮次，返回最后一次审查
      return { review: this.review(currentCtx), corrections };
    };

    return loop();
  }

  // ─── 维度评分 ───

  private scoreCorrectness(ctx: ReviewContext): number {
    if (!ctx.result.success) return 0;
    if (ctx.result.error) return 0.2;
    return 1.0;
  }

  private scoreCompleteness(ctx: ReviewContext): number {
    if (ctx.result.output === undefined || ctx.result.output === null) return 0.2;

    const output = String(ctx.result.output);
    if (output.length === 0) return 0.1;
    if (output.length < 20) return 0.4;
    if (output.length < 100) return 0.7;
    return 1.0;
  }

  private scoreConsistency(ctx: ReviewContext): number {
    if (ctx.previousResults.length === 0) return 1.0;

    // 检查是否有矛盾信号（error 后跟 success 但无解释）
    const lastResult = ctx.previousResults[ctx.previousResults.length - 1];
    if (!lastResult.result.success && ctx.result.success) {
      // 从失败恢复到成功是好事，不扣分
      return 1.0;
    }

    // 如果步骤描述包含 "verify" 或 "check" 但结果没有实质内容
    const isVerification = /verify|check|validate|confirm/i.test(ctx.stepDescription);
    if (isVerification && ctx.result.success && !ctx.result.output) {
      return 0.4;
    }

    return 1.0;
  }

  private scoreEfficiency(ctx: ReviewContext): number {
    // 基于执行时长的启发式评分
    const duration = Date.now() - ctx.result.completedAt;
    if (duration < 0) return 1.0; // completedAt 在未来？忽略

    // 超过 5 分钟的步骤效率较低
    if (duration > 5 * 60 * 1000) return 0.4;
    if (duration > 2 * 60 * 1000) return 0.7;
    return 1.0;
  }

  // ─── 辅助方法 ───

  private weightedScore(dimensions: Record<ReviewDimension, number>): number {
    let total = 0;
    for (const [dim, score] of Object.entries(dimensions)) {
      total += score * (this.config.dimensionWeights[dim as ReviewDimension] ?? 0.25);
    }
    return total;
  }

  private collectIssues(ctx: ReviewContext, dimensions: Record<ReviewDimension, number>): string[] {
    const issues: string[] = [];

    if (!ctx.result.success) {
      issues.push(`Step failed: ${ctx.result.error ?? 'unknown error'}`);
    }

    if (dimensions.correctness < 0.5) {
      issues.push('Result correctness is low');
    }

    if (dimensions.completeness < 0.5) {
      issues.push('Result is incomplete or too short');
    }

    if (dimensions.consistency < 0.5) {
      issues.push('Result is inconsistent with previous steps');
    }

    return issues;
  }

  private generateSuggestions(ctx: ReviewContext, issues: string[]): string[] {
    const suggestions: string[] = [];

    if (!ctx.result.success) {
      suggestions.push('Check error cause and try alternative approach');
    }

    if (ctx.result.output === undefined || String(ctx.result.output).length < 20) {
      suggestions.push('Provide more detailed output with specific results');
    }

    const isVerification = /verify|check|validate/i.test(ctx.stepDescription);
    if (isVerification && issues.length > 0) {
      suggestions.push('Verification step should produce clear pass/fail evidence');
    }

    return suggestions;
  }

  private canRetry(ctx: ReviewContext): boolean {
    // 只有执行失败或结果不完整时才建议重试
    return !ctx.result.success ||
      ctx.result.output === undefined ||
      String(ctx.result.output).length < 20;
  }
}
