/**
 * Cortex - 演化引擎接口
 *
 * 达尔文演化：变异→选择→遗传
 */

import type {
  ColumnProfile,
  Skill,
  Mutation,
  MutationType,
  FitnessScore,
} from './types.js';

/**
 * 演化引擎接口
 */
export interface IEvolutionEngine {
  // === DNA 演化 ===
  /**
   * 生成变异候选
   */
  generateMutations(dna: ColumnProfile, count: number): Promise<Mutation[]>;

  /**
   * 应用变异到 DNA
   */
  applyMutation(dna: ColumnProfile, mutation: Mutation): Promise<ColumnProfile>;

  /**
   * DNA 交叉重组
   */
  crossover(dna1: ColumnProfile, dna2: ColumnProfile): Promise<ColumnProfile>;

  // === Skill 演化 ===
  /**
   * 评估 Skill 适应度
   */
  evaluateFitness(skill: Skill): Promise<FitnessScore>;

  /**
   * 生成 Skill 变异
   */
  evolveSkill(skill: Skill, mutationType: MutationType): Promise<Skill>;

  /**
   * 淘汰低适应度 Skill
   */
  cullSkills(skills: Skill[], threshold: number): Promise<string[]>;

  /**
   * Skill 竞争选择
   */
  selectBestSkill(skills: Skill[], context: unknown): Promise<Skill | null>;

  // === Prompt 演化 ===
  /**
   * 优化 Prompt
   */
  optimizePrompt(currentPrompt: string, feedback: string): Promise<string>;

  /**
   * 生成 Prompt 变体
   */
  generatePromptVariants(prompt: string, count: number): Promise<string[]>;

  // === 种群管理 ===
  /**
   * 获取 Cell 种群
   */
  getPopulation(): Promise<ColumnProfile[]>;

  /**
   * 创建子 Cell
   */
  fission(parentDna: ColumnProfile): Promise<ColumnProfile>;

  /**
   * 融合两个 Cell
   */
  fusion(dna1: ColumnProfile, dna2: ColumnProfile): Promise<ColumnProfile>;

  // === 适应度追踪 ===
  /**
   * 记录适应度历史
   */
  recordFitness(dnaId: string, fitness: FitnessScore): Promise<void>;

  /**
   * 获取适应度趋势
   */
  getFitnessTrend(dnaId: string): Promise<number[]>;
}

/**
 * 演化配置
 */
export interface EvolutionConfig {
  /**
   * 变异率 [0, 1]
   */
  mutationRate: number;

  /**
   * 交叉概率 [0, 1]
   */
  crossoverProbability: number;

  /**
   * 淘汰阈值
   */
  cullingThreshold: number;

  /**
   * 种群上限
   */
  populationLimit: number;

  /**
   * 演化间隔（毫秒）
   */
  evolutionInterval: number;
}

/**
 * 默认演化配置
 */
export const DEFAULT_EVOLUTION_CONFIG: EvolutionConfig = {
  mutationRate: 0.1,
  crossoverProbability: 0.3,
  cullingThreshold: 0.3,
  populationLimit: 10,
  evolutionInterval: 60000, // 1 分钟
};
