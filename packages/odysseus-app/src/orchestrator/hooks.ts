/**
 * Agent Lifecycle Hooks (v2)
 *
 * 借鉴 Claude Code 的 Hooks 架构，提供：
 * 1. 30+ 生命周期事件（覆盖 session/tool/context/permission 等全生命周期）
 * 2. 多类型 handler（Command/Function/HTTP/Prompt）
 * 3. 条件系统（matcher + if 条件过滤）
 * 4. 带超时和结果反馈的执行模型
 */

// ─── 事件类型 ────────────────────────────────────────

/**
 * 生命周期事件类型（v2 — 33 events）
 *
 * 分为 5 个域：
 * - Session: 会话生命周期
 * - Tool: 工具执行
 * - Context: 上下文管理
 * - Permission: 权限控制
 * - Cognitive: 认知子系统
 */
export type LifecycleEvent =
  // Session 域
  | 'session:start'
  | 'session:end'
  | 'session:resume'
  | 'session:pause'
  // Boot/Shutdown
  | 'boot:start'
  | 'boot:complete'
  | 'shutdown:start'
  | 'shutdown:complete'
  // Cycle 域
  | 'cycle:start'
  | 'cycle:end'
  | 'input:received'
  | 'input:processed'
  | 'user:prompt-submit'
  | 'user:prompt-expansion'
  // LLM 域
  | 'llm:call'
  | 'llm:response'
  | 'llm:error'
  // Tool 域
  | 'tool:execute'
  | 'tool:result'
  | 'tool:error'
  | 'tool:blocked'
  | 'tool:batch-complete'
  // Context 域
  | 'context:pre-compact'
  | 'context:post-compact'
  | 'context:file-changed'
  | 'context:config-changed'
  // Permission 域
  | 'permission:request'
  | 'permission:denied'
  | 'permission:granted'
  // Cognitive 域
  | 'memory:store'
  | 'memory:recall'
  | 'cell:spawn'
  | 'cell:destroy'
  | 'plugin:loaded'
  | 'plugin:unloaded'
  | 'goal:created'
  | 'goal:completed'
  | 'delegate:start'
  | 'delegate:complete'
  | 'error:pipeline';

// ─── Payload 类型 ────────────────────────────────────

export type LifecyclePayload = Record<string, unknown>;

// ─── Handler 类型 ─────────────────────────────────────

/**
 * Hook 执行结果
 *
 * handler 可以返回 HookResult 来影响后续流程：
 * - block: 阻止当前操作（用于 PreToolUse 等前置事件）
 * - allow: 显式允许（用于权限控制）
 * - continue: 默认行为，不影响流程
 * - data: 返回修改后的数据（用于 payload 修改）
 */
export type HookResult =
  | { action: 'block'; reason?: string }
  | { action: 'allow' }
  | { action: 'continue' }
  | { action: 'data'; payload: LifecyclePayload }
  | void;

/**
 * 基础 handler 类型（向后兼容）
 */
export type FunctionHandler = (payload: LifecyclePayload) => Promise<HookResult> | HookResult | Promise<void> | void;

/**
 * Command handler — 执行 shell 命令
 *
 * 输入通过 stdin 传入 JSON，输出从 stdout 读取。
 * Exit code 0 = continue, 2 = block, 其他 = error。
 */
export interface CommandHandler {
  type: 'command';
  command: string;
  /** 超时 ms */
  timeout?: number;
  /** 是否异步执行（不阻塞主流程） */
  async?: boolean;
}

/**
 * HTTP handler — 发送 HTTP POST
 */
export interface HttpHandler {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
  /** 超时 ms */
  timeout?: number;
}

/**
 * Prompt handler — 单轮 LLM 评估
 */
export interface PromptHandler {
  type: 'prompt';
  prompt: string;
  /** 使用哪个 model（默认使用当前 provider） */
  model?: string;
}

/**
 * Handler 联合类型
 */
export type HookHandler = FunctionHandler | CommandHandler | HttpHandler | PromptHandler;

/** @deprecated Use FunctionHandler instead */
export type LifecycleHandler = FunctionHandler;

// ─── Hook 注册 ────────────────────────────────────────

/**
 * Hook 注册选项
 */
export interface HookOptions {
  /** 事件匹配模式（正则字符串或精确匹配） */
  matcher?: string;
  /** 条件表达式（对 payload 字段的判断） */
  condition?: Record<string, unknown>;
  /** 超时 ms */
  timeout?: number;
  /** 是否异步执行 */
  async?: boolean;
  /** 优先级（数字越小越先执行） */
  priority?: number;
}

/**
 * Hook 注册条目
 */
export interface HookRegistration {
  id: string;
  event: LifecycleEvent;
  handler: HookHandler;
  options: HookOptions;
}

/**
 * 订阅凭证（向后兼容接口）
 */
export interface LifecycleSubscription {
  event: LifecycleEvent;
  handler: FunctionHandler;
}

// ─── Hook 执行引擎 ────────────────────────────────────

/**
 * 生命周期钩子系统 (v2)
 *
 * 支持多种 handler 类型、条件过滤、matcher 匹配和执行结果反馈。
 * 保持向后兼容：原有的 `on(event, functionHandler)` 接口不变。
 */
export class LifecycleHooks {
  private handlers: Map<LifecycleEvent, Set<FunctionHandler>> = new Map();
  private registrations: HookRegistration[] = [];
  private nextId = 0;
  private static readonly DEFAULT_TIMEOUT = 30_000;

