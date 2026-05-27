/**
 * Persona - 人格基因组类型定义
 *
 * DNA 解析与表达、镜像神经元、用户建模
 */

/**
 * 核心 DNA 类型引用（避免循环依赖）
 * 完整定义见 @killer/core
 */
export interface CoreDNARef {
  id: string;
  version: number;
}

/**
 * 人格基因组（应用层扩展）
 */
export interface PersonaGenome {
  // 继承核心 DNA
  coreDNA: CoreDNARef;

  // 镜像神经元数据
  mirrorNeuron: MirrorNeuronData;

  // 用户模型
  userModel: UserModel;

  // 人格表达
  expression: PersonalityExpression;
}

/**
 * 镜像神经元数据 - 学习用户行为
 */
export interface MirrorNeuronData {
  /**
   * 观察到的用户行为模式
   */
  observedPatterns: UserBehaviorPattern[];

  /**
   * 模仿偏好
   */
  imitationBias: ImitationBias;

  /**
   * 同步程度 [0, 1]
   */
  syncLevel: number;
}

/**
 * 用户行为模式
 */
export interface UserBehaviorPattern {
  id: string;
  pattern: string;
  frequency: number;
  context: string[];
  lastObserved: number;
}

/**
 * 模仿偏好
 */
export interface ImitationBias {
  communicationStyle: number; // [0, 1]
  decisionPattern: number; // [0, 1]
  workRhythm: number; // [0, 1]
  aestheticPreference: number; // [0, 1]
}

/**
 * 用户模型（Hermes Honcho 启发）
 */
export interface UserModel {
  /**
   * 用户 ID
   */
  userId: string;

  /**
   * 交互历史摘要
   */
  interactionSummary: InteractionSummary;

  /**
   * 偏好画像
   */
  preferenceProfile: PreferenceProfile;

  /**
   * 信任度 [0, 1]
   */
  trustLevel: number;
}

/**
 * 交互历史摘要
 */
export interface InteractionSummary {
  totalInteractions: number;
  avgResponseTime: number;
  satisfactionScore: number;
  commonTopics: string[];
}

/**
 * 偏好画像
 */
export interface PreferenceProfile {
  verbosity: 'concise' | 'balanced' | 'detailed';
  formality: 'casual' | 'neutral' | 'formal';
  proactivity: 'reactive' | 'suggested' | 'autonomous';
  humor: number; // [0, 1]
  /** 策略效果追踪 — 记录哪种策略组合效果更好 */
  strategyScores?: StrategyScores;
}

/**
 * 策略效果评分
 *
 * 追踪不同响应策略的效果，用运行平均更新。
 * 分数范围 [0, 1]，越高表示效果越好。
 */
export interface StrategyScores {
  /** 详细 vs 简洁 的效果分数 */
  detailVsConcise: number;
  /** 分析性 vs 直觉性 的效果分数 */
  analyticalVsIntuitive: number;
  /** 主动 vs 被动 的效果分数 */
  proactiveVsReactive: number;
  /** 样本数（用于置信度判断） */
  sampleCount: number;
}

/**
 * 人格表达
 */
export interface PersonalityExpression {
  name: string;
  avatar: string;
  tagline: string;
  voiceStyle: VoiceStyle;
  quirks: string[];
}

export type VoiceStyle =
  | 'professional'
  | 'friendly'
  | 'witty'
  | 'philosophical'
  | 'technical'
  | 'warm';

// ============================================================
// Emotional State System (Russell's Circumplex Model)
// ============================================================

/**
 * 基本情绪类型（Plutchik 八大基本情绪）
 */
export type PrimaryEmotion =
  | 'joy'
  | 'sadness'
  | 'anger'
  | 'fear'
  | 'surprise'
  | 'disgust'
  | 'trust'
  | 'anticipation';

/**
 * 情感向量（三维：愉悦度、激活度、控制感）
 * 基于 Russell 环形情绪模型 + PAD 模型
 */
export interface EmotionalVector {
  /** 愉悦度 [-1, 1]：负=不悦，正=愉悦 */
  valence: number;
  /** 激活度 [-1, 1]：低=平静，高=兴奋 */
  arousal: number;
  /** 控制感 [-1, 1]：低=顺从，高=主导 */
  dominance: number;
}

/**
 * 情感状态快照
 */
export interface EmotionalState {
  /** 当前情感向量 */
  current: EmotionalVector;
  /** 当前主导情绪 */
  primaryEmotion: PrimaryEmotion;
  /** 情绪强度 [0, 1] */
  intensity: number;
  /** 心情基线（缓慢移动） */
  mood: EmotionalVector;
  /** 近期情感事件 */
  emotionalMemory: EmotionalEvent[];
  /** 最后更新时间 */
  lastUpdated: number;
}

/**
 * 情感事件记录
 */
export interface EmotionalEvent {
  id: string;
  timestamp: number;
  /** 触发原因 */
  trigger: string;
  /** 产生的情绪 */
  emotion: PrimaryEmotion;
  /** 情绪强度 */
  intensity: number;
  /** 上下文描述 */
  context: string;
  /** 解决方式（可选） */
  resolution?: string;
}

/**
 * 情感基线配置（个体的情感"性格"）
 */
export interface EmotionalProfile {
  /** 默认情感基线 */
  baseline: EmotionalVector;
  /** 情绪波动率 [0, 1]：越高情绪变化越快 */
  volatility: number;
  /** 情绪恢复速率 [0, 1]：越高越快回归基线 */
  recoveryRate: number;
  /** 各情绪的倾向性 */
  emotionalRange: Partial<Record<PrimaryEmotion, number>>;
}

// ============================================================
// Predictive User Model (预测性用户模型)
// ============================================================

/**
 * 预测的用户需求
 */
export interface PredictedNeed {
  /** 需求描述 */
  description: string;
  /** 置信度 [0, 1] */
  confidence: number;
  /** 触发条件 */
  triggerConditions: string[];
  /** 建议响应 */
  suggestedResponse: string;
  /** 预测时间范围 */
  timeHorizon: 'immediate' | 'short' | 'medium';
}

/**
 * 交流模式
 */
export interface CommunicationPattern {
  /** 模式名称 */
  name: string;
  /** 频率 */
  frequency: number;
  /** 典型时间 */
  typicalTimes: string[];
  /** 平均长度 */
  avgLength: 'short' | 'medium' | 'long';
  /** 情感基调 */
  emotionalTone: string;
}

/**
 * 心理画像推断
 */
export interface PsychologicalProfile {
  /** 大五人格推断（简化版） */
  openness: number;
  conscientiousness: number;
  extraversion: number;
  /** 决策风格 */
  decisionStyle: 'analytical' | 'intuitive' | 'balanced';
  /** 信息处理偏好 */
  informationPreference: 'detailed' | 'summary' | 'visual';
  /** 风险偏好 */
  riskTolerance: number;
}

/**
 * 预测结果
 */
export interface PredictionResult {
  /** 预测的需求 */
  predictedNeeds: PredictedNeed[];
  /** 检测到的交流模式 */
  communicationPatterns: CommunicationPattern[];
  /** 心理画像 */
  psychologicalProfile: PsychologicalProfile;
  /** 上次更新 */
  lastUpdated: number;
}
