/**
 * Skills - Skill 生态类型定义
 *
 * 动态 Skill 生态
 */

/**
 * Skill 生命周期状态
 */
export enum SkillLifecycle {
  Generating = 'generating',
  Testing = 'testing',
  Active = 'active',
  Improving = 'improving',
  Compiled = 'compiled',
  Deprecated = 'deprecated',
  Removed = 'removed',
}

/**
 * 核心 Skill 类型引用（避免循环依赖）
 * 完整定义见 @odysseus/core
 */
export interface CoreSkillRef {
  id: string;
  name: string;
  type: string;
  version: number;
}

/**
 * Skill 生态元数据（应用层扩展）
 */
export interface SkillEcosystemMetadata {
  /**
   * 引用核心 Skill
   */
  coreSkill: CoreSkillRef;

  /**
   * 生命周期状态
   */
  lifecycle: SkillLifecycle;

  /**
   * 使用上下文
   */
  usageContext: UsageContext[];

  /**
   * 依赖关系
   */
  dependencies: string[]; // Skill ID 列表

  /**
   * 被依赖关系
   */
  dependents: string[]; // Skill ID 列表
}

/**
 * 使用上下文
 */
export interface UsageContext {
  domain: string;
  frequency: number;
  lastUsed: number;
  successRate: number;
}

/**
 * Skill 生成配置
 */
export interface SkillGenerationConfig {
  /**
   * 目标领域
   */
  targetDomain: string;

  /**
   * 生成策略
   */
  strategy: 'from_scratch' | 'template' | 'evolution' | 'fusion';

  /**
   * 约束条件
   */
  constraints: SkillConstraint[];

  /**
   * 父 Skill IDs（用于进化/融合）
   */
  parentIds?: string[];

  /**
   * 自定义提示词（用于从外部反馈生成技能）
   */
  customPrompt?: string;
}

/**
 * Skill 约束
 */
export interface SkillConstraint {
  type: 'max_tokens' | 'timeout' | 'memory' | 'safety';
  value: number | string;
}

/**
 * Skill 改进配置
 */
export interface SkillImprovementConfig {
  /**
   * 改进模式
   */
  mode: 'incremental' | 'refactor' | 'optimization';

  /**
   * 反馈数据
   */
  feedback: SkillFeedback[];

  /**
   * 改进目标
   */
  goals: ImprovementGoal[];
}

/**
 * Skill 反馈
 */
export interface SkillFeedback {
  timestamp: number;
  outcome: 'success' | 'failure' | 'partial';
  latency: number;
  userRating?: number;
  error?: string;
}

/**
 * 改进目标
 */
export interface ImprovementGoal {
  metric: 'accuracy' | 'speed' | 'efficiency' | 'clarity';
  target: number;
  current: number;
}

/**
 * Skill 编译结果
 */
export interface SkillCompilationResult {
  success: boolean;
  compiledSkillId?: string;
  compilationTime: number;
  errors: string[];
}
