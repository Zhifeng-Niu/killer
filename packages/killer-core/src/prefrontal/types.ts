/**
 * Prefrontal Cortex - 类型定义
 *
 * Agent 的自主规划和决策模块 —— "思考大脑"
 */

/**
 * 目标状态
 */
export type GoalStatus =
  | 'pending'
  | 'planning'
  | 'in_progress'
  | 'completed'
  | 'abandoned';

/**
 * 规划策略
 */
export type PlanStrategy = 'sequential' | 'parallel' | 'adaptive' | 'exploratory';

/**
 * 步骤状态
 */
export type StepStatus =
  | 'blocked'
  | 'ready'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'skipped';

/**
 * 风险等级
 */
export type RiskLevel = 'negligible' | 'low' | 'moderate' | 'high' | 'critical';

/**
 * 目标
 */
export interface Goal {
  /** 唯一标识符 */
  id: string;
  /** 目标描述 */
  description: string;
  /** 优先级 (0-1) */
  priority: number;
  /** 截止时间（可选） */
  deadline?: number;
  /** 父目标 ID（用于子目标） */
  parentGoalId?: string;
  /** 目标状态 */
  status: GoalStatus;
  /** 创建时间 */
  createdAt: number;
}

/**
 * 步骤结果
 */
export interface StepResult {
  /** 是否成功 */
  success: boolean;
  /** 输出数据 */
  output?: unknown;
  /** 错误信息 */
  error?: string;
  /** 完成时间 */
  completedAt: number;
}

/**
 * 计划步骤
 */
export interface PlanStep {
  /** 唯一标识符 */
  id: string;
  /** 步骤描述 */
  description: string;
  /** 执行顺序 */
  order: number;
  /** 依赖的步骤 ID 列表 */
  dependencies: string[];
  /** 步骤状态 */
  status: StepStatus;
  /** 关联的行动（可选） */
  action?: {
    type: string;
    payload: unknown;
  };
  /** 执行结果（可选） */
  result?: StepResult;
}

/**
 * 计划
 */
export interface Plan {
  /** 唯一标识符 */
  id: string;
  /** 关联的目标 ID */
  goalId: string;
  /** 计划步骤 */
  steps: PlanStep[];
  /** 执行策略 */
  strategy: PlanStrategy;
  /** 预计执行时长（毫秒，可选） */
  estimatedDuration?: number;
  /** 创建时间 */
  createdAt: number;
}

/**
 * 风险因子
 */
export interface RiskFactor {
  /** 因子名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 发生概率 (0-1) */
  probability: number;
  /** 影响程度 (0-1) */
  impact: number;
}

/**
 * 风险评估
 */
export interface RiskAssessment {
  /** 风险等级 */
  level: RiskLevel;
  /** 风险因子列表 */
  factors: RiskFactor[];
  /** 缓解措施 */
  mitigations: string[];
  /** 综合风险分数 (0-1) */
  overallScore: number;
}

/**
 * 替代方案
 */
export interface Alternative {
  /** 步骤 ID */
  stepId: string;
  /** 描述 */
  description: string;
  /** 预期结果 */
  expectedOutcome: string;
  /** 风险等级 */
  riskLevel: RiskLevel;
}

/**
 * 决策
 */
export interface Decision {
  /** 唯一标识符 */
  id: string;
  /** 计划 ID */
  planId: string;
  /** 选择的步骤 */
  chosenStep: PlanStep;
  /** 推理过程 */
  reasoning: string;
  /** 决策置信度 (0-1) */
  confidence: number;
  /** 风险评估 */
  riskAssessment: RiskAssessment;
  /** 替代方案 */
  alternatives: Alternative[];
  /** 决策时间 */
  decidedAt: number;
}

/**
 * 前额叶配置
 */
export interface PrefrontalConfig {
  /** 最大计划步骤数 */
  maxPlanSteps: number;
  /** 最大并发计划数 */
  maxConcurrentPlans: number;
  /** 风险容忍度 (0-1) */
  riskTolerance: number;
  /** 规划时间窗口（毫秒） */
  planningHorizon: number;
  /** 自动放弃超时（毫秒） */
  autoAbandonTimeout: number;
}

/**
 * 默认配置
 */
export const DEFAULT_PREFRONTAL_CONFIG: PrefrontalConfig = {
  maxPlanSteps: 20,
  maxConcurrentPlans: 5,
  riskTolerance: 0.5,
  planningHorizon: 60 * 60 * 1000, // 1 小时
  autoAbandonTimeout: 24 * 60 * 60 * 1000, // 24 小时
};
