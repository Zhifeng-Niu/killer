/**
 * Column Runtime — 皮层柱运行时
 *
 * 让每个皮层柱（Column）拥有独立的 think → act → respond 执行循环。
 * ColumnRuntime 是 Synapse 上的一个活跃节点：
 *   - 订阅发给自己的消息
 *   - 调用 LLM 独立思考
 *   - 通过 Synapse 返回结果
 */

import {
  SynapseProtocol,
  ColumnRole,
  type ColumnId,
  type SynapseMessage,
} from '@odysseus/core';
import type { LLMProvider } from '@odysseus/core';

/**
 * 皮层柱系统提示映射
 */
const CELL_SYSTEM_PROMPTS: Record<string, string> = {
  [ColumnRole.Researcher]: `You are a Research Column. Investigate, analyze, and gather information thoroughly. Cite specifics and present findings clearly.`,
  [ColumnRole.Artisan]: `You are an Artisan Column. Write code, build tools, and implement solutions. Focus on working, correct implementations.`,
  [ColumnRole.Negotiator]: `You are a Negotiator Cell. Coordinate between parties, find consensus, and manage communication diplomatically.`,
  [ColumnRole.Evolver]: `You are an Evolver Cell. Optimize, improve, and evolve systems. Focus on measurable improvements.`,
  [ColumnRole.Prime]: `You are the Prime Cell. You coordinate other cells and synthesize their work.`,
  [ColumnRole.Critic]: `You are a Critic Column. Evaluate results rigorously against criteria. Distinguish signal from noise, identify weaknesses, and provide structured assessments. Output format: VERDICT (keep/discard/surprise), CONFIDENCE (0-1), REASONING, and RISKS.`,
  [ColumnRole.Explorer]: `You are an Explorer Cell. Generate novel hypotheses and explore orthogonal directions. Prioritize diversity over safety. Propose unconventional approaches that others might miss. Output format: HYPOTHESIS, NOVELTY_SCORE (0-1), APPROACH, and POTENTIAL_RISKS.`,
};

/**
 * 皮层柱执行结果
 */
export interface CellExecutionResult {
  cellId: ColumnId;
  taskId: string;
  output: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

/**
 * 皮层柱运行时配置
 */
export interface ColumnRuntimeConfig {
  maxRetries: number;
  timeoutMs: number;
}

const DEFAULT_RUNTIME_CONFIG: ColumnRuntimeConfig = {
  maxRetries: 1,
  timeoutMs: 30_000,
};

/**
 * Column Runtime — 单个皮层柱的执行引擎
 *
 * 每个 ColumnRuntime 实例绑定一个 ColumnId，在 Synapse 上订阅消息，
 * 收到任务消息后调用 LLM 执行并返回结果。
 */
export class ColumnRuntime {
  private readonly cellId: ColumnId;
  private readonly synapse: SynapseProtocol;
  private readonly llm: LLMProvider;
  private readonly config: ColumnRuntimeConfig;
  private readonly onLog?: (msg: string) => void;

  private running = false;
  private unsubscribe?: () => void;
  private pendingResults: Map<string, CellExecutionResult> = new Map();

  constructor(
    cellId: ColumnId,
    synapse: SynapseProtocol,
    llm: LLMProvider,
    config?: Partial<ColumnRuntimeConfig>,
    onLog?: (msg: string) => void,
  ) {
    this.cellId = cellId;
    this.synapse = synapse;
    this.llm = llm;
    this.config = { ...DEFAULT_RUNTIME_CONFIG, ...config };
    this.onLog = onLog;
  }

  /**
   * 启动 Column — 订阅 Synapse 消息
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    // 订阅发给这个 Column 的 request 消息
    this.unsubscribe = this.synapse.subscribe(
      this.cellId,
      'request',
      (message) => this.handleMessage(message),
    );

    this.synapse.heartbeat(this.cellId);
    this.log(`Column ${this.cellId.id} started`);
  }

  /**
   * 停止 Column — 取消订阅
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.log(`Column ${this.cellId.id} stopped`);
  }

  /**
   * 是否运行中
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * 获取 ColumnId
   */
  getColumnId(): ColumnId {
    return this.cellId;
  }

  /**
   * 获取待取的结果
   */
  getResult(taskId: string): CellExecutionResult | undefined {
    const result = this.pendingResults.get(taskId);
    if (result) {
      this.pendingResults.delete(taskId);
    }
    return result;
  }

  /**
   * 获取所有待取结果
   */
  drainResults(): CellExecutionResult[] {
    const results = Array.from(this.pendingResults.values());
    this.pendingResults.clear();
    return results;
  }

