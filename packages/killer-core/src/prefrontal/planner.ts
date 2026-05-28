/**
 * Prefrontal Cortex - 规划器
 *
 * 将目标分解为可执行的计划步骤。
 * 支持规则分解（零依赖回退）和 LLM 智能分解。
 */

import type {
  Goal,
  Plan,
  PlanStep,
  PlanStrategy,
  StepResult,
} from './types.js';

/**
 * LLM 接口 — 仅需要 complete()
 */
interface PlannerLLM {
  complete(prompt: string): Promise<{ content: string }>;
}

/**
 * 生成唯一 ID
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 推断规划策略
 */
function inferStrategy(description: string): PlanStrategy {
  const lowerDesc = description.toLowerCase();

  if (lowerDesc.includes('research') || lowerDesc.includes('explore') || lowerDesc.includes('investigate')) {
    return 'exploratory';
  }

  if (lowerDesc.includes('build') || lowerDesc.includes('create') || lowerDesc.includes('implement')) {
    return 'sequential';
  }

  if (lowerDesc.includes('parallel') || lowerDesc.includes('concurrent')) {
    return 'parallel';
  }

  return 'adaptive';
}

/**
 * 将目标描述分解为步骤（规则回退）
 */
function decomposeGoalByRules(description: string): string[] {
  const steps: string[] = [];

  // 尝试按 "→" 分割
  const arrowSplit = description.split('→');
  if (arrowSplit.length > 1) {
    return arrowSplit.map((s, i) => `${i + 1}. ${s.trim()}`);
  }

  // 尝试按编号列表分割
  const numberedMatches = description.match(/\d+\.\s+[^.!?]+/g);
  if (numberedMatches && numberedMatches.length > 1) {
    return numberedMatches;
  }

  // 尝试按句子分割
  const sentences = description.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length > 1) {
    return sentences.map((s, i) => `${i + 1}. ${s.trim()}`);
  }

  // 默认：返回单个步骤
  return [`1. ${description}`];
}

/**
 * 用 LLM 分解目标为可执行步骤
 */
async function decomposeGoalByLLM(
  llm: PlannerLLM,
  goalDescription: string,
): Promise<string[]> {
  const prompt = `You are a task planner. Break down this goal into 2-6 concrete, executable steps.
Each step should be a specific action that can be performed using tools (code execution, file read/write, web search, etc.).

Goal: "${goalDescription}"

Respond with ONLY the steps, one per line, numbered. No explanations. No markdown. No extra text.
Example format:
1. Search for existing implementations of X
2. Read the current module structure
3. Implement the core logic
4. Write tests
5. Run build to verify`;

  try {
    const response = await llm.complete(prompt);
    const lines = response.content
      .split('\n')
      .map(l => l.trim())
      .filter(l => /^\d+[\.\)]\s/.test(l) && l.length > 3);

    if (lines.length >= 2) {
      return lines;
    }

    // LLM 输出格式不对，尝试按行分割
    const anyLines = response.content
      .split('\n')
      .map(l => l.replace(/^[\d\.\)\-\*]+\s*/, '').trim())
      .filter(l => l.length > 5 && l.length < 200);

    if (anyLines.length >= 2) {
      return anyLines.map((s, i) => `${i + 1}. ${s}`);
    }
  } catch {
    // LLM 调用失败，回退到规则分解
  }

  return decomposeGoalByRules(goalDescription);
}

/**
 * 规划器
 *
 * 负责将目标分解为可执行的步骤
 */
export class Planner {
  private readonly llm: PlannerLLM | null;

  constructor(llm?: PlannerLLM) {
    this.llm = llm ?? null;
  }

