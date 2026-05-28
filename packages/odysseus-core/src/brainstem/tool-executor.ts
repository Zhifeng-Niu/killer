/**
 * Tool Executor - 工具执行器核心
 *
 * 定义工具接口和执行器，不包含具体工具实现
 */

/**
 * 工具接口
 */
export interface Tool {
  name: string;
  description: string;
  execute(params: unknown): Promise<ToolResult>;
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
   * 执行工具
   */
  async execute(name: string, params: unknown): Promise<ToolResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${name}`,
      };
    }

    try {
      return await tool.execute(params);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Tool execution failed: ${message}`,
      };
    }
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
  getInfo(name: string): { name: string; description: string } | null {
    const tool = this.tools.get(name);
    if (!tool) return null;
    return {
      name: tool.name,
      description: tool.description,
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
