/**
 * Hippocampus - 记忆引擎核心类型
 *
 * 超越 RAG 的类脑记忆系统
 */

/**
 * 记忆层级
 */
export enum MemoryLayer {
  Working = 'working',       // 工作记忆 - 意识流本身
  Episodic = 'episodic',     // 情节记忆 - 叙事 episode
  Semantic = 'semantic',     // 语义记忆 - 知识图谱
  Procedural = 'procedural', // 程序记忆 - 编译的 Skill
  Prospective = 'prospective', // 前瞻记忆 - 定时/承诺
  Dream = 'dream',           // 梦境记忆 - 梦中整合的洞见
}

/**
 * 情节记忆 - 叙事 episode
 */
export interface Episode {
  id: string;
  timestamp: number;
  title: string;
  narrative: string;
  emotionalWeight: number; // 情感权重 [0, 1]
  tags: string[];
  associations: string[]; // 关联的其他记忆 ID
  decayRate: number; // 遗忘速率
  accessCount: number; // 访问次数
}

/**
 * 语义记忆 - 知识图谱节点
 */
export interface SemanticNode {
  id: string;
  type: SemanticNodeType;
  label: string;
  properties: Record<string, unknown>;
  relations: SemanticRelation[];
  strength: number; // 联想强度
}

export type SemanticNodeType =
  | 'entity'
  | 'concept'
  | 'event'
  | 'relation'
  | 'skill';

export interface SemanticRelation {
  to: string; // 目标节点 ID
  type: string; // 关系类型
  weight: number;
}

/**
 * 程序记忆 - 编译的 Skill
 */
export interface ProceduralMemory {
  id: string;
  skillId: string;
  compiled: boolean;
  fastPath: boolean; // 是否为快速路径
  usageCount: number;
  lastUsed: number;
}

/**
 * 前瞻记忆 - 定时任务/承诺
 */
export interface ProspectiveMemory {
  id: string;
  type: 'timer' | 'promise' | 'todo';
  triggerTime: number;
  description: string;
  priority: number;
  completed: boolean;
}

/**
 * 工作记忆 - 当前意识流状态
 */
export interface WorkingMemory {
  currentFocus: string | null;
  activeContext: string[];
  shortTermBuffer: string[];
  capacity: number;
}

/**
 * 梦境记忆 - 梦中整合的洞见和创意
 *
 * 在 Dream cycle 中由情节记忆和语义记忆
 * 融合生成的创造性产出。
 */
export interface DreamMemory {
  id: string;
  timestamp: number;
  /** 梦的主题 */
  theme: string;
  /** 梦中生成的洞见 */
  insights: string[];
  /** 梦中创建的关联 */
  associations: Array<{ from: string; to: string; strength: number }>;
  /** 情感基调 [-1, 1] */
  emotionalValence: number;
  /** 来源 episode IDs */
  sourceEpisodes: string[];
  /** 是否已整合到长期记忆 */
  consolidated: boolean;
}

/**
 * 联想扩散查询
 */
export interface AssociativeQuery {
  seed: string; // 起始节点 ID
  depth: number; // 扩散深度
  threshold: number; // 激活阈值
  limit: number; // 结果限制
}

/**
 * 联想扩散结果
 */
export interface AssociativeResult {
  nodes: SemanticNode[];
  episodes: Episode[];
  relevanceScore: number;
}

// ============================================================
// Autobiographical Narrative System (自传体叙事)
// ============================================================

/**
 * 自传体叙事 - agent 的"人生故事"
 *
 * 将分散的 episodes 编织为连贯的自我叙事，
 * 使 agent 跨 session 保持身份连续性。
 */
export interface AutobiographicalNarrative {
  /** 核心身份声明（缓慢演化） */
  identityStatement: string;
  /** 人生章节（按时间排序） */
  chapters: NarrativeChapter[];
  /** 当前活跃主题 */
  activeThemes: string[];
  /** 用户关系摘要 */
  relationships: RelationshipNarrative[];
  /** 最后更新时间 */
  lastUpdated: number;
}

/**
 * 叙事章节
 */
export interface NarrativeChapter {
  id: string;
  title: string;
  /** 2-3 句叙事摘要 */
  summary: string;
  startTime: number;
  endTime: number;
  /** 引用的 Episode ID */
  keyEpisodes: string[];
  /** 情感基调描述 */
  emotionalTone: string;
  /** 重要性 [0, 1] */
  significance: number;
}

/**
 * 用户关系叙事
 */
export interface RelationshipNarrative {
  userId: string;
  /** 关系摘要 */
  summary: string;
  /** 共享经历数量 */
  sharedExperiences: number;
  /** 信任度 [0, 1] */
  trustLevel: number;
  /** 沟通风格描述 */
  communicationStyle: string;
  /** 最后互动时间 */
  lastInteraction: number;
}