  /**
   * 创建计划 — 使用 LLM 智能分解（如果可用）或规则回退
   */
  async createPlan(goal: Goal): Promise<Plan> {
    const stepDescriptions = this.llm
      ? await decomposeGoalByLLM(this.llm, goal.description)
      : decomposeGoalByRules(goal.description);
    const strategy = inferStrategy(goal.description);

    const steps: PlanStep[] = stepDescriptions.map((desc, index) => ({
      id: generateId('step'),
      description: desc,
      order: index,
      dependencies: index > 0 ? [generateId('step')] : [],
      status: index === 0 ? 'ready' : 'blocked',
    }));

    // 修正依赖关系
    for (let i = 1; i < steps.length; i++) {
      steps[i].dependencies = [steps[i - 1].id];
    }

    return {
      id: generateId('plan'),
      goalId: goal.id,
      steps,
      strategy,
      estimatedDuration: this.estimateDuration(steps, strategy),
      createdAt: Date.now(),
    };
  }

  /**
   * 重新规划
   */
  replan(plan: Plan, failedStepId: string): Plan {
    const failedStepIndex = plan.steps.findIndex(s => s.id === failedStepId);
    if (failedStepIndex === -1) {
      return plan;
    }

    const failedStep = plan.steps[failedStepIndex];

    // 创建替代步骤
    const alternativeStep: PlanStep = {
      id: generateId('step'),
      description: `Alternative approach for: ${failedStep.description}`,
      order: failedStep.order,
      dependencies: failedStep.dependencies,
      status: 'ready',
    };

    const newSteps = [...plan.steps];
    newSteps[failedStepIndex] = alternativeStep;

    // 标记后续步骤为 blocked
    for (let i = failedStepIndex + 1; i < newSteps.length; i++) {
      newSteps[i].status = 'blocked';
      // 更新依赖
      const depIndex = newSteps[i].dependencies.indexOf(failedStepId);
      if (depIndex !== -1) {
        newSteps[i].dependencies[depIndex] = alternativeStep.id;
      }
    }

    return {
      ...plan,
      steps: newSteps,
    };
  }

  /**
   * 获取就绪的步骤
   */
  getReadySteps(plan: Plan): PlanStep[] {
    return plan.steps.filter(step => {
      if (step.status !== 'ready') {
        return false;
      }

      // 检查所有依赖是否完成或已跳过（跳过的步骤视为可继续）
      for (const depId of step.dependencies) {
        const depStep = plan.steps.find(s => s.id === depId);
        if (!depStep || (depStep.status !== 'completed' && depStep.status !== 'skipped')) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * 更新步骤状态
   */
  updateStepStatus(
    plan: Plan,
    stepId: string,
    status: PlanStep['status'],
    result?: StepResult
  ): Plan {
    const stepIndex = plan.steps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) {
      return plan;
    }

    const newSteps = [...plan.steps];
    newSteps[stepIndex] = {
      ...newSteps[stepIndex],
      status,
      result,
    };

    // 如果步骤完成或跳过，解锁后续步骤
    if (status === 'completed' || status === 'skipped') {
      for (let i = stepIndex + 1; i < newSteps.length; i++) {
        if (newSteps[i].dependencies.includes(stepId) && this.allDepsCompleted(newSteps[i], newSteps)) {
          newSteps[i].status = 'ready';
        }
      }
    }

    return {
      ...plan,
      steps: newSteps,
    };
  }

  /**
   * 估算执行时长
   */
  private estimateDuration(steps: PlanStep[], strategy: PlanStrategy): number {
    const baseTime = steps.length * 5 * 60 * 1000; // 每步骤 5 分钟

    switch (strategy) {
      case 'parallel':
        return baseTime / Math.max(1, steps.length / 2);
      case 'sequential':
        return baseTime;
      case 'adaptive':
        return baseTime * 1.2;
      case 'exploratory':
        return baseTime * 1.5;
      default:
        return baseTime;
    }
  }

  /**
   * 检查所有依赖是否完成
   */
  private allDepsCompleted(step: PlanStep, allSteps: PlanStep[]): boolean {
    return step.dependencies.every(depId => {
      const depStep = allSteps.find(s => s.id === depId);
      return depStep?.status === 'completed' || depStep?.status === 'skipped';
    });
  }
}
