/**
 * Brainstem - 定时任务调度器
 *
 * 支持定时触发、周期执行、延迟任务。
 * 与 LongTaskEngine 集成，为长程任务提供时间维度控制。
 */

/** 调度任务 */
export interface ScheduledTask {
  /** 任务 ID */
  id: string;
  /** 任务名称 */
  name: string;
  /** 执行函数 */
  handler: () => Promise<unknown>;
  /** 调度类型 */
  type: 'once' | 'recurring' | 'cron';
  /** 调度配置 */
  schedule: OnceSchedule | RecurringSchedule | CronSchedule;
  /** 上次执行时间 */
  lastExecutedAt: number | null;
  /** 下次执行时间 */
  nextExecutionAt: number | null;
  /** 执行次数 */
  executionCount: number;
  /** 任务状态 */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  /** 创建时间 */
  createdAt: number;
  /** 最后错误 */
  lastError: string | null;
}

/** 延迟执行配置 */
export interface OnceSchedule {
  /** 延迟毫秒数（从注册时起算） */
  delayMs: number;
}

/** 周期执行配置 */
export interface RecurringSchedule {
  /** 执行间隔（毫秒） */
  intervalMs: number;
  /** 首次延迟（毫秒，0 = 立即执行） */
  initialDelayMs: number;
  /** 最大执行次数（0 = 无限） */
  maxExecutions: number;
}

/** Cron 配置（简化版） */
export interface CronSchedule {
  /** 分钟 (0-59) */
  minute: number;
  /** 小时 (0-23) */
  hour: number;
}

/** 任务执行结果 */
export interface TaskExecutionResult {
  taskId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
  executedAt: number;
}

type ScheduleConfig = OnceSchedule | RecurringSchedule | CronSchedule;

/**
 * 定时任务调度器
 */
export class ScheduledTaskRunner {
  private readonly tasks: Map<string, ScheduledTask> = new Map();
  private readonly timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly executionHistory: TaskExecutionResult[] = [];
  private running: boolean = false;

  private static readonly MAX_HISTORY = 500;

  /**
   * 启动调度器
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    for (const task of this.tasks.values()) {
      if (task.status === 'pending') {
        this.scheduleTask(task);
      }
    }
  }

  /**
   * 停止调度器（不取消已注册任务，仅暂停）
   */
  stop(): void {
    this.running = false;
    for (const [id, timer] of this.timers) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  /**
   * 注册延迟执行任务（执行一次）
   */
  once(
    name: string,
    handler: () => Promise<unknown>,
    delayMs: number,
  ): string {
    const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();

    const task: ScheduledTask = {
      id,
      name,
      handler,
      type: 'once',
      schedule: { delayMs },
      lastExecutedAt: null,
      nextExecutionAt: now + delayMs,
      executionCount: 0,
      status: 'pending',
      createdAt: now,
      lastError: null,
    };

    this.tasks.set(id, task);

    if (this.running) {
      this.scheduleTask(task);
    }

    return id;
  }

  /**
   * 注册周期执行任务
   */
  recurring(
    name: string,
    handler: () => Promise<unknown>,
    intervalMs: number,
    options: { initialDelayMs?: number; maxExecutions?: number } = {},
  ): string {
    const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();
    const initialDelay = options.initialDelayMs ?? 0;

    const task: ScheduledTask = {
      id,
      name,
      handler,
      type: 'recurring',
      schedule: {
        intervalMs,
        initialDelayMs: initialDelay,
        maxExecutions: options.maxExecutions ?? 0,
      },
      lastExecutedAt: null,
      nextExecutionAt: now + initialDelay,
      executionCount: 0,
      status: 'pending',
      createdAt: now,
      lastError: null,
    };

    this.tasks.set(id, task);

    if (this.running) {
      this.scheduleTask(task);
    }

    return id;
  }

  /**
   * 注册每日定时任务（简化 cron）
   */
  daily(
    name: string,
    handler: () => Promise<unknown>,
    hour: number,
    minute: number = 0,
  ): string {
    const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();

    const task: ScheduledTask = {
      id,
      name,
      handler,
      type: 'cron',
      schedule: { minute, hour },
      lastExecutedAt: null,
      nextExecutionAt: this.computeNextCronTime(hour, minute),
      executionCount: 0,
      status: 'pending',
      createdAt: now,
      lastError: null,
    };

    this.tasks.set(id, task);

    if (this.running) {
      this.scheduleTask(task);
    }

    return id;
  }

  /**
   * 取消任务
   */
  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    const timer = this.timers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(taskId);
    }

