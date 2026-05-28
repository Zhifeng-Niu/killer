/**
 * Brainstem - 长程任务执行引擎
 *
 * 支持持续数小时的自主任务执行：
 * - 持久化检查点（JSON 序列化）
 * - 时间预算管理
 * - 进度追踪与自动恢复
 * - 停滞检测与策略切换
 * - 无硬性轮次限制
 */

import type { KernelLogger } from './types.js';
import { SILENT_LOGGER } from './types.js';
import type { Plan, PlanStep, StepResult } from '../prefrontal/types.js';

/** 检查点数据结构 */
export interface TaskCheckpoint {
  taskId: string;
  goalDescription: string;
  planId: string;
  plan: Plan;
  completedSteps: string[];
  failedSteps: string[];
  totalSteps: number;
  startedAt: number;
  lastUpdatedAt: number;
  checkpoints: number;
  timeBudgetMs: number;
  elapsedMs: number;
  status: TaskStatus;
  metadata: Record<string, unknown>;
}

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'exceeded_budget';

/** 时间预算配置 */
export interface TimeBudget {
  /** 总预算（毫秒） */
  totalMs: number;
  /** 单步最大执行时间（毫秒），0 = 无限制 */
  stepTimeoutMs: number;
  /** 检查点保存间隔（毫秒） */
  checkpointIntervalMs: number;
  /** 停滞检测阈值：连续 N 步无进展 */
  stagnationThreshold: number;
  /** 停滞检测窗口（毫秒） */
  stagnationWindowMs: number;
}

/** 进度快照 */
export interface ProgressSnapshot {
  taskId: string;
  completedSteps: number;
  totalSteps: number;
  percentComplete: number;
  elapsedMs: number;
  remainingBudgetMs: number;
  currentStep: string | null;
  status: TaskStatus;
  checkpointCount: number;
}

/** 引擎配置 */
export interface LongTaskEngineConfig {
  timeBudget: TimeBudget;
  logger?: KernelLogger;
  /** 检查点持久化回调 */
  persistCheckpoint?: (checkpoint: TaskCheckpoint) => void | Promise<void>;
  /** 检查点恢复回调 */
  loadCheckpoint?: (taskId: string) => Promise<TaskCheckpoint | null>;
}

export const DEFAULT_TIME_BUDGET: TimeBudget = {
  totalMs: 8 * 60 * 60 * 1000,     // 8 小时
  stepTimeoutMs: 10 * 60 * 1000,    // 10 分钟/步
  checkpointIntervalMs: 5 * 60 * 1000, // 5 分钟自动检查点
  stagnationThreshold: 5,
  stagnationWindowMs: 30 * 60 * 1000,  // 30 分钟窗口
};

export const UNLIMITED_BUDGET: TimeBudget = {
  totalMs: Infinity,
  stepTimeoutMs: 0,
  checkpointIntervalMs: 5 * 60 * 1000,
  stagnationThreshold: 10,
  stagnationWindowMs: 60 * 60 * 1000,
};

/** 步骤执行历史条目 */
interface StepHistoryEntry {
  stepId: string;
  timestamp: number;
  success: boolean;
}

/**
 * 长程任务执行引擎
 */
export class LongTaskEngine {
  private readonly config: LongTaskEngineConfig;
  private readonly logger: KernelLogger;

  /** 活跃任务检查点 */
  private readonly checkpoints: Map<string, TaskCheckpoint> = new Map();

  /** 步骤执行历史（用于停滞检测） */
  private readonly stepHistory: Map<string, StepHistoryEntry[]> = new Map();

  /** 检查点定时器 */
  private checkpointTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

  /** 连续无进展计数 */
  private stagnationCounts: Map<string, number> = new Map();

  constructor(config: Partial<LongTaskEngineConfig> = {}) {
    this.logger = config.logger ?? SILENT_LOGGER;
    this.config = {
      timeBudget: { ...DEFAULT_TIME_BUDGET, ...config.timeBudget },
      logger: this.logger,
      persistCheckpoint: config.persistCheckpoint,
      loadCheckpoint: config.loadCheckpoint,
    };
    this.logger.info(`[LongTaskEngine] Initialized (budgetMs=${this.config.timeBudget.totalMs})`);
  }

