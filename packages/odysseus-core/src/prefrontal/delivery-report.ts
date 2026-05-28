/**
 * Prefrontal Cortex - 执行报告与交付系统
 *
 * 长程任务完成后自动生成结构化交付报告。
 * 包含：完成步骤、跳过步骤、关键决策、代码变更摘要、质量评分。
 */

/** 步骤报告 */
export interface StepReport {
  stepId: string;
  description: string;
  order: number;
  status: 'completed' | 'failed' | 'skipped';
  durationMs?: number;
  score?: number;
  output?: string;
  error?: string;
}

/** 交付报告 */
export interface DeliveryReport {
  /** 任务 ID */
  taskId: string;
  /** 目标描述 */
  goal: string;
  /** 报告生成时间 */
  generatedAt: number;
  /** 总耗时 */
  totalDurationMs: number;
  /** 步骤摘要 */
  steps: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
  };
  /** 逐步报告 */
  stepDetails: StepReport[];
  /** 关键决策记录 */
  keyDecisions: string[];
  /** 代码变更摘要 */
  codeChanges: string[];
  /** 整体质量评分 */
  qualityScore: number;
  /** 交付状态 */
  deliveryStatus: 'complete' | 'partial' | 'failed';
  /** 建议（如有未完成工作） */
  recommendations: string[];
}

/** 报告生成器依赖 */
export interface DeliveryReportDeps {
  getGoal: (taskId: string) => string | undefined;
  getStepReports: (taskId: string) => StepReport[];
  getElapsedTime: (taskId: string) => number;
  getKeyDecisions: () => string[];
  getCodeChanges: () => string[];
}

/**
 * 执行报告生成器
 *
 * 从 LongTaskEngine、StepVerifier、ContextWindowManager 等收集数据，
 * 生成结构化交付报告，通过 consciousness 事件流输出。
 */
export class DeliveryReportGenerator {
  private readonly decisions: string[] = [];
  private readonly codeChanges: string[] = [];

  /** 记录关键决策 */
  recordDecision(decision: string): void {
    this.decisions.push(decision);
    if (this.decisions.length > 100) this.decisions.shift();
  }

  /** 记录代码变更 */
  recordCodeChange(change: string): void {
    this.codeChanges.push(change);
    if (this.codeChanges.length > 50) this.codeChanges.shift();
  }

  /**
   * 生成交付报告
   */
  generate(taskId: string, deps: DeliveryReportDeps): DeliveryReport {
    const goal = deps.getGoal(taskId) ?? 'Unknown task';
    const stepDetails = deps.getStepReports(taskId);
    const elapsedMs = deps.getElapsedTime(taskId);

    const completed = stepDetails.filter(s => s.status === 'completed').length;
    const failed = stepDetails.filter(s => s.status === 'failed').length;
    const skipped = stepDetails.filter(s => s.status === 'skipped').length;
    const total = stepDetails.length;

    const qualityScore = this.calculateQualityScore(stepDetails);

    const deliveryStatus: DeliveryReport['deliveryStatus'] =
      completed === total && failed === 0 ? 'complete'
        : completed > 0 ? 'partial'
          : 'failed';

    const recommendations = this.generateRecommendations(stepDetails, deliveryStatus);

    return {
      taskId,
      goal,
      generatedAt: Date.now(),
      totalDurationMs: elapsedMs,
      steps: { total, completed, failed, skipped },
      stepDetails,
      keyDecisions: [...this.decisions].slice(-20),
      codeChanges: [...this.codeChanges].slice(-15),
      qualityScore,
      deliveryStatus,
      recommendations,
    };
  }

  /**
   * 格式化为可读文本
   */
  formatReport(report: DeliveryReport): string {
    const lines: string[] = [
      `## Delivery Report: ${report.goal.slice(0, 80)}`,
      '',
      `**Status**: ${report.deliveryStatus} | **Quality**: ${(report.qualityScore * 100).toFixed(0)}% | **Duration**: ${this.formatDuration(report.totalDurationMs)}`,
      '',
      `### Steps: ${report.steps.completed}/${report.steps.total} completed, ${report.steps.failed} failed, ${report.steps.skipped} skipped`,
      '',
    ];

    // 步骤详情
    for (const step of report.stepDetails) {
      const icon = step.status === 'completed' ? '+' : step.status === 'failed' ? 'x' : '-';
      const scoreStr = step.score !== undefined ? ` (${(step.score * 100).toFixed(0)}%)` : '';
      lines.push(`  [${icon}] Step ${step.order + 1}: ${step.description.slice(0, 60)}${scoreStr}`);
      if (step.error) {
        lines.push(`      Error: ${step.error.slice(0, 100)}`);
      }
    }

    // 关键决策
    if (report.keyDecisions.length > 0) {
      lines.push('', '### Key Decisions');
      for (const decision of report.keyDecisions.slice(-10)) {
        lines.push(`  - ${decision.slice(0, 100)}`);
      }
    }

    // 代码变更
    if (report.codeChanges.length > 0) {
      lines.push('', '### Code Changes');
      for (const change of report.codeChanges.slice(-8)) {
        lines.push(`  - ${change.slice(0, 100)}`);
      }
    }

    // 建议
    if (report.recommendations.length > 0) {
      lines.push('', '### Recommendations');
      for (const rec of report.recommendations) {
        lines.push(`  - ${rec}`);
      }
    }

    return lines.join('\n');
  }

  private calculateQualityScore(steps: StepReport[]): number {
    if (steps.length === 0) return 0;

    const completedSteps = steps.filter(s => s.status === 'completed');
    if (completedSteps.length === 0) return 0;

    const completionRatio = completedSteps.length / steps.length;
    const avgScore = completedSteps
      .filter(s => s.score !== undefined)
      .reduce((sum, s) => sum + (s.score ?? 0), 0) / Math.max(1, completedSteps.filter(s => s.score !== undefined).length);

    return completionRatio * 0.6 + avgScore * 0.4;
  }

  private generateRecommendations(
    steps: StepReport[],
    status: DeliveryReport['deliveryStatus'],
  ): string[] {
    const recs: string[] = [];

    if (status === 'partial') {
      const failedSteps = steps.filter(s => s.status === 'failed');
      if (failedSteps.length > 0) {
        recs.push(`Review ${failedSteps.length} failed steps: ${failedSteps.map(s => s.description.slice(0, 30)).join(', ')}`);
      }
    }

    if (status === 'failed') {
      recs.push('Task failed — consider decomposing into smaller subtasks');
      recs.push('Check error logs for root cause analysis');
    }

    const lowScoreSteps = steps.filter(s => s.status === 'completed' && (s.score ?? 0) < 0.5);
    if (lowScoreSteps.length > 0) {
      recs.push(`${lowScoreSteps.length} steps passed with low quality — consider revisiting`);
    }

    return recs;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}min`;
    return `${(ms / 3_600_000).toFixed(1)}h`;
  }
}
