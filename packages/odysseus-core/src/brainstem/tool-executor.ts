/**
 * Tool Executor - 工具执行器核心
 *
 * 定义工具接口和执行器，不包含具体工具实现
 */

/**
 * 工具执行进度
 */
export type ToolProgress = {
  type: 'start' | 'progress' | 'stdout' | 'stderr' | 'complete';
  message?: string;
  percentage?: number;
  timestamp: number;
};

/**
 * 进度回调类型
 */
export type ToolProgressCallback = (progress: ToolProgress) => void;

/**
 * 工具接口
 */
export interface Tool {
  name: string;
  description: string;
  execute(params: unknown, onProgress?: ToolProgressCallback): Promise<ToolResult>;

  /**
   * 是否为只读工具（不修改外部状态）。
   * 只读工具可以并行执行。
   * 默认 false。
   */
  isReadOnly?(params: unknown): boolean;

  /**
   * 是否可以与其他工具并发执行。
   * 比 isReadOnly 更精细的控制。
   * 默认与 isReadOnly 相同。
   */
  isConcurrencySafe?(params: unknown): boolean;
}

/**
 * 工具执行结果
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * 批量执行中的单个结果
 */
export interface BatchToolCall {
  name: string;
  params: unknown;
  id?: string;
}

/**
 * 批量执行结果
 */
export interface BatchToolResult {
  name: string;
  id?: string;
  result: ToolResult;
  durationMs: number;
  parallel: boolean;
}

/**
 * 判断工具是否只读
 */
function toolIsReadOnly(tool: Tool, params: unknown): boolean {
  if (tool.isConcurrencySafe) return tool.isConcurrencySafe(params);
  if (tool.isReadOnly) return tool.isReadOnly(params);
  return false;
}

/**
 * 工具执行器
 */
export class ToolExecutor {
  private tools: Map<string, Tool>;

  constructor() {
    this.tools = new Map();
  }

  /**
   * 注册工具
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * 注销工具
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * 执行单个工具
   */
  async execute(name: string, params: unknown, onProgress?: ToolProgressCallback): Promise<ToolResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${name}`,
      };
    }

    onProgress?.({ type: 'start', message: `Executing ${name}`, timestamp: Date.now() });

    try {
      const result = await tool.execute(params, onProgress);
      onProgress?.({ type: 'complete', message: result.success ? 'Done' : `Failed: ${result.error}`, timestamp: Date.now() });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onProgress?.({ type: 'complete', message: `Error: ${message}`, timestamp: Date.now() });
      return {
        success: false,
        error: `Tool execution failed: ${message}`,
      };
    }
  }

  /**
   * 批量执行工具调用 — 只读工具并行，写工具串行
   *
   * 分区策略（来自 Claude Code 的启发）：
   * 1. 将所有 toolCalls 分为 readOnly 和 write 两组
   * 2. readOnly 工具通过 Promise.all 并行执行
   * 3. write 工具逐个串行执行
   * 4. 合并结果，保持原始调用顺序
   */
  async executeBatch(
    calls: BatchToolCall[],
    onProgress?: (name: string, progress: ToolProgress) => void,
  ): Promise<BatchToolResult[]> {
    if (calls.length === 0) return [];

    // 单个调用直接走 execute
    if (calls.length === 1) {
      const call = calls[0];
      const start = Date.now();
      const result = await this.execute(call.name, call.params, onProgress
        ? (p) => onProgress(call.name, p)
        : undefined);
      return [{ name: call.name, id: call.id, result, durationMs: Date.now() - start, parallel: false }];
    }

    // 分区：readOnly vs write
    const readOnlyCalls: BatchToolCall[] = [];
    const writeCalls: BatchToolCall[] = [];

    for (const call of calls) {
      const tool = this.tools.get(call.name);
      if (tool && toolIsReadOnly(tool, call.params)) {
        readOnlyCalls.push(call);
      } else {
        writeCalls.push(call);
      }
    }

    // 构建原始顺序的索引映射，用于最终排序
    const orderMap = new Map<string, number>();
    for (let i = 0; i < calls.length; i++) {
      orderMap.set(calls[i].id ?? calls[i].name + ':' + i, i);
    }

    const results: BatchToolResult[] = [];

    // 并行执行只读工具
    if (readOnlyCalls.length > 0) {
      const parallelResults = await Promise.all(
        readOnlyCalls.map(async (call) => {
          const start = Date.now();
          const result = await this.execute(call.name, call.params, onProgress
            ? (p) => onProgress(call.name, p)
            : undefined);
          return { name: call.name, id: call.id, result, durationMs: Date.now() - start, parallel: true };
        }),
      );
      results.push(...parallelResults);
    }

    // 串行执行写工具
    for (const call of writeCalls) {
      const start = Date.now();
      const result = await this.execute(call.name, call.params, onProgress
        ? (p) => onProgress(call.name, p)
        : undefined);
      results.push({ name: call.name, id: call.id, result, durationMs: Date.now() - start, parallel: false });
    }

    // 按原始调用顺序排序返回
    results.sort((a, b) => {
      const keyA = a.id ?? a.name;
      const keyB = b.id ?? b.name;
      return (orderMap.get(keyA) ?? 0) - (orderMap.get(keyB) ?? 0);
    });

    return results;
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 获取所有已注册工具名称
   */
  list(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 获取工具数量
   */
  size(): number {
    return this.tools.size;
  }

  /**
   * 获取工具信息
   */
  getInfo(name: string): { name: string; description: string; readOnly: boolean } | null {
    const tool = this.tools.get(name);
    if (!tool) return null;
    return {
      name: tool.name,
      description: tool.description,
      readOnly: tool.isReadOnly?.({}) ?? false,
    };
  }

  /**
   * 批量注册工具
   */
  registerAll(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }
}