  /**
   * 直接执行一个任务（不通过 Synapse 消息）
   *
   * 用于 TaskDelegate 等外部调度器直接驱动 Cell。
   */
  async execute(task: string): Promise<CellExecutionResult> {
    const taskId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const startedAt = Date.now();

    this.log(`Column ${this.cellId.id} executing: ${task.slice(0, 50)}...`);

    try {
      const systemPrompt = CELL_SYSTEM_PROMPTS[this.cellId.type] ?? CELL_SYSTEM_PROMPTS[ColumnRole.Prime];
      const result = await this.withTimeout(
        this.llm.complete(task, systemPrompt),
        this.config.timeoutMs,
      );

      const durationMs = Date.now() - startedAt;
      const executionResult: CellExecutionResult = {
        cellId: this.cellId,
        taskId,
        output: result.content,
        durationMs,
        success: true,
      };

      this.log(`Column ${this.cellId.id} completed in ${durationMs}ms`);
      return executionResult;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.log(`Column ${this.cellId.id} failed: ${errorMsg}`);
      return {
        cellId: this.cellId,
        taskId,
        output: '',
        durationMs,
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * 处理从 Synapse 收到的消息
   */
  private async handleMessage(message: SynapseMessage): Promise<void> {
    const payload = message.payload as { task?: string };
    const task = payload.task;
    if (!task) return;

    const result = await this.execute(task);

    // 通过 Synapse 回复
    this.synapse.send(this.cellId.id, message.from.id, {
      id: `resp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      type: 'response',
      payload: {
        taskId: result.taskId,
        output: result.output,
        success: result.success,
        error: result.error,
      },
      priority: 'normal',
    });

    // 也存入 pendingResults 供轮询取用
    this.pendingResults.set(result.taskId, result);

    // 更新心跳
    this.synapse.heartbeat(this.cellId);
  }

  /**
   * 带超时的 Promise
   */
  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
      promise.then(
        (value) => { clearTimeout(timer); resolve(value); },
        (error) => { clearTimeout(timer); reject(error); },
      );
    });
  }

  /**
   * 日志
   */
  private log(msg: string): void {
    this.onLog?.(`[ColumnRuntime] ${msg}`);
  }
}

/**
 * ColumnRuntimePool — 管理多个活跃的 Cell Runtime
 *
 * 生命周期：spawn → start → (execute/消息驱动) → stop
 */
export class ColumnRuntimePool {
  private readonly runtimes: Map<string, ColumnRuntime> = new Map();
  private readonly synapse: SynapseProtocol;
  private readonly llm: LLMProvider;
  private readonly config: Partial<ColumnRuntimeConfig>;
  private readonly onLog?: (msg: string) => void;

  constructor(
    synapse: SynapseProtocol,
    llm: LLMProvider,
    config?: Partial<ColumnRuntimeConfig>,
    onLog?: (msg: string) => void,
  ) {
    this.synapse = synapse;
    this.llm = llm;
    this.config = config ?? {};
    this.onLog = onLog;
  }

  /**
   * 生成并启动一个 Cell
   */
  spawn(type: ColumnRole, task?: string): ColumnRuntime {
    const cellId: ColumnId = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      instance: 0,
    };

    // 注册到 Synapse
    this.synapse.registerColumn(cellId, {
      name: cellId.id,
      capabilities: this.getCapabilities(type),
      maxLoad: 5,
    });

    // 创建 Runtime
    const runtime = new ColumnRuntime(
      cellId,
      this.synapse,
      this.llm,
      this.config,
      this.onLog,
    );

    this.runtimes.set(cellId.id, runtime);
    runtime.start();

    return runtime;
  }

  /**
   * 停止并移除一个 Cell
   */
  retire(cellId: string): void {
    const runtime = this.runtimes.get(cellId);
    if (runtime) {
      runtime.stop();
      this.runtimes.delete(cellId);
      try {
        this.synapse.unregisterColumn(runtime.getColumnId());
      } catch {
        // 可能已注销
      }
    }
  }

  /**
   * 获取所有活跃的 Runtime
   */
  getActive(): ColumnRuntime[] {
    return Array.from(this.runtimes.values()).filter((r) => r.isRunning());
  }

  /**
   * 获取指定 Runtime
   */
  get(cellId: string): ColumnRuntime | undefined {
    return this.runtimes.get(cellId);
  }

  /**
   * 停止所有 Cell
   */
  stopAll(): void {
    for (const runtime of this.runtimes.values()) {
      runtime.stop();
      try {
        this.synapse.unregisterColumn(runtime.getColumnId());
      } catch {
        // 可能已注销
      }
    }
    this.runtimes.clear();
  }

  /**
   * 收集所有 Cell 的待取结果
   */
  drainAllResults(): CellExecutionResult[] {
    const results: CellExecutionResult[] = [];
    for (const runtime of this.runtimes.values()) {
      results.push(...runtime.drainResults());
    }
    return results;
  }

  /**
   * 获取活跃 Cell 数量
   */
  get size(): number {
    return this.runtimes.size;
  }

  /**
   * Cell 类型对应的能力
   */
  private getCapabilities(type: ColumnRole): string[] {
    switch (type) {
      case ColumnRole.Researcher:
        return ['research', 'analysis', 'investigation'];
      case ColumnRole.Artisan:
        return ['coding', 'implementation', 'building'];
      case ColumnRole.Negotiator:
        return ['coordination', 'communication', 'diplomacy'];
      case ColumnRole.Evolver:
        return ['optimization', 'evolution', 'improvement'];
      case ColumnRole.Critic:
        return ['evaluation', 'verification', 'risk-assessment'];
      case ColumnRole.Explorer:
        return ['hypothesis-generation', 'novelty-detection', 'divergent-thinking'];
      default:
        return ['general'];
    }
  }
}
