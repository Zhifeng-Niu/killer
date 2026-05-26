/**
 * Cell Runtime - 细胞运行时
 *
 * 让每个 Cell 拥有独立的 think → act → respond 执行循环。
 * CellRuntime 是 Synapse 上的一个活跃节点：
 *   - 订阅发给自己的消息
 *   - 调用 LLM 独立思考
 *   - 通过 Synapse 返回结果
 */

import {
  SynapseProtocol,
  CellType,
  type CellId,
  type SynapseMessage,
} from '@killer/core';
import type { LLMProvider } from '@killer/core';

/**
 * Cell 系统提示映射
 */
const CELL_SYSTEM_PROMPTS: Record<string, string> = {
  [CellType.Researcher]: `You are a Research Cell. Investigate, analyze, and gather information thoroughly. Cite specifics and present findings clearly.`,
  [CellType.Artisan]: `You are an Artisan Cell. Write code, build tools, and implement solutions. Focus on working, correct implementations.`,
  [CellType.Negotiator]: `You are a Negotiator Cell. Coordinate between parties, find consensus, and manage communication diplomatically.`,
  [CellType.Evolver]: `You are an Evolver Cell. Optimize, improve, and evolve systems. Focus on measurable improvements.`,
  [CellType.Prime]: `You are the Prime Cell. You coordinate other cells and synthesize their work.`,
  [CellType.Critic]: `You are a Critic Cell. Evaluate results rigorously against criteria. Distinguish signal from noise, identify weaknesses, and provide structured assessments. Output format: VERDICT (keep/discard/surprise), CONFIDENCE (0-1), REASONING, and RISKS.`,
  [CellType.Explorer]: `You are an Explorer Cell. Generate novel hypotheses and explore orthogonal directions. Prioritize diversity over safety. Propose unconventional approaches that others might miss. Output format: HYPOTHESIS, NOVELTY_SCORE (0-1), APPROACH, and POTENTIAL_RISKS.`,
};

/**
 * Cell 执行结果
 */
export interface CellExecutionResult {
  cellId: CellId;
  taskId: string;
  output: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

/**
 * Cell 运行时配置
 */
export interface CellRuntimeConfig {
  maxRetries: number;
  timeoutMs: number;
}

const DEFAULT_RUNTIME_CONFIG: CellRuntimeConfig = {
  maxRetries: 1,
  timeoutMs: 30_000,
};

/**
 * Cell Runtime — 单个 Cell 的执行引擎
 *
 * 每个 CellRuntime 实例绑定一个 CellId，在 Synapse 上订阅消息，
 * 收到任务消息后调用 LLM 执行并返回结果。
 */
export class CellRuntime {
  private readonly cellId: CellId;
  private readonly synapse: SynapseProtocol;
  private readonly llm: LLMProvider;
  private readonly config: CellRuntimeConfig;
  private readonly onLog?: (msg: string) => void;

  private running = false;
  private unsubscribe?: () => void;
  private pendingResults: Map<string, CellExecutionResult> = new Map();

  constructor(
    cellId: CellId,
    synapse: SynapseProtocol,
    llm: LLMProvider,
    config?: Partial<CellRuntimeConfig>,
    onLog?: (msg: string) => void,
  ) {
    this.cellId = cellId;
    this.synapse = synapse;
    this.llm = llm;
    this.config = { ...DEFAULT_RUNTIME_CONFIG, ...config };
    this.onLog = onLog;
  }

  /**
   * 启动 Cell — 订阅 Synapse 消息
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    // 订阅发给这个 Cell 的 request 消息
    this.unsubscribe = this.synapse.subscribe(
      this.cellId,
      'request',
      (message) => this.handleMessage(message),
    );

    this.synapse.heartbeat(this.cellId);
    this.log(`Cell ${this.cellId.id} started`);
  }

  /**
   * 停止 Cell — 取消订阅
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.log(`Cell ${this.cellId.id} stopped`);
  }

  /**
   * 是否运行中
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * 获取 CellId
   */
  getCellId(): CellId {
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

    this.log(`Cell ${this.cellId.id} executing: ${task.slice(0, 50)}...`);

    try {
      const systemPrompt = CELL_SYSTEM_PROMPTS[this.cellId.type] ?? CELL_SYSTEM_PROMPTS[CellType.Prime];
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

      this.log(`Cell ${this.cellId.id} completed in ${durationMs}ms`);
      return executionResult;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.log(`Cell ${this.cellId.id} failed: ${errorMsg}`);
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
    this.onLog?.(`[CellRuntime] ${msg}`);
  }
}

/**
 * CellRuntimePool — 管理多个活跃的 Cell Runtime
 *
 * 生命周期：spawn → start → (execute/消息驱动) → stop
 */
export class CellRuntimePool {
  private readonly runtimes: Map<string, CellRuntime> = new Map();
  private readonly synapse: SynapseProtocol;
  private readonly llm: LLMProvider;
  private readonly config: Partial<CellRuntimeConfig>;
  private readonly onLog?: (msg: string) => void;

  constructor(
    synapse: SynapseProtocol,
    llm: LLMProvider,
    config?: Partial<CellRuntimeConfig>,
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
  spawn(type: CellType, task?: string): CellRuntime {
    const cellId: CellId = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      instance: 0,
    };

    // 注册到 Synapse
    this.synapse.registerCell(cellId, {
      name: cellId.id,
      capabilities: this.getCapabilities(type),
      maxLoad: 5,
    });

    // 创建 Runtime
    const runtime = new CellRuntime(
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
        this.synapse.unregisterCell(runtime.getCellId());
      } catch {
        // 可能已注销
      }
    }
  }

  /**
   * 获取所有活跃的 Runtime
   */
  getActive(): CellRuntime[] {
    return Array.from(this.runtimes.values()).filter((r) => r.isRunning());
  }

  /**
   * 获取指定 Runtime
   */
  get(cellId: string): CellRuntime | undefined {
    return this.runtimes.get(cellId);
  }

  /**
   * 停止所有 Cell
   */
  stopAll(): void {
    for (const runtime of this.runtimes.values()) {
      runtime.stop();
      try {
        this.synapse.unregisterCell(runtime.getCellId());
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
  private getCapabilities(type: CellType): string[] {
    switch (type) {
      case CellType.Researcher:
        return ['research', 'analysis', 'investigation'];
      case CellType.Artisan:
        return ['coding', 'implementation', 'building'];
      case CellType.Negotiator:
        return ['coordination', 'communication', 'diplomacy'];
      case CellType.Evolver:
        return ['optimization', 'evolution', 'improvement'];
      case CellType.Critic:
        return ['evaluation', 'verification', 'risk-assessment'];
      case CellType.Explorer:
        return ['hypothesis-generation', 'novelty-detection', 'divergent-thinking'];
      default:
        return ['general'];
    }
  }
}
