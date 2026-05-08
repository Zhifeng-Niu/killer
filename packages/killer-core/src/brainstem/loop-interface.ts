/**
 * Brainstem - 主循环接口
 *
 * 永不停止的决策主循环
 */

import type { LoopState } from './types.js';

/**
 * 主循环接口
 *
 * LOOP FOREVER:
 *   ① PERCEIVE — 感知环境变化
 *   ② REASON — 前额叶自主决策，不问人类
 *   ③ ACT — 执行行动
 *   ④ REFLECT — 反思结果，提取经验
 *   ⑤ EVOLVE — 演化 Skill/Prompt/策略
 *   → 回到 ①
 */
export interface IBrainstemLoop {
  /**
   * 启动永不停止的主循环
   */
  start(): Promise<void>;

  /**
   * 停止主循环（仅当人类显式中断）
   */
  stop(): Promise<void>;

  /**
   * 获取当前循环状态
   */
  getState(): LoopState;

  /**
   * 注入感知输入
   */
  injectPerception(perception: import('./types.js').Perception): void;

  /**
   * 订阅循环事件
   */
  on(event: LoopEvent, callback: (state: LoopState) => void): void;
}

export type LoopEvent =
  | 'phaseChange'
  | 'perceptionReceived'
  | 'reasoningComplete'
  | 'actionExecuted'
  | 'reflectionComplete'
  | 'evolutionComplete';

/**
 * 主循环配置
 */
export interface LoopConfig {
  /**
   * 感知轮询间隔（毫秒）
   */
  perceptionInterval: number;

  /**
   * 是否启用梦境模式
   */
  dreamingMode: boolean;

  /**
   * 最大并发行动数
   */
  maxConcurrentActions: number;

  /**
   * 是否启用调试日志
   */
  debugLogging: boolean;

  /**
   * 是否启用深度反思（LLM 驱动的结构化内省）
   * 关闭时使用轻量反思，开启时额外调用 LLM
   */
  deepReflection: boolean;
}

/**
 * 默认循环配置
 */
export const DEFAULT_LOOP_CONFIG: LoopConfig = {
  perceptionInterval: 100,
  dreamingMode: false,
  maxConcurrentActions: 5,
  debugLogging: false,
  deepReflection: false,
};
