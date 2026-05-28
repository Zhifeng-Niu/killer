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
  // 尝试按 "→" 或 "➜" 分割
  const arrowSplit = description.split(/[→➜]/);
  if (arrowSplit.length > 1) {
    return arrowSplit.map((s, i) => `${i + 1}. ${s.trim()}`);
  }

  // 尝试按编号列表分割（中文和英文）
  const numberedMatches = description.match(/\d+[.、)]\s*[^.!?。！？]+/g);
  if (numberedMatches && numberedMatches.length > 1) {
    return numberedMatches.map(s => s.trim());
  }

  // 尝试按中文句号、问号、感叹号分割
  const cnSentences = description.split(/[。！？\n]+/).filter(s => s.trim().length > 0);
  if (cnSentences.length > 1) {
    return cnSentences.map((s, i) => `${i + 1}. ${s.trim()}`);
  }

  // 尝试按英文句子分割
  const sentences = description.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length > 1) {
    return sentences.map((s, i) => `${i + 1}. ${s.trim()}`);
  }

  // 尝试按逗号/顿号分割（中文并列任务）
  const commaParts = description.split(/[，、；]/).filter(s => s.trim().length > 5);
  if (commaParts.length >= 2) {
    return commaParts.map((s, i) => `${i + 1}. ${s.trim()}`);
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
Each step should be a specific action using tools (web search, file read/write, code execution, analysis).

Goal: "${goalDescription}"

Rules:
- Each step must start with an action verb
- Be specific about WHAT to do, not vague goals
- Steps should be ordered by dependency (what must happen first)
- Mark steps that can run in parallel with [parallel] prefix

Respond with ONLY numbered steps, one per line. No explanations, no markdown.

Examples:
1. [search] Search for existing implementations of X
2. [analysis] Read and analyze the current module structure
3. [code] Implement the core logic in module.ts
4. [test] Write unit tests for the new functionality
5. [verify] Run build and tests to verify everything works`;

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
 * 拓扑排序 — 返回分层执行层级
 *
 * 每层内的步骤可以并行执行，层间有严格依赖。
 * 如果检测到环则返回 null。
 */
export function topologicalSort(steps: PlanStep[]): PlanStep[][] | null {
  const stepMap = new Map(steps.map(s => [s.id, s]));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const step of steps) {
    inDegree.set(step.id, step.dependencies.length);
    for (const depId of step.dependencies) {
      if (!adj.has(depId)) adj.set(depId, []);
      adj.get(depId)!.push(step.id);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const levels: PlanStep[][] = [];
  let processed = 0;

  while (queue.length > 0) {
    const levelSize = queue.length;
    const level: PlanStep[] = [];

    for (let i = 0; i < levelSize; i++) {
      const id = queue.shift()!;
      const step = stepMap.get(id);
      if (step) level.push(step);
      processed++;

      for (const next of adj.get(id) ?? []) {
        const newDeg = (inDegree.get(next) ?? 0) - 1;
        inDegree.set(next, newDeg);
        if (newDeg === 0) queue.push(next);
      }
    }

    if (level.length > 0) levels.push(level);
  }

  return processed === steps.length ? levels : null;
}

/**
 * 检测循环依赖（DFS）
 */
export function detectCycle(steps: PlanStep[]): string[] | null {
  const stepMap = new Map(steps.map(s => [s.id, s]));
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  const dfs = (id: string): boolean => {
    if (inStack.has(id)) {
      const cycleStart = path.indexOf(id);
      path.push(id);
      return true;
    }
    if (visited.has(id)) return false;

    visited.add(id);
    inStack.add(id);
    path.push(id);

    const step = stepMap.get(id);
    if (step) {
      for (const depId of step.dependencies) {
        if (dfs(depId)) return true;
      }
    }

    path.pop();
    inStack.delete(id);
    return false;
  };

  for (const step of steps) {
    if (dfs(step.id)) {
      return path.slice(path.indexOf(path[path.length - 1]));
    }
  }

  return null;
}

/**
 * 规划器
 *
 * 负责将目标分解为可执行的步骤，支持 DAG 依赖图和拓扑排序。
 */
export class Planner {
  private readonly llm: PlannerLLM | null;

  constructor(llm?: PlannerLLM) {
    this.llm = llm ?? null;
  }

  /**
   * 创建计划 — 使用 LLM 智能分解（如果可用）或规则回退
   * 创建后立即进行循环检测，有环则自动修复依赖。
   */
  async createPlan(goal: Goal): Promise<Plan> {
    const stepDescriptions = this.llm
      ? await decomposeGoalByLLM(this.llm, goal.description)
      : decomposeGoalByRules(goal.description);
    const strategy = inferStrategy(goal.description);

    const steps: PlanStep[] = stepDescriptions.map((desc, index) => ({
      id: generateId('step'),
      description: desc.replace(/^\[parallel\]\s*/i, '').trim(),
      order: index,
      dependencies: [] as string[],
      status: 'ready' as const,
    }));

    // 推断依赖关系：检测 [parallel] 标记
    let lastSequentialIdx = 0;
    for (let i = 0; i < stepDescriptions.length; i++) {
      const isParallel = /^\[parallel\]/i.test(stepDescriptions[i]);
      if (i === 0) {
        steps[0].status = 'ready';
        lastSequentialIdx = 0;
      } else if (isParallel) {
        steps[i].dependencies = [steps[lastSequentialIdx].id];
        steps[i].status = steps[lastSequentialIdx].status === 'ready' ? 'ready' : 'blocked';
      } else {
        steps[i].dependencies = [steps[i - 1].id];
        steps[i].status = 'blocked';
        lastSequentialIdx = i;
      }
    }

    // 创建时立即检测循环依赖并修复
    const cycle = detectCycle(steps);
    if (cycle) {
      // 断环：移除环中最后一条依赖边
      const lastInCycle = cycle[cycle.length - 2];
      const firstInCycle = cycle[cycle.length - 1];
      const step = steps.find(s => s.id === lastInCycle);
      if (step) {
        step.dependencies = step.dependencies.filter(d => d !== firstInCycle);
      }
    }

    // 用拓扑排序重新编排 order
    const topoLevels = topologicalSort(steps);
    if (topoLevels) {
      let orderIdx = 0;
      for (const level of topoLevels) {
        for (const step of level) {
          step.order = orderIdx++;
        }
      }
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
   * 获取就绪的步骤（返回所有依赖满足的步骤，支持并行调度）
   */
  getReadySteps(plan: Plan): PlanStep[] {
    const ready = plan.steps.filter(step => {
      if (step.status !== 'ready') return false;

      for (const depId of step.dependencies) {
        const depStep = plan.steps.find(s => s.id === depId);
        if (!depStep || (depStep.status !== 'completed' && depStep.status !== 'skipped')) {
          return false;
        }
      }

      return true;
    });

    return ready.sort((a, b) => a.order - b.order);
  }

  /**
   * 获取执行层级（拓扑排序结果）— 每层可并行，层间有序
   */
  getExecutionLevels(plan: Plan): PlanStep[][] {
    const levels = topologicalSort(plan.steps);
    return levels ?? [plan.steps];
  }

  /**
   * 部分回滚 — 从失败步骤回滚到指定安全点，保留安全点之前的结果
   */
  partialRollback(plan: Plan, failedStepId: string, rollbackTo?: string): Plan {
    const failedIdx = plan.steps.findIndex(s => s.id === failedStepId);
    if (failedIdx === -1) return plan;

    // 确定回滚目标：指定的安全点 或 失败步骤之前最后一个成功的步骤
    let rollbackIdx = 0;
    if (rollbackTo) {
      const targetIdx = plan.steps.findIndex(s => s.id === rollbackTo);
      if (targetIdx !== -1 && targetIdx < failedIdx) {
        rollbackIdx = targetIdx;
      }
    } else {
      // 找到失败步骤之前最近的一个成功步骤，回滚到它之后
      for (let i = failedIdx - 1; i >= 0; i--) {
        if (plan.steps[i].status === 'completed') {
          rollbackIdx = i + 1;
          break;
        }
      }
    }

    const newSteps = plan.steps.map((step, idx) => {
      // 保留回滚点之前的步骤
      if (idx < rollbackIdx) return step;

      // 回滚范围内的步骤重置为 ready（保留依赖关系）
      return {
        ...step,
        status: 'ready' as const,
        result: undefined,
      };
    });

    // 确保依赖一致性：只有依赖都完成的步骤才是 ready
    for (let i = rollbackIdx; i < newSteps.length; i++) {
      const depsOk = newSteps[i].dependencies.every(depId => {
        const dep = newSteps.find(s => s.id === depId);
        return dep?.status === 'completed' || dep?.status === 'skipped';
      });
      if (!depsOk) {
        newSteps[i] = { ...newSteps[i], status: 'blocked' };
      }
    }

    return { ...plan, steps: newSteps };
  }

  /**
   * 评估计划质量 (0-1)
   */
  scorePlan(plan: Plan): { score: number; issues: string[] } {
    const issues: string[] = [];
    let score = 1.0;

    // 1. 步骤数量（2-8 是理想范围）
    const stepCount = plan.steps.length;
    if (stepCount < 2) {
      issues.push('Only 1 step — plan is trivial');
      score -= 0.3;
    } else if (stepCount > 10) {
      issues.push(`${stepCount} steps — plan may be too granular`);
      score -= 0.1;
    }

    // 2. 步骤描述重复检测
    const descriptions = plan.steps.map(s => s.description.toLowerCase());
    for (let i = 0; i < descriptions.length; i++) {
      for (let j = i + 1; j < descriptions.length; j++) {
        if (descriptions[i] === descriptions[j]) {
          issues.push(`Duplicate step: "${plan.steps[i].description}"`);
          score -= 0.2;
        }
      }
    }

    // 3. 依赖无环检测
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const hasCycle = (stepId: string): boolean => {
      if (inStack.has(stepId)) return true;
      if (visited.has(stepId)) return false;
      visited.add(stepId);
      inStack.add(stepId);
      const step = plan.steps.find(s => s.id === stepId);
      if (step) {
        for (const depId of step.dependencies) {
          if (hasCycle(depId)) return true;
        }
      }
      inStack.delete(stepId);
      return false;
    };
    for (const step of plan.steps) {
      if (hasCycle(step.id)) {
        issues.push('Circular dependency detected');
        score -= 0.4;
        break;
      }
    }

    // 4. 有无根步骤（无依赖的起始步骤）
    const rootSteps = plan.steps.filter(s => s.dependencies.length === 0);
    if (rootSteps.length === 0) {
      issues.push('No root step (all steps have dependencies)');
      score -= 0.3;
    }

    // 5. 步骤描述具体度
    const vagueSteps = plan.steps.filter(s =>
      s.description.length < 10 ||
      /^(step|do|handle|process|work)\b/i.test(s.description)
    );
    if (vagueSteps.length > 0) {
      issues.push(`${vagueSteps.length} vague step(s): "${vagueSteps[0].description.slice(0, 30)}"`);
      score -= 0.1 * vagueSteps.length;
    }

    return { score: Math.max(0, Math.min(1, score)), issues };
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
