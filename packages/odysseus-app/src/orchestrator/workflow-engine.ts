/**
 * Dynamic Workflow Engine
 *
 * 借鉴 Claude Code 的 Dynamic Workflows 架构，实现分阶段并行编排。
 *
 * 核心概念：
 * - Workflow: 多个 Phase 的序列
 * - Phase: 包含多个并行执行的 Task
 * - Task: 单个子任务，由 agent prompt 描述
 * - Context: 任务间共享的结果上下文
 *
 * 与 Claude Code 的差异：
 * - 不使用 JS 脚本运行时，而是类型安全的 workflow 定义
 * - 集成 Odysseus 的 TG-driven 系统：低 TG 任务提前终止
 * - 集成 hooks 系统：每个 phase 触发 lifecycle 事件
 */

// ─── 类型定义 ──────────────────────────────────────

/** 工作流任务定义 */
export interface WorkflowTask {
  /** 任务 ID */
  id: string;
  /** 任务描述（作为 agent prompt） */
  prompt: string;
  /** 使用的工具白名单（空 = 全部可用） */
  allowedTools?: string[];
  /** 最大轮次 */
  maxTurns?: number;
  /** 优先级（数字越小越先调度） */
  priority?: number;
}

/** 工作流阶段定义 */
export interface WorkflowPhase {
  /** 阶段名称 */
  name: string;
  /** 并行任务列表 */
  tasks: WorkflowTask[];
  /** 是否需要所有任务成功才进入下一阶段 */
  requireAllSuccess?: boolean;
  /** 对抗式审查：用独立 agent 交叉检查结果 */
  adversarialReview?: boolean;
}

/** 工作流定义 */
export interface WorkflowDefinition {
  /** 工作流名称 */
  name: string;
  /** 描述 */
  description?: string;
  /** 阶段列表（按顺序执行） */
  phases: WorkflowPhase[];
  /** 全局最大并发数 */
  maxConcurrency?: number;
  /** TG 阈值：低于此值的任务自动终止 */
  tgThreshold?: number;
}

/** 任务结果 */
export interface TaskResult {
  taskId: string;
  phaseName: string;
  success: boolean;
  output: string;
  /** Token 使用量 */
  tokensUsed?: number;
  /** TG 效率分数 */
  tgScore?: number;
  /** 耗时 ms */
  durationMs: number;
  /** 错误信息 */
  error?: string;
}

/** 阶段结果 */
export interface PhaseResult {
  phaseName: string;
  taskResults: TaskResult[];
  allSuccess: boolean;
  durationMs: number;
}

/** 工作流执行结果 */
export interface WorkflowResult {
  workflowName: string;
  phases: PhaseResult[];
  /** 所有任务结果的合并输出 */
  aggregatedOutput: string;
  /** 总耗时 */
  totalDurationMs: number;
  /** 总 token 使用量 */
  totalTokensUsed: number;
  /** 加权平均 TG */
  averageTG: number;
  /** 是否所有阶段成功 */
  success: boolean;
}

/** 任务执行器接口（由 agent.ts 实现） */
export interface TaskExecutor {
  executeTask(prompt: string, options?: {
    allowedTools?: string[];
    maxTurns?: number;
  }): Promise<{
    output: string;
    tokensUsed?: number;
    tgScore?: number;
  }>;
}

// ─── 工作流引擎 ──────────────────────────────────────

/**
 * 工作流引擎
 *
 * 接收 WorkflowDefinition，按阶段顺序执行，
 * 每个阶段内的任务并行执行。
 */
export class WorkflowEngine {
  private executor: TaskExecutor;
  private hookNotifier?: (event: string, payload: Record<string, unknown>) => void;

  constructor(executor: TaskExecutor, hookNotifier?: (event: string, payload: Record<string, unknown>) => void) {
    this.executor = executor;
    this.hookNotifier = hookNotifier;
  }

  /**
   * 执行完整工作流
   */
  async execute(workflow: WorkflowDefinition): Promise<WorkflowResult> {
    const startTime = Date.now();
    const phaseResults: PhaseResult[] = [];
    const context: Record<string, TaskResult[]> = {};

    for (const phase of workflow.phases) {
      const phaseResult = await this.executePhase(phase, workflow, context);
      phaseResults.push(phaseResult);
      context[phase.name] = phaseResult.taskResults;

      // 阶段失败处理
      if (phase.requireAllSuccess && !phaseResult.allSuccess) {
        this.hookNotifier?.('workflow:phase-failed', {
          workflow: workflow.name,
          phase: phase.name,
          failedTasks: phaseResult.taskResults.filter(t => !t.success).map(t => t.taskId),
        });
        break;
      }
    }

    const totalDurationMs = Date.now() - startTime;
    const allTaskResults = phaseResults.flatMap(p => p.taskResults);
    const totalTokensUsed = allTaskResults.reduce((sum, t) => sum + (t.tokensUsed ?? 0), 0);
    const tgScores = allTaskResults.filter(t => t.tgScore != null).map(t => t.tgScore!);
    const averageTG = tgScores.length > 0 ? tgScores.reduce((a, b) => a + b, 0) / tgScores.length : 1;

    return {
      workflowName: workflow.name,
      phases: phaseResults,
      aggregatedOutput: this.aggregateOutputs(allTaskResults),
      totalDurationMs,
      totalTokensUsed,
      averageTG,
      success: phaseResults.every(p => p.allSuccess),
    };
  }