  /**
   * 注册高级 hook（v2 接口）
   *
   * 支持 matcher、condition、多类型 handler。
   * 返回 hook ID，可用于取消注册。
   */
  register(event: LifecycleEvent, handler: HookHandler, options?: HookOptions): string {
    const id = `hook-${this.nextId++}`;
    this.registrations.push({ id, event, handler, options: options ?? {} });
    this.registrations.sort((a, b) => (a.options.priority ?? 100) - (b.options.priority ?? 100));
    return id;
  }

  /**
   * 取消注册 hook
   */
  unregister(id: string): boolean {
    const idx = this.registrations.findIndex(r => r.id === id);
    if (idx >= 0) {
      this.registrations.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * 订阅生命周期事件（v1 兼容接口）
   */
  on(event: LifecycleEvent, handler: FunctionHandler): LifecycleSubscription {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return { event, handler };
  }

  /**
   * 取消订阅（v1 兼容接口）
   */
  off(subscription: LifecycleSubscription): void {
    const set = this.handlers.get(subscription.event);
    if (set) {
      set.delete(subscription.handler);
    }
  }

  /**
   * 触发事件
   *
   * 执行所有匹配的 v1 和 v2 handlers。
   * 对于前置事件（pre-*），支持 block 反馈。
   * v1 handlers 始终返回 continue（向后兼容）。
   */
  async emit(event: LifecycleEvent, payload: LifecyclePayload = {}): Promise<HookResult> {
    // 执行 v1 handlers
    const v1Result = await this.executeV1Handlers(event, payload);
    if (v1Result && 'action' in v1Result && v1Result.action === 'block') return v1Result;

    // 执行 v2 registrations
    const v2Result = await this.executeV2Registrations(event, payload);
    if (v2Result && 'action' in v2Result && v2Result.action === 'block') return v2Result;

    return { action: 'continue' };
  }

  /**
   * 获取某个事件的订阅数（v1 + v2 总计）
   */
  listenerCount(event: LifecycleEvent): number {
    const v1 = this.handlers.get(event)?.size ?? 0;
    const v2 = this.registrations.filter(r => r.event === event).length;
    return v1 + v2;
  }

  /**
   * 移除所有处理器
   */
  clear(): void {
    this.handlers.clear();
    this.registrations = [];
  }

  /**
   * 获取所有注册的 hooks
   */
  getRegistrations(): ReadonlyArray<Readonly<HookRegistration>> {
    return this.registrations;
  }

  // ─── 内部执行方法 ────────────────────────────────

  private async executeV1Handlers(event: LifecycleEvent, payload: LifecyclePayload): Promise<HookResult | null> {
    const set = this.handlers.get(event);
    if (!set) return null;

    for (const handler of set) {
      try {
        const result = await handler(payload);
        if (result && typeof result === 'object' && 'action' in result) {
          if (result.action === 'block') return result as HookResult;
        }
      } catch {
        // 处理器错误不阻断其他处理器
      }
    }
    return null;
  }

  private async executeV2Registrations(event: LifecycleEvent, payload: LifecyclePayload): Promise<HookResult | null> {
    const matched = this.registrations.filter(r =>
      r.event === event && this.matchCondition(r, payload)
    );

    for (const reg of matched) {
      try {
        const result = await this.executeHandler(reg.handler, payload, reg.options.timeout);
        if (result && typeof result === 'object' && 'action' in result) {
          if (result.action === 'block') return result;
        }
      } catch {
        // 处理器错误不阻断其他处理器
      }
    }
    return null;
  }

  private async executeHandler(handler: HookHandler, payload: LifecyclePayload, timeout?: number): Promise<HookResult> {
    if (typeof handler === 'function') {
      return await handler(payload) ?? { action: 'continue' };
    }

    switch (handler.type) {
      case 'command':
        return await this.executeCommandHandler(handler, payload, timeout);
      case 'http':
        return await this.executeHttpHandler(handler, payload, timeout);
      case 'prompt':
        // Prompt handlers 需要 LLM provider，当前返回 continue
        // 后续在 agent.ts 中集成时实现
        return { action: 'continue' };
      default:
        return { action: 'continue' };
    }
  }

  private async executeCommandHandler(handler: CommandHandler, payload: LifecyclePayload, timeout?: number): Promise<HookResult> {
    const ms = timeout ?? handler.timeout ?? LifecycleHooks.DEFAULT_TIMEOUT;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);

    try {
      const { executeHooksCommand } = await import('./hooks-executor.js');
      return await executeHooksCommand(handler.command, payload, { timeout: ms, signal: controller.signal });
    } catch {
      return { action: 'continue' };
    } finally {
      clearTimeout(timer);
    }
  }

  private async executeHttpHandler(handler: HttpHandler, payload: LifecyclePayload, timeout?: number): Promise<HookResult> {
    const ms = timeout ?? handler.timeout ?? LifecycleHooks.DEFAULT_TIMEOUT;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);

    try {
      const response = await fetch(handler.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...handler.headers },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
        if (data.action === 'block') return { action: 'block', reason: String(data.reason ?? '') };
        if (data.action === 'data' && data.payload) return { action: 'data', payload: data.payload as LifecyclePayload };
      }
      return { action: 'continue' };
    } catch {
      return { action: 'continue' };
    } finally {
      clearTimeout(timer);
    }
  }

  private matchCondition(reg: HookRegistration, payload: LifecyclePayload): boolean {
    const { matcher, condition } = reg.options;

    // matcher: 检查 payload 中的 tool 字段
    if (matcher) {
      const target = String(payload.tool ?? payload.name ?? '');
      try {
        const regex = new RegExp(matcher);
        if (!regex.test(target)) return false;
      } catch {
        if (target !== matcher) return false;
      }
    }

    // condition: 检查 payload 字段值
    if (condition) {
      for (const [key, value] of Object.entries(condition)) {
        if (payload[key] !== value) return false;
      }
    }

    return true;
  }
}
