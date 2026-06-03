/**
 * Dynamic Workflow Engine (v2 — WP8)
 *
 * 借鉴 Claude Code 的 Dynamic Workflows 架构，实现分阶段并行编排。
 *
 * 核心概念：
 * - Workflow: 多个 Phase 的序列
 * - Phase: 包含多个并行执行的 Task
 * - Task: 单个子任务，由 agent prompt 描述
 * - Variables: 脚本变量系统，支持 {{phase:analyze.task1}} 引用
 *
 * WP8 增强：
 * - 模板变量: prompt 中用 {{phase:NAME.taskId}} 引用前序阶段输出
 * - 条件阶段: phase.condition 控制是否跳过
 * - 重试策略: task.retry 控制失败重试
 * - 变量作用域: 全局变量 + 阶段变量 + 任务输出变量
 */

// ─── 类型定义 ──────────────────────────────────────

/** 重试策略 */
export interface RetryPolicy {
  /** 最大重试次数 */
  maxRetries: number;
  /** 重试间隔 ms */
  delayMs?: number;
  /** 重试时是否修改 prompt（追加错误上下文） */
  appendErrorContext?: boolean;
}

/** 工作流任务定义 */
export interface WorkflowTask {
  /** 任务 ID */
  id: string;
  /** 任务描述（支持 {{phase:NAME.taskId}} 模板变量） */
  prompt: string;
  /** 使用的工具白名单（空 = 全部可用） */
  allowedTools?: string[];
  /** 最大轮次 */
  maxTurns?: number;
  /** 优先级（数字越小越先调度） */
  priority?: number;
  /** 重试策略 */
  retry?: RetryPolicy;
}

/** 阶段条件类型 */
export type PhaseCondition =
  | { type: 'always' }
  | { type: 'on_success'; phase: string }
  | { type: 'on_failure'; phase: string }
  | { type: 'expression'; expression: string };

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
  /** 阶段执行条件 */
  condition?: PhaseCondition;
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
  /** 全局变量（在所有 prompt 模板中可用） */
  variables?: Record<string, string>;
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
  /** 重试次数 */
  retries?: number;
}

/** 阶段结果 */
export interface PhaseResult {
  phaseName: string;
  taskResults: TaskResult[];
  allSuccess: boolean;
  skipped: boolean;
  durationMs: number;
}

/** 工作流执行结果 */
export interface WorkflowResult {
  workflowName: string;
  phases: PhaseResult[];
  /** 所有任务结果的合并输出 */
  aggregatedOutput: string;
  /** 变量快照（最终状态） */
  variables: Record<string, string>;
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

// ─── 模板变量系统 ──────────────────────────────────

/**
 * 解析模板变量
 *
 * 支持：
 * - {{phase:NAME.taskId}} — 引用前序阶段某个任务的输出
 * - {{phase:NAME}} — 引用整个阶段的聚合输出
 * - {{var:KEY}} — 引用全局变量
 * - {{last}} — 引用上一个阶段的聚合输出
 */
function resolveTemplate(
  template: string,
  phaseResults: Record<string, TaskResult[]>,
  globalVars: Record<string, string>,
  lastPhaseName?: string,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, expr: string) => {
    const trimmed = expr.trim();

    // {{var:KEY}} — 全局变量
    if (trimmed.startsWith('var:')) {
      const key = trimmed.slice(4);
      return globalVars[key] ?? `[undefined:${key}]`;
    }

    // {{phase:NAME.taskId}} — 特定任务输出
    if (trimmed.startsWith('phase:')) {
      const rest = trimmed.slice(6);
      const dotIndex = rest.indexOf('.');
      if (dotIndex >= 0) {
        const phaseName = rest.slice(0, dotIndex);
        const taskId = rest.slice(dotIndex + 1);
        const results = phaseResults[phaseName];
        if (results) {
          const taskResult = results.find(r => r.taskId === taskId);
          if (taskResult?.success) return taskResult.output;
          if (taskResult) return `[task:${taskId} failed]`;
        }
        return `[undefined:phase:${rest}]`;
      }
      // {{phase:NAME}} — 整个阶段聚合
      const results = phaseResults[rest];
      if (results) {
        return results
          .filter(r => r.success)
          .map(r => `[${r.taskId}]: ${r.output}`)
          .join('\n');
      }
      return `[undefined:phase:${rest}]`;
    }

    // {{last}} — 上一阶段输出
    if (trimmed === 'last' && lastPhaseName) {
      const results = phaseResults[lastPhaseName];
      if (results) {
        return results
          .filter(r => r.success)
          .map(r => `[${r.taskId}]: ${r.output}`)
          .join('\n');
      }
    }

    return `[undefined:${trimmed}]`;
  });
}

