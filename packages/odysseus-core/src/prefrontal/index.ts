/**
 * Prefrontal Cortex - 前额叶皮层
 *
 * Agent 的自主规划和决策模块 —— "思考大脑"
 *
 * 将反应式响应转变为规划性行动
 */

// 类型导出
export type {
  Goal,
  GoalStatus,
  Plan,
  PlanStrategy,
  PlanStep,
  StepStatus,
  StepResult,
  RiskLevel,
  RiskFactor,
  RiskAssessment,
  Alternative,
  Decision,
  PrefrontalConfig,
} from './types.js';

// 常量导出
export { DEFAULT_PREFRONTAL_CONFIG } from './types.js';

// 类导出
export { Planner } from './planner.js';
export { PlanExecutor } from './executor.js';
export { RiskAssessor } from './risk.js';
export { DecisionEngine } from './decision.js';

// Iterative Refiner — execute → evaluate → adjust loop
export {
  IterativeRefiner,
  DEFAULT_REFINER_CONFIG,
} from './iterative-refiner.js';
export type {
  QualityMetric,
  RefinementStrategy,
  EvaluationResult,
  RefinementRound,
  IterativeRefinerConfig,
} from './iterative-refiner.js';
