/**
 * Prefrontal Cortex - 计划执行器
 *
 * 管理计划的提交、执行和状态跟踪
 */

import type { Goal, Plan, PlanStep, StepResult, PrefrontalConfig } from './types.js';
import { DEFAULT_PREFRONTAL_CONFIG } from './types.js';
import { Planner } from './planner.js';

/**
 * 生成唯一 ID
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 计划执行器
 *
 * 负责计划的跟踪和执行管理
 */
export class PlanExecutor {
  private readonly planner: Planner;
  private readonly config: PrefrontalConfig;

  /** 活跃计划存储 */
  private readonly plans: Map<string, Plan>;

  /** 目标到计划的映射 */
  private readonly goalToPlans: Map<string, string>;

  /** 步骤执行历史 */
  private readonly executionHistory: Array<{
    stepId: string;
    planId: string;
    result: StepResult;
    timestamp: number;
  }>;

  /** 步骤重试计数 */
  private readonly stepRetryCount: Map<string, number>;
  private static readonly MAX_STEP_RETRIES = 2;

  constructor(planner: Planner, config: PrefrontalConfig = DEFAULT_PREFRONTAL_CONFIG) {
    this.planner = planner;
    this.config = config;
    this.plans = new Map();
    this.stepRetryCount = new Map();
    this.goalToPlans = new Map();
    this.executionHistory = [];
  }

  /**
   * 提交目标并创建计划
   */
  async submitGoal(goal: Goal): Promise<Plan> {
    // 检查并发计划限制
    if (this.plans.size >= this.config.maxConcurrentPlans) {
      throw new Error(
        `Maximum concurrent plans (${this.config.maxConcurrentPlans}) reached`
      );
    }

    // 检查是否已有该目标的计划
    const existingPlanId = this.goalToPlans.get(goal.id);
    if (existingPlanId) {
      const existingPlan = this.plans.get(existingPlanId);
      if (existingPlan) {
        return existingPlan;
      }
    }

    // 创建新计划
    const plan = await this.planner.createPlan(goal);

    // 存储计划
    this.plans.set(plan.id, plan);
    this.goalToPlans.set(goal.id, plan.id);

    return plan;
  }

  /**
   * 评估计划质量
   */
  scorePlan(planId: string): { score: number; issues: string[] } {
    const plan = this.plans.get(planId);
    if (!plan) {
      return { score: 0, issues: ['Plan not found'] };
    }
    return this.planner.scorePlan(plan);
  }

  /**
   * 获取下一个要执行的行动
   */
  getNextAction(planId: string): PlanStep | null {
    const plan = this.plans.get(planId);
    if (!plan) {
      return null;
    }

    const readySteps = this.planner.getReadySteps(plan);
    if (readySteps.length === 0) {
      return null;
    }

    return readySteps[0];
  }

  /**
   * 获取所有就绪步骤（支持并行调度）
   */
  getReadyActions(planId: string): PlanStep[] {
    const plan = this.plans.get(planId);
    if (!plan) {
      return [];
    }

    return this.planner.getReadySteps(plan);
  }

  /**
   * 获取执行层级（拓扑排序）— 每层可并行
   */
  getExecutionLevels(planId: string): PlanStep[][] {
    const plan = this.plans.get(planId);
    if (!plan) {
      return [];
    }

    return this.planner.getExecutionLevels(plan);
  }

  /**
   * 报告步骤执行结果
   */
  reportStepResult(planId: string, stepId: string, result: StepResult): void {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    if (result.success) {
      this.stepRetryCount.delete(stepId);
      const updatedPlan = this.planner.updateStepStatus(plan, stepId, 'completed', result);
      this.plans.set(planId, updatedPlan);
    } else {
      const retries = (this.stepRetryCount.get(stepId) ?? 0) + 1;
      this.stepRetryCount.set(stepId, retries);

      if (retries < PlanExecutor.MAX_STEP_RETRIES) {
        // 标记为 ready 以便重试
        const updatedPlan = this.planner.updateStepStatus(plan, stepId, 'ready', result);
        this.plans.set(planId, updatedPlan);
      } else {
        // 重试耗尽 — 部分回滚到失败步骤，再尝试 replan
        this.stepRetryCount.delete(stepId);
        let updatedPlan = this.planner.partialRollback(plan, stepId);
        if (updatedPlan.strategy !== 'exploratory') {
          updatedPlan = this.planner.replan(updatedPlan, stepId);
        }
        this.plans.set(planId, updatedPlan);
      }
    }

    // 记录执行历史
    this.executionHistory.push({
      stepId,
      planId,
      result,
      timestamp: Date.now(),
    });

    // 限制历史记录大小
    if (this.executionHistory.length > 1000) {
      this.executionHistory.shift();
    }
  }

