/**
 * Brainstem - 工具链编排引擎
 *
 * 支持串行、并行、条件分支、循环的工具调用编排。
 * 每个步骤可读写 ExecutionContext 获取前序状态。
 */

import type { ToolExecutor, ToolResult } from './tool-executor.js';
import { ExecutionContext } from './execution-context.js';

// ─── 链步骤类型 ───

/** 链步骤基类 */
export interface ChainStep {
  /** 步骤 ID */
  id: string;
  /** 步骤类型 */
  type: 'tool' | 'parallel' | 'branch' | 'loop' | 'transform';
}

/** 工具调用步骤 */
export interface ToolStep extends ChainStep {
  type: 'tool';
  /** 工具名称 */
  tool: string;
  /** 静态参数 */
  params?: unknown;
  /** 动态参数：从上下文生成参数 */
  paramsFromContext?: (ctx: ExecutionContext) => unknown;
}

/** 并行执行步骤 */
export interface ParallelStep extends ChainStep {
  type: 'parallel';
  /** 并行执行的子步骤 */
  steps: ToolStep[];
}

/** 条件分支步骤 */
export interface BranchStep extends ChainStep {
  type: 'branch';
  /** 条件函数 */
  condition: (ctx: ExecutionContext) => boolean;
  /** 条件为真时执行 */
  onTrue: ChainStep | ChainStep[];
  /** 条件为假时执行 */
  onFalse?: ChainStep | ChainStep[];
}

/** 循环步骤 */
export interface LoopStep extends ChainStep {
  type: 'loop';
  /** 继续条件 */
  whileCondition: (ctx: ExecutionContext, iteration: number) => boolean;
  /** 循环体 */
  body: ChainStep | ChainStep[];
  /** 最大迭代次数 */
  maxIterations: number;
}

/** 数据变换步骤 */
export interface TransformStep extends ChainStep {
  type: 'transform';
  /** 变换函数 */
  transform: (ctx: ExecutionContext) => unknown;
  /** 输出存入上下文的键 */
  outputKey: string;
}

// ─── 执行结果 ───

export interface ChainResult {
  /** 步骤 ID → 结果 */
  stepResults: Map<string, ToolResult>;
  /** 最终输出 */
  finalOutput: unknown;
  /** 总耗时 */
  durationMs: number;
  /** 执行的步骤数 */
  stepsExecuted: number;
  /** 是否全部成功 */
  allSucceeded: boolean;
  /** 执行上下文快照 */
  context: ExecutionContext;
}

// ─── 工具链构建器 ───

/**
 * 工具链编排引擎
 *
 * 使用 builder 模式构建执行链：
 * ```
 * const result = await new ToolChain(executor)
 *   .tool('read_file', { path: '/tmp/a.txt' })
 *   .transform(ctx => JSON.parse(ctx.getStepOutput('step_0')))
 *   .parallel([
 *     { id: 'p1', type: 'tool', tool: 'search', params: { query: '${data}' } },
 *     { id: 'p2', type: 'tool', tool: 'list', params: {} },
 *   ])
 *   .branch(ctx => ctx.get('count') > 5, [moreSteps], [fewerSteps])
 *   .execute();
 * ```
 */
export class ToolChain {
  private readonly steps: (ToolStep | ParallelStep | BranchStep | LoopStep | TransformStep)[] = [];
  private readonly executor: ToolExecutor;
  private readonly ctx: ExecutionContext;
  private stepCounter: number = 0;

  constructor(executor: ToolExecutor, existingContext?: ExecutionContext) {
    this.executor = executor;
    this.ctx = existingContext ?? new ExecutionContext();
  }

  /**
   * 添加工具调用步骤
   */
  tool(name: string, params?: unknown, id?: string): this {
    this.steps.push({
      id: id ?? `step_${this.stepCounter++}`,
      type: 'tool',
      tool: name,
      params,
    } satisfies ToolStep);
    return this;
  }

  /**
   * 添加动态参数工具步骤
   */
  toolDynamic(name: string, paramsFn: (ctx: ExecutionContext) => unknown, id?: string): this {
    this.steps.push({
      id: id ?? `step_${this.stepCounter++}`,
      type: 'tool',
      tool: name,
      paramsFromContext: paramsFn,
    } satisfies ToolStep);
    return this;
  }

  /**
   * 添加并行执行步骤
   */
  parallel(steps: Array<{ tool: string; params?: unknown; id?: string }>): this {
    this.steps.push({
      id: `parallel_${this.stepCounter++}`,
      type: 'parallel',
      steps: steps.map((s, i) => ({
        id: s.id ?? `par_${this.stepCounter}_${i}`,
        type: 'tool' as const,
        tool: s.tool,
        params: s.params,
      })),
    } satisfies ParallelStep);
    return this;
  }

  /**
   * 添加条件分支
   */
  branch(
    condition: (ctx: ExecutionContext) => boolean,
    onTrue: ChainStep | ChainStep[],
    onFalse?: ChainStep | ChainStep[],
    id?: string,
  ): this {
    this.steps.push({
      id: id ?? `branch_${this.stepCounter++}`,
      type: 'branch',
      condition,
      onTrue,
      onFalse,
    } satisfies BranchStep);
    return this;
  }

  /**
   * 添加循环
   */
  loop(
    whileCondition: (ctx: ExecutionContext, iteration: number) => boolean,
    body: ChainStep | ChainStep[],
    maxIterations: number = 10,
    id?: string,
  ): this {
    this.steps.push({
      id: id ?? `loop_${this.stepCounter++}`,
      type: 'loop',
      whileCondition,
      body,
      maxIterations,
    } satisfies LoopStep);
    return this;
  }