  /**
   * 注册长程任务
   */
  registerTask(
    taskId: string,
    goalDescription: string,
    plan: Plan,
    metadata: Record<string, unknown> = {},
  ): TaskCheckpoint {
    const now = Date.now();
    const checkpoint: TaskCheckpoint = {
      taskId,
      goalDescription,
      planId: plan.id,
      plan,
      completedSteps: [],
      failedSteps: [],
      totalSteps: plan.steps.length,
      startedAt: now,
      lastUpdatedAt: now,
      checkpoints: 0,
      timeBudgetMs: this.config.timeBudget.totalMs,
      elapsedMs: 0,
      status: 'running',
      metadata,
    };

    this.checkpoints.set(taskId, checkpoint);
    this.stepHistory.set(taskId, []);
    this.stagnationCounts.set(taskId, 0);

    this.startAutoCheckpoint(taskId);
    this.logger.info(`[LongTaskEngine] Task registered: ${taskId} (${plan.steps.length} steps, budget=${this.config.timeBudget.totalMs})`);

    return { ...checkpoint };
  }

  /**
   * 记录步骤完成
   */
  recordStepCompletion(
    taskId: string,
    stepId: string,
    result: StepResult,
  ): TaskCheckpoint | null {
    const checkpoint = this.checkpoints.get(taskId);
    if (!checkpoint) return null;

    const now = Date.now();
    const entry: StepHistoryEntry = {
      stepId,
      timestamp: now,
      success: result.success,
    };

    const history = this.stepHistory.get(taskId) ?? [];
    history.push(entry);
    this.stepHistory.set(taskId, history);

    if (result.success) {
      if (!checkpoint.completedSteps.includes(stepId)) {
        checkpoint.completedSteps = [...checkpoint.completedSteps, stepId];
      }
      this.stagnationCounts.set(taskId, 0);
    } else {
      if (!checkpoint.failedSteps.includes(stepId)) {
        checkpoint.failedSteps = [...checkpoint.failedSteps, stepId];
      }
      const current = this.stagnationCounts.get(taskId) ?? 0;
      this.stagnationCounts.set(taskId, current + 1);
    }

    checkpoint.elapsedMs = now - checkpoint.startedAt;
    checkpoint.lastUpdatedAt = now;

    // 检查时间预算
    if (checkpoint.elapsedMs >= checkpoint.timeBudgetMs) {
      checkpoint.status = 'exceeded_budget';
      this.logger.warn(`[LongTaskEngine] Time budget exceeded: ${taskId} (elapsed=${checkpoint.elapsedMs}, budget=${checkpoint.timeBudgetMs})`);
    }

    // 检查任务完成
    const allDone = checkpoint.completedSteps.length + checkpoint.failedSteps.length
      >= checkpoint.totalSteps;
    if (allDone && checkpoint.status === 'running') {
      const anyCompleted = checkpoint.completedSteps.length > 0;
      checkpoint.status = anyCompleted ? 'completed' : 'failed';
    }

    this.checkpoints.set(taskId, checkpoint);
    return { ...checkpoint };
  }

  /**
   * 获取进度快照
   */
  getProgress(taskId: string): ProgressSnapshot | null {
    const checkpoint = this.checkpoints.get(taskId);
    if (!checkpoint) return null;

    const currentStep = this.findCurrentStep(checkpoint);
    const remaining = Math.max(0, checkpoint.timeBudgetMs - checkpoint.elapsedMs);

    return {
      taskId,
      completedSteps: checkpoint.completedSteps.length,
      totalSteps: checkpoint.totalSteps,
      percentComplete:
        checkpoint.totalSteps > 0
          ? Math.round((checkpoint.completedSteps.length / checkpoint.totalSteps) * 100)
          : 0,
      elapsedMs: checkpoint.elapsedMs,
      remainingBudgetMs: remaining,
      currentStep: currentStep?.description ?? null,
      status: checkpoint.status,
      checkpointCount: checkpoint.checkpoints,
    };
  }

  /**
   * 检测是否停滞
   */
  isStagnant(taskId: string): boolean {
    const count = this.stagnationCounts.get(taskId) ?? 0;
    return count >= this.config.timeBudget.stagnationThreshold;
  }

  /**
   * 获取停滞次数
   */
  getStagnationCount(taskId: string): number {
    return this.stagnationCounts.get(taskId) ?? 0;
  }

  /**
   * 获取剩余时间预算
   */
  getRemainingBudget(taskId: string): number {
    const checkpoint = this.checkpoints.get(taskId);
    if (!checkpoint) return 0;
    return Math.max(0, checkpoint.timeBudgetMs - (Date.now() - checkpoint.startedAt));
  }

  /**
   * 保存检查点（手动或自动）
   */
  async saveCheckpoint(taskId: string): Promise<TaskCheckpoint | null> {
    const checkpoint = this.checkpoints.get(taskId);
    if (!checkpoint) return null;

    checkpoint.lastUpdatedAt = Date.now();
    checkpoint.checkpoints += 1;
    this.checkpoints.set(taskId, checkpoint);

    if (this.config.persistCheckpoint) {
      await this.config.persistCheckpoint({ ...checkpoint });
    }

    this.logger.debug(`[LongTaskEngine] Checkpoint saved: ${taskId} (#${checkpoint.checkpoints})`);

    return { ...checkpoint };
  }