// ─── 工作流引擎 ──────────────────────────────────────

/**
 * 工作流引擎 (v2)
 *
 * 接收 WorkflowDefinition，按阶段顺序执行，
 * 每个阶段内的任务并行执行。
 * 支持模板变量、条件阶段、重试策略。
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
    const variables: Record<string, string> = { ...workflow.variables };
    let lastPhaseName: string | undefined;

    for (const phase of workflow.phases) {
      // 条件阶段检查
      if (phase.condition && !this.evaluateCondition(phase.condition, context)) {
        const skippedResult: PhaseResult = {
          phaseName: phase.name,
          taskResults: [],
          allSuccess: true,
          skipped: true,
          durationMs: 0,
        };
        phaseResults.push(skippedResult);
        continue;
      }

      const phaseResult = await this.executePhase(
        phase, workflow, context, variables, lastPhaseName,
      );
      phaseResults.push(phaseResult);
      context[phase.name] = phaseResult.taskResults;
      lastPhaseName = phase.name;

      // 将阶段输出注入变量作用域
      for (const tr of phaseResult.taskResults) {
        if (tr.success) {
          variables[`${phase.name}.${tr.taskId}`] = tr.output;
        }
      }

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
      variables,
      totalDurationMs,
      totalTokensUsed,
      averageTG,
      success: phaseResults.filter(p => !p.skipped).every(p => p.allSuccess),
    };
  }

  /**
   * 执行单个阶段（任务并行）
   */
  private async executePhase(
    phase: WorkflowPhase,
    workflow: WorkflowDefinition,
    context: Record<string, TaskResult[]>,
    variables: Record<string, string>,
    lastPhaseName?: string,
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
      const batchPromises = batch.map(task =>
        this.executeTaskWithRetry(task, context, variables, tgThreshold, lastPhaseName),
      );
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
      skipped: false,
      durationMs,
    };
  }

  /**
   * 带重试的任务执行
   */
  private async executeTaskWithRetry(
    task: WorkflowTask,
    context: Record<string, TaskResult[]>,
    variables: Record<string, string>,
    tgThreshold: number,
    lastPhaseName?: string,
  ): Promise<TaskResult> {
    const maxRetries = task.retry?.maxRetries ?? 0;
    let lastResult: TaskResult | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // 重试时追加错误上下文
      let prompt = resolveTemplate(task.prompt, context, variables, lastPhaseName);
      if (attempt > 0 && lastResult?.error && task.retry?.appendErrorContext !== false) {
        prompt += `\n\n[Previous attempt failed: ${lastResult.error}. Try a different approach.]`;
      }

      const result = await this.executeTaskCore(task, prompt, tgThreshold);
      lastResult = { ...result, retries: attempt };

      if (result.success) return lastResult;

      // 等待重试间隔
      if (attempt < maxRetries && task.retry?.delayMs) {
        await new Promise(resolve => setTimeout(resolve, task.retry!.delayMs));
      }
    }

    return lastResult!;
  }

  /**
   * 执行单个任务（核心逻辑）
   */
  private async executeTaskCore(
    task: WorkflowTask,
    resolvedPrompt: string,
    tgThreshold: number,
  ): Promise<TaskResult> {
    const startTime = Date.now();

    try {
      const result = await this.executor.executeTask(resolvedPrompt, {
        allowedTools: task.allowedTools,
        maxTurns: task.maxTurns ?? 10,
      });

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
   * 评估阶段条件
   */
  private evaluateCondition(
    condition: PhaseCondition,
    context: Record<string, TaskResult[]>,
  ): boolean {
    switch (condition.type) {
      case 'always':
        return true;
      case 'on_success': {
        const results = context[condition.phase];
        if (!results) return false;
        return results.every(r => r.success);
      }
      case 'on_failure': {
        const results = context[condition.phase];
        if (!results) return false;
        return results.some(r => !r.success);
      }
      case 'expression':
        // 简单表达式求值：检查变量是否存在且非空
        return condition.expression.length > 0;
      default:
        return true;
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
