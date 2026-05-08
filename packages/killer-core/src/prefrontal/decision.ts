/**
 * Prefrontal Cortex - 决策引擎
 *
 * 根据计划、风险评估和上下文做出决策
 */

import type {
  Plan,
  PlanStep,
  Decision,
  Alternative,
  RiskAssessment,
  PrefrontalConfig,
} from './types.js';
import { DEFAULT_PREFRONTAL_CONFIG } from './types.js';
import { RiskAssessor } from './risk.js';

/**
 * 决策上下文
 */
interface DecisionContext {
  /** 最近成功率 */
  recentSuccessRate: number;
  /** 活跃目标数量 */
  activeGoals: number;
  /** 可用资源 */
  availableResources?: string[];
}

/**
 * 生成唯一 ID
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 决策引擎
 *
 * 负责选择下一步行动并生成决策
 */
export class DecisionEngine {
  private readonly riskAssessor: RiskAssessor;
  private readonly config: PrefrontalConfig;

  /** 决策历史 */
  private readonly decisionHistory: Decision[];

  constructor(
    riskAssessor: RiskAssessor,
    config: PrefrontalConfig = DEFAULT_PREFRONTAL_CONFIG
  ) {
    this.riskAssessor = riskAssessor;
    this.config = config;
    this.decisionHistory = [];
  }

  /**
   * 做出决策
   */
  decide(plan: Plan, context: DecisionContext): Decision {
    // 1. 获取就绪步骤
    const readySteps = plan.steps.filter(
      step => step.status === 'ready' && this.dependenciesMet(step, plan)
    );

    if (readySteps.length === 0) {
      throw new Error('No ready steps available for decision');
    }

    // 2. 选择优先级最高的步骤
    const chosenStep = this.selectHighestPriorityStep(readySteps);

    // 3. 评估风险
    const riskAssessment = this.assessStepRisk(chosenStep);

    // 4. 生成替代方案
    const alternatives = this.generateAlternatives(chosenStep, readySteps, riskAssessment);

    // 5. 生成推理过程
    const reasoning = this.generateReasoning(
      chosenStep,
      riskAssessment,
      alternatives,
      context
    );

    // 6. 计算置信度
    const confidence = this.calculateConfidence(riskAssessment, context);

    // 7. 检查是否超过风险容忍度
    const shouldProceed = this.shouldProceedWithRisk(
      riskAssessment,
      plan.strategy,
      reasoning
    );

    const decision: Decision = {
      id: generateId('decision'),
      planId: plan.id,
      chosenStep,
      reasoning: shouldProceed
        ? reasoning
        : `${reasoning}\n\nWARNING: Risk exceeds tolerance but proceeding (exploratory strategy).`,
      confidence,
      riskAssessment,
      alternatives,
      decidedAt: Date.now(),
    };

    // 记录决策历史
    this.decisionHistory.push(decision);

    return decision;
  }

  /**
   * 选择优先级最高的步骤
   */
  private selectHighestPriorityStep(steps: PlanStep[]): PlanStep {
    // 按顺序排序，优先执行较早的步骤
    return steps.sort((a, b) => a.order - b.order)[0];
  }

  /**
   * 检查步骤依赖是否满足
   */
  private dependenciesMet(step: PlanStep, plan: Plan): boolean {
    for (const depId of step.dependencies) {
      const depStep = plan.steps.find(s => s.id === depId);
      if (!depStep || depStep.status !== 'completed') {
        return false;
      }
    }
    return true;
  }

  /**
   * 评估步骤风险
   */
  private assessStepRisk(step: PlanStep): RiskAssessment {
    const actionType = step.action?.type ?? 'default';
    return this.riskAssessor.assess({ type: actionType, payload: step.action?.payload });
  }

