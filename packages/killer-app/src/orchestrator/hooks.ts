/**
 * Agent Lifecycle Hooks
 *
 * 提供 Agent 生命周期事件的发布/订阅机制。
 * 插件、中间件和其他模块通过此系统响应 agent 行为变化。
 */

/**
 * 生命周期事件类型
 */
export type LifecycleEvent =
  | 'boot:start'
  | 'boot:complete'
  | 'shutdown:start'
  | 'shutdown:complete'
  | 'cycle:start'
  | 'cycle:end'
  | 'llm:call'
  | 'llm:response'
  | 'llm:error'
  | 'tool:execute'
  | 'tool:result'
  | 'tool:blocked'
  | 'memory:store'
  | 'memory:recall'
  | 'cell:spawn'
  | 'cell:destroy'
  | 'plugin:loaded'
  | 'plugin:unloaded'
  | 'goal:created'
  | 'goal:completed'
  | 'input:received'
  | 'input:processed'
  | 'delegate:start'
  | 'delegate:complete'
  | 'error:pipeline';

/**
 * 事件载荷
 */
export type LifecyclePayload = Record<string, unknown>;

/**
 * 事件处理器
 */
export type LifecycleHandler = (payload: LifecyclePayload) => Promise<void> | void;

/**
 * 订阅凭证（用于取消订阅）
 */
export interface LifecycleSubscription {
  event: LifecycleEvent;
  handler: LifecycleHandler;
}

/**
 * 生命周期钩子系统
 */
export class LifecycleHooks {
  private handlers: Map<LifecycleEvent, Set<LifecycleHandler>> = new Map();

  /**
   * 订阅生命周期事件
   */
  on(event: LifecycleEvent, handler: LifecycleHandler): LifecycleSubscription {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return { event, handler };
  }

  /**
   * 取消订阅
   */
  off(subscription: LifecycleSubscription): void {
    const set = this.handlers.get(subscription.event);
    if (set) {
      set.delete(subscription.handler);
    }
  }

  /**
   * 触发事件（按注册顺序执行所有处理器）
   */
  async emit(event: LifecycleEvent, payload: LifecyclePayload = {}): Promise<void> {
    const set = this.handlers.get(event);
    if (!set) return;

    for (const handler of set) {
      try {
        await handler(payload);
      } catch {
        // 处理器错误不阻断其他处理器
      }
    }
  }

  /**
   * 获取某个事件的订阅数
   */
  listenerCount(event: LifecycleEvent): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  /**
   * 移除所有处理器
   */
  clear(): void {
    this.handlers.clear();
  }
}
