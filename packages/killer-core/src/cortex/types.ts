/**
 * Cortex - 演化引擎核心类型
 *
 * 达尔文演化：变异→选择→遗传
 */

/**
 * Cell DNA - 人格/偏好/策略的基因组
 */
export interface CellDNA {
  id: string;
  version: number;

  // 人格参数
  personality: PersonalityGenes;

  // 偏好权重
  preferences: PreferenceGenes;

  // 策略库
  strategies: StrategyGenes;

  // Skill 集合引用
  skillIds: string[];

  // 记忆索引
  memoryAnchor: string;
}

/**
 * 人格基因组
 */
export interface PersonalityGenes {
  openness: number;      // 开放性 [0, 1]
  conscientiousness: number; // 尽责性 [0, 1]
  extraversion: number;  // 外向性 [0, 1]
  agreeableness: number; // 宜人性 [0, 1]
  neuroticism: number;   // 神经质 [0, 1]

  // 特殊属性
  curiosity: number;     // 好奇心 [0, 1]
  riskTolerance: number; // 风险容忍 [0, 1]
  persistence: number;   // 坚持度 [0, 1]
}

/**
 * 偏好基因组
 */
export interface PreferenceGenes {
  // 学习偏好
  learningStyle: 'exploration' | 'exploitation' | 'balanced';

  // 决策风格
  decisionStyle: 'deliberative' | 'intuitive' | 'hybrid';

  // 通信风格
  communicationStyle: 'concise' | 'detailed' | 'adaptive';

  // 工作偏好
  workStyle: 'sequential' | 'parallel' | 'adaptive';

  // 自定义权重
  customWeights: Record<string, number>;
}

/**
 * 策略基因组
 */
export interface StrategyGenes {
  // 规划策略
  planningStrategy: string;

  // 问题解决策略
  problemSolvingStrategy: string;

  // 风险评估策略
  riskStrategy: string;

  // 协商策略
  negotiationStrategy: string;

  // 演化策略
  evolutionStrategy: string;
}

/**
 * Skill - 可演化的能力单元
 */
export interface Skill {
  id: string;
  name: string;
  type: SkillType;
  prompt: string;
  version: number;

  // 使用统计
  usageCount: number;
  successRate: number;
  avgExecutionTime: number;

  // 演化追踪
  parentId?: string;
  mutations: Mutation[];

  // 编译状态
  compiled: boolean;
  fastPath: boolean;
}

export type SkillType =
  | 'reasoning'
  | 'coding'
  | 'research'
  | 'communication'
  | 'planning'
  | 'analysis'
  | 'creative';

/**
 * 变异记录
 */
export interface Mutation {
  id: string;
  timestamp: number;
  type: MutationType;
  description: string;
  impact: number; // 对适应度的影响 [-1, 1]
}

export type MutationType =
  | 'point'        // 点突变：单个参数微调
  | 'crossover'    // 交叉：两个 DNA 重组
  | 'insertion'    // 插入：新增 Skill/策略
  | 'deletion'     // 删除：移除 Skill/策略
  | 'duplication'  // 复制：复制 Skill
  | 'inversion';   // 倒位：策略顺序反转

/**
 * 适应度评估结果
 */
export interface FitnessScore {
  overall: number; // 总体适应度 [0, 1]

  // 分项评分
  taskSuccess: number;    // 任务成功率
  userSatisfaction: number; // 用户满意度
  efficiency: number;     // 效率得分
  adaptability: number;   // 适应性得分

  // 演化潜力
  evolutionPotential: number;
}