  /**
   * 添加数据变换步骤
   */
  transform(fn: (ctx: ExecutionContext) => unknown, outputKey: string, id?: string): this {
    this.steps.push({
      id: id ?? `transform_${this.stepCounter++}`,
      type: 'transform',
      transform: fn,
      outputKey,
    } satisfies TransformStep);
    return this;
  }

  /**
   * 执行整个链
   */
  async execute(): Promise<ChainResult> {
    const startTime = Date.now();
    const stepResults = new Map<string, ToolResult>();
    let stepsExecuted = 0;
    let allSucceeded = true;
    let finalOutput: unknown = undefined;

    for (const step of this.steps) {
      const result = await this.executeStep(step, stepResults);
      stepsExecuted += result.stepsExecuted;
      if (!result.success) allSucceeded = false;
      finalOutput = result.output;
    }

    return {
      stepResults,
      finalOutput,
      durationMs: Date.now() - startTime,
      stepsExecuted,
      allSucceeded,
      context: this.ctx,
    };
  }

  /**
   * 获取执行上下文（构建时可读写）
   */
  getContext(): ExecutionContext {
    return this.ctx;
  }

  // ─── 私有执行方法 ───

  private async executeStep(
    step: ChainStep,
    results: Map<string, ToolResult>,
  ): Promise<{ success: boolean; output: unknown; stepsExecuted: number }> {
    switch (step.type) {
      case 'tool':
        return this.executeToolStep(step as ToolStep, results);
      case 'parallel':
        return this.executeParallelStep(step as ParallelStep, results);
      case 'branch':
        return this.executeBranchStep(step as BranchStep, results);
      case 'loop':
        return this.executeLoopStep(step as LoopStep, results);
      case 'transform':
        return this.executeTransformStep(step as TransformStep);
      default:
        return { success: false, output: undefined, stepsExecuted: 0 };
    }
  }

  private async executeToolStep(
    step: ToolStep,
    results: Map<string, ToolResult>,
  ): Promise<{ success: boolean; output: unknown; stepsExecuted: number }> {
    const params = step.paramsFromContext
      ? step.paramsFromContext(this.ctx)
      : step.params;

    const result = await this.executor.execute(step.tool, params);
    results.set(step.id, result);

    if (result.success && result.data !== undefined) {
      this.ctx.recordStepOutput(step.id, result.data);
    }

    return { success: result.success, output: result.data, stepsExecuted: 1 };
  }

  private async executeParallelStep(
    step: ParallelStep,
    results: Map<string, ToolResult>,
  ): Promise<{ success: boolean; output: unknown[]; stepsExecuted: number }> {
    const outputs = await Promise.all(
      step.steps.map(async (subStep) => {
        const result = await this.executor.execute(subStep.tool, subStep.params);
        results.set(subStep.id, result);
        if (result.success && result.data !== undefined) {
          this.ctx.recordStepOutput(subStep.id, result.data);
        }
        return result;
      }),
    );

    const allOk = outputs.every(r => r.success);
    const data = outputs.map(r => r.data);

    return { success: allOk, output: data, stepsExecuted: step.steps.length };
  }

  private async executeBranchStep(
    step: BranchStep,
    results: Map<string, ToolResult>,
  ): Promise<{ success: boolean; output: unknown; stepsExecuted: number }> {
    const conditionMet = step.condition(this.ctx);
    const chosen = conditionMet ? step.onTrue : step.onFalse;

    if (!chosen) {
      return { success: true, output: undefined, stepsExecuted: 0 };
    }

    const steps = Array.isArray(chosen) ? chosen : [chosen];
    let totalExecuted = 0;
    let allOk = true;
    let lastOutput: unknown = undefined;

    for (const subStep of steps) {
      const result = await this.executeStep(subStep, results);
      totalExecuted += result.stepsExecuted;
      if (!result.success) allOk = false;
      lastOutput = result.output;
    }

    return { success: allOk, output: lastOutput, stepsExecuted: totalExecuted };
  }

  private async executeLoopStep(
    step: LoopStep,
    results: Map<string, ToolResult>,
  ): Promise<{ success: boolean; output: unknown; stepsExecuted: number }> {
    let iteration = 0;
    let totalExecuted = 0;
    let allOk = true;
    let lastOutput: unknown = undefined;

    while (
      iteration < step.maxIterations &&
      step.whileCondition(this.ctx, iteration)
    ) {
      const bodySteps = Array.isArray(step.body) ? step.body : [step.body];

      for (const subStep of bodySteps) {
        const result = await this.executeStep(subStep, results);
        totalExecuted += result.stepsExecuted;
        if (!result.success) { allOk = false; break; }
        lastOutput = result.output;
      }

      iteration++;
    }

    this.ctx.set(`${step.id}_iterations`, iteration);

    return { success: allOk, output: lastOutput, stepsExecuted: totalExecuted };
  }

  private async executeTransformStep(
    step: TransformStep,
  ): Promise<{ success: boolean; output: unknown; stepsExecuted: number }> {
    try {
      const result = step.transform(this.ctx);
      this.ctx.set(step.outputKey, result);
      return { success: true, output: result, stepsExecuted: 1 };
    } catch (error) {
      return {
        success: false,
        output: undefined,
        stepsExecuted: 0,
      };
    }
  }
}