  /**
   * 从持久化恢复任务
   */
  async restoreTask(taskId: string): Promise<TaskCheckpoint | null> {
    if (!this.config.loadCheckpoint) return null;

    const saved = await this.config.loadCheckpoint(taskId);
    if (!saved) return null;

    // 更新已过时间
    const now = Date.now();
    saved.elapsedMs = now - saved.startedAt;

    if (saved.elapsedMs >= saved.timeBudgetMs) {
      saved.status = 'exceeded_budget';
    } else {
      saved.status = 'running';
    }

    saved.lastUpdatedAt = now;
    this.checkpoints.set(taskId, saved);
    this.stepHistory.set(taskId, []);
    this.stagnationCounts.set(taskId, 0);

    this.startAutoCheckpoint(taskId);

    this.logger.info(`[LongTaskEngine] Task restored: ${taskId} (${saved.completedSteps.length}/${saved.totalSteps} steps)`);

    return { ...saved };
  }

  /**
   * 更新任务计划（用于动态调整）
   */
  updatePlan(taskId: string, newPlan: Plan): TaskCheckpoint | null {
    const checkpoint = this.checkpoints.get(taskId);
    if (!checkpoint) return null;

    const updated: TaskCheckpoint = {
      ...checkpoint,
      planId: newPlan.id,
      plan: newPlan,
      totalSteps: newPlan.steps.length,
      lastUpdatedAt: Date.now(),
    };

    this.checkpoints.set(taskId, updated);
    return { ...updated };
  }

  /**
   * 暂停任务
   */
  pauseTask(taskId: string): boolean {
    const checkpoint = this.checkpoints.get(taskId);
    if (!checkpoint || checkpoint.status !== 'running') return false;

    checkpoint.status = 'paused';
    checkpoint.lastUpdatedAt = Date.now();
    this.stopAutoCheckpoint(taskId);

    this.logger.info(`[LongTaskEngine] Task paused: ${taskId}`);
    return true;
  }

  /**
   * 恢复暂停的任务
   */
  resumeTask(taskId: string): boolean {
    const checkpoint = this.checkpoints.get(taskId);
    if (!checkpoint || checkpoint.status !== 'paused') return false;

    checkpoint.status = 'running';
    checkpoint.lastUpdatedAt = Date.now();
    this.startAutoCheckpoint(taskId);

    this.logger.info(`[LongTaskEngine] Task resumed: ${taskId}`);
    return true;
  }

  /**
   * 获取所有活跃任务
   */
  getActiveTasks(): TaskCheckpoint[] {
    return Array.from(this.checkpoints.values())
      .filter(c => c.status === 'running' || c.status === 'paused')
      .map(c => ({ ...c }));
  }

  /**
   * 获取任务检查点
   */
  getCheckpoint(taskId: string): TaskCheckpoint | null {
    const checkpoint = this.checkpoints.get(taskId);
    return checkpoint ? { ...checkpoint } : null;
  }

  /**
   * 销毁引擎，清理所有资源
   */
  destroy(): void {
    for (const timer of this.checkpointTimers.values()) {
      clearInterval(timer);
    }
    this.checkpointTimers.clear();
    this.checkpoints.clear();
    this.stepHistory.clear();
    this.stagnationCounts.clear();
  }

  // ─── 私有方法 ───

  private findCurrentStep(checkpoint: TaskCheckpoint): PlanStep | null {
    const completedSet = new Set(checkpoint.completedSteps);
    const failedSet = new Set(checkpoint.failedSteps);

    return (
      checkpoint.plan.steps.find(
        step => !completedSet.has(step.id) && !failedSet.has(step.id),
      ) ?? null
    );
  }

  private startAutoCheckpoint(taskId: string): void {
    this.stopAutoCheckpoint(taskId);

    const interval = this.config.timeBudget.checkpointIntervalMs;
    if (interval <= 0) return;

    const timer = setInterval(() => {
      const checkpoint = this.checkpoints.get(taskId);
      if (checkpoint && checkpoint.status === 'running') {
        this.saveCheckpoint(taskId).catch(err => {
          this.logger.error(`[LongTaskEngine] Auto-checkpoint failed: ${taskId} — ${String(err)}`);
        });
      }
    }, interval);

    this.checkpointTimers.set(taskId, timer);
  }

  private stopAutoCheckpoint(taskId: string): void {
    const timer = this.checkpointTimers.get(taskId);
    if (timer) {
      clearInterval(timer);
      this.checkpointTimers.delete(taskId);
    }
  }
}
