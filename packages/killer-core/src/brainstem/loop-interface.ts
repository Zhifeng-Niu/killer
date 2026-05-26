/**
 * Brainstem - 主循环接口
 *
 * 永不停止的决策主循环
 */

import type { LoopState, KernelLogger } from './types.js';
import { SILENT_LOGGER } from './types.js';

/**
 * 实验航点结果 — BrainstemLoop 与 Cerebellum 的集成接口
 */
export interface ExperimentWaypointResult {
  waypoint: number;
  hypothesis: string;
  decision: 'keep' | 'discard' | 'surprise';
  terminated: boolean;
  terminationReason?: string;
}

/**
 * 实验编排器接口 — BrainstemLoop 通过此接口与 Cerebellum 交互
 *
 * 使用接口而非具体类，避免循环依赖。
 * Cerebellum 类实现了此接口。
 */
export interface IExperimentOrchestrator {
  hasActiveMission(): boolean;
  beginExperiment(hypothesis: string): Promise<import('../cerebellum/types.js').Experiment>;
  verify(experiment: import('../cerebellum/types.js').Experiment): Promise<import('../cerebellum/types.js').VerificationResult>;
  decide(
    experiment: import('../cerebellum/types.js').Experiment,
    verification: import('../cerebellum/types.js').VerificationResult,
    history: import('../cerebellum/types.js').AttemptHistory,
  ): 'keep' | 'discard' | 'surprise';
  recordOutcome(
    experiment: import('../cerebellum/types.js').Experiment,
    decision: 'keep' | 'discard' | 'surprise',
    verification: import('../cerebellum/types.js').VerificationResult,
  ): void;
  readCompass(history: import('../cerebellum/types.js').AttemptHistory): import('../cerebellum/types.js').CompassReading;
  getHistory(missionId?: string): import('../cerebellum/types.js').AttemptHistory;
  checkTermination(
    history?: import('../cerebellum/types.js').AttemptHistory,
    mission?: import('../cerebellum/types.js').Mission,
  ): { terminated: boolean; reason?: string };
  getActiveMission(): import('../cerebellum/types.js').Mission | null;
}

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
 *
 * 当实验编排器（Cerebellum）激活时，EVOLVE 阶段变为：
 *   compass → checkpoint → act → verify → decide → record
 */
export interface IBrainstemLoop {
  start(): Promise<void>;
  stop(): Promise<void>;
  getState(): LoopState;
  injectPerception(perception: import('./types.js').Perception): void;
  on(event: LoopEvent, callback: (state: LoopState) => void): void;
  runExperimentWaypoint(hypothesis: string): Promise<ExperimentWaypointResult | null>;
}

export type LoopEvent =
  | 'phaseChange'
  | 'perceptionReceived'
  | 'reasoningComplete'
  | 'actionExecuted'
  | 'reflectionComplete'
  | 'evolutionComplete'
  | 'experimentWaypoint';

/**
 * 主循环配置
 */
export interface LoopConfig {
  perceptionInterval: number;
  dreamingMode: boolean;
  maxConcurrentActions: number;
  debugLogging: boolean;
  deepReflection: boolean;
  /** 可注入的日志接口，默认静默 */
  logger?: KernelLogger;
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
  logger: SILENT_LOGGER,
};