  /**
   * 获取活跃计划列表
   */
  getActivePlans(): Plan[] {
    return Array.from(this.plans.values()).filter(plan => {
      const now = Date.now();
      const age = now - plan.createdAt;

      // 检查是否超时
      if (age > this.config.autoAbandonTimeout) {
        return false;
      }

      // 检查是否已完成
      const allCompleted = plan.steps.every(
        step => step.status === 'completed' || step.status === 'skipped'
      );
      const anyFailed = plan.steps.some(step => step.status === 'failed');

      return !(allCompleted || anyFailed);
    });
  }

  /**
   * 获取指定计划
   */
  getPlan(planId: string): Plan | null {
    return this.plans.get(planId) ?? null;
  }

  /**
   * 根据目标获取计划
   */
  getPlanByGoal(goalId: string): Plan | null {
    const planId = this.goalToPlans.get(goalId);
    if (!planId) {
      return null;
    }
    return this.plans.get(planId) ?? null;
  }

  /**
   * 放弃计划
   */
  abandonPlan(planId: string): boolean {
    const plan = this.plans.get(planId);
    if (!plan) {
      return false;
    }

    // 标记所有未完成的步骤为 skipped
    const updatedPlan: Plan = {
      ...plan,
      steps: plan.steps.map(step => {
        if (step.status !== 'completed' && step.status !== 'failed') {
          return { ...step, status: 'skipped' };
        }
        return step;
      }),
    };

    this.plans.set(planId, updatedPlan);

    // 从目标映射中移除
    this.goalToPlans.delete(plan.goalId);

    // 延迟删除计划
    setTimeout(() => {
      this.plans.delete(planId);
    }, 60000); // 1 分钟后删除

    return true;
  }

  /**
   * 获取计划统计
   */
  getStats(): {
    totalPlans: number;
    activePlans: number;
    completedPlans: number;
    failedPlans: number;
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
  } {
    const plans = Array.from(this.plans.values());

    let completedPlans = 0;
    let failedPlans = 0;
    let totalSteps = 0;
    let completedSteps = 0;
    let failedSteps = 0;

    for (const plan of plans) {
      totalSteps += plan.steps.length;
      completedSteps += plan.steps.filter(s => s.status === 'completed').length;
      failedSteps += plan.steps.filter(s => s.status === 'failed').length;

      const allCompleted = plan.steps.every(
        s => s.status === 'completed' || s.status === 'skipped'
      );
      const anyFailed = plan.steps.some(s => s.status === 'failed');

      if (allCompleted) {
        completedPlans++;
      } else if (anyFailed) {
        failedPlans++;
      }
    }

    return {
      totalPlans: plans.length,
      activePlans: this.getActivePlans().length,
      completedPlans,
      failedPlans,
      totalSteps,
      completedSteps,
      failedSteps,
    };
  }

  /**
   * 获取执行历史
   */
  getExecutionHistory(limit: number = 100): Array<{
    stepId: string;
    planId: string;
    result: StepResult;
    timestamp: number;
  }> {
    return this.executionHistory.slice(-limit);
  }

  /**
   * 清空所有计划
   */
  clear(): void {
    this.plans.clear();
    this.goalToPlans.clear();
    this.executionHistory.length = 0;
  }

  /**
   * 导出所有计划数据（用于持久化）
   */
  export(): {
    plans: Array<[string, Plan]>;
    goalToPlans: Array<[string, string]>;
    executionHistory: Array<{ stepId: string; planId: string; result: StepResult; timestamp: number }>;
  } {
    return {
      plans: Array.from(this.plans.entries()),
      goalToPlans: Array.from(this.goalToPlans.entries()),
      executionHistory: [...this.executionHistory],
    };
  }

  /**
   * 导入计划数据（从持久化恢复）
   */
  import(data: ReturnType<PlanExecutor['export']>): void {
    this.plans.clear();
    this.goalToPlans.clear();
    this.executionHistory.length = 0;

    for (const [id, plan] of data.plans) {
      this.plans.set(id, plan);
    }
    for (const [goalId, planId] of data.goalToPlans) {
      this.goalToPlans.set(goalId, planId);
    }
    this.executionHistory.push(...data.executionHistory);
  }
}
