/**
 * Brainstem - 主循环核心类型定义
 *
 * 主循环：感知→推理→行动→反思→演化 (NEVER STOP)
 */

/**
 * 感知输入 - 环境变化、消息、文件、突触信号
 */
export interface Perception {
  id: string;
  timestamp: number;
  source: PerceptionSource;
  data: unknown;
  priority: PerceptionPriority;
}

export type PerceptionSource =
  | 'cli'
  | 'telegram'
  | 'discord'
  | 'file'
  | 'code'
  | 'synapse'
  | 'internal';

export type PerceptionPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * 推理结果 - LLM 调用、策略选择
 */
export interface Reasoning {
  id: string;
  timestamp: number;
  perceptionId: string;
  conclusion: string;
  confidence: number;
  suggestedActions: Action[];
}

/**
 * 行动 - 工具调用、代码修改、消息发送
 */
export interface Action {
  id: string;
  timestamp: number;
  reasoningId: string;
  type: ActionType;
  payload: unknown;
  status: ActionStatus;
}

export type ActionType =
  | 'tool_call'
  | 'code_edit'
  | 'message_send'
  | 'cell_create'
  | 'memory_store'
  | 'synapse_broadcast';

export type ActionStatus = 'pending' | 'executing' | 'completed' | 'failed';

/**
 * 反思 - 结果评估、经验提取
 */
export interface Reflection {
  id: string;
  timestamp: number;
  actionId: string;
  outcome: ReflectionOutcome;
  lessons: string[];
  adaptability: number;
  /** 情感影响评估（E3 增强反思） */
  emotionalImpact?: EmotionalImpact;
  /** 自我评估（E3 增强反思） */
  selfAssessment?: SelfAssessment;
  /** 行为调整建议（E3 增强反思） */
  behavioralAdjustments?: BehavioralAdjustment[];
}

export type ReflectionOutcome = 'success' | 'partial' | 'failure';

/**
 * 情感影响评估
 */
export interface EmotionalImpact {
  /** 对用户的情感影响 */
  userImpact: 'positive' | 'neutral' | 'negative';
  /** 对话氛围变化 */
  conversationToneChange: 'improved' | 'stable' | 'worsened';
  /** 置信度 [0, 1] */
  confidence: number;
}

/**
 * 自我评估
 */
export interface SelfAssessment {
  /** 整体自信度 [0, 1] */
  selfConfidence: number;
  /** 识别的盲区 */
  blindSpots: string[];
  /** 成长领域 */
  growthAreas: string[];
  /** 做得好的方面 */
  strengths: string[];
}

/**
 * 行为调整建议
 */
export interface BehavioralAdjustment {
  /** 调整领域 */
  domain: 'communication' | 'reasoning' | 'proactivity' | 'empathy' | 'precision';
  /** 当前行为描述 */
  currentBehavior: string;
  /** 建议改进 */
  suggestedBehavior: string;
  /** 优先级 [0, 1] */
  priority: number;
}

/**
 * 演化 - Skill 优化、DNA 变异候选
 */
export interface Evolution {
  id: string;
  timestamp: number;
  reflectionId: string;
  mutations: EvolutionMutation[];
}

/**
 * 主循环中的演化变异候选
 */
export interface EvolutionMutation {
  target: 'dna' | 'skill' | 'strategy';
  type: 'point' | 'crossover' | 'insertion' | 'deletion';
  payload: unknown;
}

/**
 * 主循环状态
 */
export interface LoopState {
  phase: LoopPhase;
  currentPerception: Perception | null;
  currentReasoning: Reasoning | null;
  currentAction: Action | null;
  currentReflection: Reflection | null;
  currentEvolution: Evolution | null;
}

export type LoopPhase = 'perceive' | 'reason' | 'act' | 'reflect' | 'evolve';

/**
 * Kernel 日志接口 — killer-core 不依赖任何外部 Logger，
 * 消费者（killer-app）在创建时注入真正的实现
 */
export interface KernelLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string, error?: unknown): void;
  error(message: string, error?: unknown): void;
}

/** 静默 Logger — 默认不输出任何日志 */
export const SILENT_LOGGER: KernelLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