  /**
   * 执行单个阶段（任务并行）
   */
  private async executePhase(
    phase: WorkflowPhase,
    workflow: WorkflowDefinition,
    context: Record<string, TaskResult[]>,
  ): Promise<PhaseResult> {
    const startTime = Date.now();
    const concurrency = workflow.maxConcurrency ?? 4;
    const tgThreshold = workflow.tgThreshold ?? 0.2;

    this.hookNotifier?.('workflow:phase-start', {
      workflow: workflow.name,
      phase: phase.name,
      taskCount: phase.tasks.length,
    });

    // 按优先级排序任务
    const sortedTasks = [...phase.tasks].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

    // 分批并行执行
    const taskResults: TaskResult[] = [];
    for (let i = 0; i < sortedTasks.length; i += concurrency) {
      const batch = sortedTasks.slice(i, i + concurrency);
      const batchPromises = batch.map(task => this.executeTask(task, context, tgThreshold));
      const batchResults = await Promise.all(batchPromises);
      taskResults.push(...batchResults);
    }

    // 对抗式审查
    if (phase.adversarialReview && taskResults.length > 0) {
      const reviewResult = await this.executeAdversarialReview(phase, taskResults);
      taskResults.push(reviewResult);
    }

    const durationMs = Date.now() - startTime;

    this.hookNotifier?.('workflow:phase-complete', {
      workflow: workflow.name,
      phase: phase.name,
      successCount: taskResults.filter(t => t.success).length,
      failCount: taskResults.filter(t => !t.success).length,
      durationMs,
    });

    return {
      phaseName: phase.name,
      taskResults,
      allSuccess: taskResults.filter(t => !t.taskId.startsWith('__review')).every(t => t.success),
      durationMs,
    };
  }

  /**
   * 执行单个任务
   */
  private async executeTask(
    task: WorkflowTask,
    context: Record<string, TaskResult[]>,
    tgThreshold: number,
  ): Promise<TaskResult> {
    const startTime = Date.now();

    // 构建包含上下文的 prompt
    const contextStr = Object.entries(context)
      .map(([phase, results]) => {
        const outputs = results.filter(r => r.success).map(r => `[${r.taskId}]: ${r.output.slice(0, 500)}`);
        return outputs.length > 0 ? `Results from "${phase}":\n${outputs.join('\n')}` : '';
      })
      .filter(Boolean)
      .join('\n\n');

    const fullPrompt = contextStr ? `Previous context:\n${contextStr}\n\nTask: ${task.prompt}` : task.prompt;

    try {
      const result = await this.executor.executeTask(fullPrompt, {
        allowedTools: task.allowedTools,
        maxTurns: task.maxTurns ?? 10,
      });

      // TG 阈值检查：低 TG 任务标记为低效
      const tgScore = result.tgScore ?? 1;
      const success = tgScore >= tgThreshold;

      return {
        taskId: task.id,
        phaseName: '',
        success,
        output: result.output,
        tokensUsed: result.tokensUsed,
        tgScore,
        durationMs: Date.now() - startTime,
        error: success ? undefined : `TG score ${tgScore.toFixed(2)} below threshold ${tgThreshold}`,
      };
    } catch (error) {
      return {
        taskId: task.id,
        phaseName: '',
        success: false,
        output: '',
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 对抗式审查：独立 agent 交叉检查结果
   */
  private async executeAdversarialReview(phase: WorkflowPhase, results: TaskResult[]): Promise<TaskResult> {
    const successResults = results.filter(r => r.success);
    if (successResults.length === 0) {
      return {
        taskId: '__review',
        phaseName: phase.name,
        success: true,
        output: 'No successful results to review.',
        durationMs: 0,
      };
    }

    const reviewPrompt = `You are an adversarial reviewer. Cross-check these results for consistency, errors, and overlooked issues.
Be critical and specific. For each result, note: (1) any logical errors, (2) missing edge cases, (3) inconsistencies with other results.

Results to review:
${successResults.map(r => `[${r.taskId}]: ${r.output.slice(0, 800)}`).join('\n\n')}

Return a structured review: for each task, state PASS or FAIL with specific reasoning.`;

    const startTime = Date.now();
    try {
      const result = await this.executor.executeTask(reviewPrompt, { maxTurns: 3 });
      return {
        taskId: '__review',
        phaseName: phase.name,
        success: true,
        output: result.output,
        tokensUsed: result.tokensUsed,
        durationMs: Date.now() - startTime,
      };
    } catch {
      return {
        taskId: '__review',
        phaseName: phase.name,
        success: false,
        output: 'Review failed.',
        durationMs: Date.now() - startTime,
        error: 'Adversarial review execution failed',
      };
    }
  }

  /**
   * 聚合所有任务输出
   */
  private aggregateOutputs(results: TaskResult[]): string {
    return results
      .filter(r => r.success && !r.taskId.startsWith('__'))
      .map(r => `## ${r.taskId}\n${r.output}`)
      .join('\n\n');
  }
}