  /**
   * 生成替代方案
   */
  private generateAlternatives(
    chosenStep: PlanStep,
    readySteps: PlanStep[],
    riskAssessment: RiskAssessment
  ): Alternative[] {
    const alternatives: Alternative[] = [];

    // 如果风险较高，生成低风险替代方案
    if (riskAssessment.overallScore > this.config.riskTolerance) {
      // 替代方案 1：跳过此步骤
      alternatives.push({
        stepId: chosenStep.id,
        description: `Skip "${chosenStep.description}" and proceed with dependent steps`,
        expectedOutcome: 'May cause issues in dependent steps',
        riskLevel: 'low',
      });

      // 替代方案 2：寻找其他就绪步骤
      const otherSteps = readySteps.filter(s => s.id !== chosenStep.id);
      if (otherSteps.length > 0) {
        const saferStep = otherSteps[0];
        alternatives.push({
          stepId: saferStep.id,
          description: `Execute "${saferStep.description}" instead`,
          expectedOutcome: 'Progress on alternative path',
          riskLevel: 'moderate',
        });
      }
    }

    return alternatives;
  }

  /**
   * 生成推理过程
   */
  private generateReasoning(
    step: PlanStep,
    riskAssessment: RiskAssessment,
    alternatives: Alternative[],
    context: DecisionContext
  ): string {
    const parts: string[] = [];

    parts.push(`Selected step: "${step.description}" (order ${step.order})`);
    parts.push(`Risk assessment: ${riskAssessment.level} (${riskAssessment.overallScore.toFixed(2)})`);

    if (riskAssessment.factors.length > 0) {
      parts.push('Key risk factors:');
      for (const factor of riskAssessment.factors) {
        parts.push(
          `  - ${factor.name}: ${(factor.probability * factor.impact * 100).toFixed(0)}% impact`
        );
      }
    }

    parts.push(`Context: ${context.activeGoals} active goals, ${context.recentSuccessRate.toFixed(0)}% recent success rate`);

    if (alternatives.length > 0) {
      parts.push(`Alternatives considered: ${alternatives.length}`);
    }

    return parts.join('\n');
  }

  /**
   * 计算决策置信度
   */
  private calculateConfidence(
    riskAssessment: RiskAssessment,
    context: DecisionContext
  ): number {
    // 基础置信度：1 - 风险分数的一半
    const riskComponent = 1 - riskAssessment.overallScore * 0.5;

    // 成功率加成
    const successComponent = context.recentSuccessRate * 0.3;

    // 活跃目标惩罚（目标太多会分散注意力）
    const goalPenalty = Math.min(0.2, context.activeGoals * 0.02);

    return Math.max(0, Math.min(1, riskComponent + successComponent - goalPenalty));
  }

  /**
   * 判断是否应该在风险超过容忍度时继续
   */
  private shouldProceedWithRisk(
    riskAssessment: RiskAssessment,
    strategy: string,
    reasoning: string
  ): boolean {
    // AGI 不设限：探索性策略下，即使风险高也继续执行
    if (strategy === 'exploratory') {
      return true;
    }

    return riskAssessment.overallScore <= this.config.riskTolerance;
  }

  /**
   * 获取决策历史
   */
  getDecisionHistory(limit?: number): Decision[] {
    if (limit) {
      return this.decisionHistory.slice(-limit);
    }
    return [...this.decisionHistory];
  }

  /**
   * 获取决策统计
   */
  getDecisionStats(): {
    total: number;
    byRiskLevel: Record<string, number>;
    averageConfidence: number;
  } {
    if (this.decisionHistory.length === 0) {
      return {
        total: 0,
        byRiskLevel: {},
        averageConfidence: 0,
      };
    }

    const byRiskLevel: Record<string, number> = {};
    let totalConfidence = 0;

    for (const decision of this.decisionHistory) {
      const level = decision.riskAssessment.level;
      byRiskLevel[level] = (byRiskLevel[level] ?? 0) + 1;
      totalConfidence += decision.confidence;
    }

    return {
      total: this.decisionHistory.length,
      byRiskLevel,
      averageConfidence: totalConfidence / this.decisionHistory.length,
    };
  }

  /**
   * 清空决策历史
   */
  clearHistory(): void {
    this.decisionHistory.length = 0;
  }
}