    task.status = 'cancelled';
    task.nextExecutionAt = null;
    return true;
  }

  /**
   * 获取任务信息
   */
  getTask(taskId: string): ScheduledTask | null {
    const task = this.tasks.get(taskId);
    return task ? { ...task } : null;
  }

  /**
   * 获取所有活跃任务
   */
  getActiveTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values())
      .filter(t => t.status === 'pending' || t.status === 'running')
      .map(t => ({ ...t }));
  }

  /**
   * 获取执行历史
   */
  getHistory(limit: number = 50): TaskExecutionResult[] {
    return this.executionHistory.slice(-limit);
  }

  /**
   * 销毁调度器
   */
  destroy(): void {
    this.stop();
    this.tasks.clear();
    this.executionHistory.length = 0;
  }

  // ─── 私有方法 ───

  private scheduleTask(task: ScheduledTask): void {
    if (!this.running || task.status === 'cancelled' || task.status === 'completed') return;

    const now = Date.now();
    let delay: number;

    if (task.type === 'once') {
      const schedule = task.schedule as OnceSchedule;
      delay = Math.max(0, (task.createdAt + schedule.delayMs) - now);
    } else if (task.type === 'recurring') {
      const schedule = task.schedule as RecurringSchedule;
      if (task.executionCount === 0 && schedule.initialDelayMs > 0) {
        delay = Math.max(0, (task.createdAt + schedule.initialDelayMs) - now);
      } else {
        delay = schedule.intervalMs;
      }
    } else {
      // cron
      delay = Math.max(0, (task.nextExecutionAt ?? 0) - now);
    }

    const timer = setTimeout(async () => {
      await this.executeTask(task);
    }, delay);

    this.timers.set(task.id, timer);
  }

  private async executeTask(task: ScheduledTask): Promise<void> {
    const startTime = Date.now();
    const originalStatus = task.status;
    task.status = 'running';

    try {
      const result = await task.handler();
      const durationMs = Date.now() - startTime;

      task.executionCount += 1;
      task.lastExecutedAt = startTime;
      task.lastError = null;

      this.recordExecution({
        taskId: task.id,
        success: true,
        result,
        durationMs,
        executedAt: startTime,
      });

      // 判断下一步
      if (task.type === 'once') {
        task.status = 'completed';
        task.nextExecutionAt = null;
      } else if (task.type === 'recurring') {
        const schedule = task.schedule as RecurringSchedule;
        if (schedule.maxExecutions > 0 && task.executionCount >= schedule.maxExecutions) {
          task.status = 'completed';
          task.nextExecutionAt = null;
        } else {
          task.status = 'pending';
          task.nextExecutionAt = Date.now() + schedule.intervalMs;
          this.scheduleTask(task);
        }
      } else {
        // cron — 调度下一次
        const cron = task.schedule as CronSchedule;
        task.status = 'pending';
        task.nextExecutionAt = this.computeNextCronTime(cron.hour, cron.minute);
        this.scheduleTask(task);
      }
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      task.executionCount += 1;
      task.lastExecutedAt = startTime;
      task.lastError = errorMsg;
      task.status = 'failed';

      this.recordExecution({
        taskId: task.id,
        success: false,
        error: errorMsg,
        durationMs,
        executedAt: startTime,
      });

      // 周期任务失败后继续调度（不取消）
      if (task.type === 'recurring') {
        const schedule = task.schedule as RecurringSchedule;
        task.status = 'pending';
        task.nextExecutionAt = Date.now() + schedule.intervalMs;
        this.scheduleTask(task);
      } else if (task.type === 'cron') {
        const cron = task.schedule as CronSchedule;
        task.status = 'pending';
        task.nextExecutionAt = this.computeNextCronTime(cron.hour, cron.minute);
        this.scheduleTask(task);
      }
    }
  }

  private computeNextCronTime(hour: number, minute: number): number {
    const now = new Date();
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);

    // 如果今天的时间已过，设为明天
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    return target.getTime();
  }

  private recordExecution(result: TaskExecutionResult): void {
    this.executionHistory.push(result);
    if (this.executionHistory.length > ScheduledTaskRunner.MAX_HISTORY) {
      this.executionHistory.shift();
    }
  }
}
