/**
 * Cerebellum - 实验策略编排模块
 *
 * 将 Odyssey Engine 的自主迭代能力内化为大脑区域。
 * 提供：
 * - Cerebellum: 主编排器
 * - Compass: 策略指南针
 * - Evaluator: 4层验证管道
 * - ExperimentTracker: 实验追踪
 * - CommandExecutor: 命令执行抽象接口
 */

export * from './types.js';
export type { CommandExecutor, CommandResult } from './command-executor.js';
export { Cerebellum } from './cerebellum.js';
export { Compass } from './compass.js';
export { Evaluator } from './evaluator.js';
export { ExperimentTracker } from './experiment-tracker.js';
