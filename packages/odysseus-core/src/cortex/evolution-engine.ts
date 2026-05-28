/**
 * Cortex - 演化引擎实现
 *
 * 达尔文演化：变异→选择→遗传
 */

import type {
  ColumnProfile,
  PersonalityGenes,
  PreferenceGenes,
  StrategyGenes,
  Skill,
  Mutation,
  MutationType,
  FitnessScore,
} from './types.js';

/**
 * 演化候选
 */
export interface EvolutionCandidate {
  dna: ColumnProfile;
  mutations: Mutation[];
}

/**
 * 反思结果（用于适应度评估）
 */
export interface FitnessReflectionOutcome {
  success: boolean;
  userRating?: number;
  executionTime: number;
  tokensUsed: number;
  errorCount: number;
}

/**
 * 演化引擎配置
 */
export interface EngineEvolutionConfig {
  mutationRate: number;
  crossoverProbability: number;
  selectionPressure: number;
  populationLimit: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: EngineEvolutionConfig = {
  mutationRate: 0.15,
  crossoverProbability: 0.6,
  selectionPressure: 0.7,
  populationLimit: 20,
};

/**
 * 演化引擎
 *
 * 实现达尔文演化算法：变异→选择→遗传
 */
export class EvolutionEngine {
  private config: EngineEvolutionConfig;
  private fitnessHistory: Map<string, FitnessScore[]> = new Map();
  private skillRepository: Map<string, Skill> = new Map();

  constructor(config: Partial<EngineEvolutionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 达尔文演化主循环
   */
  evolve(population: ColumnProfile[]): EvolutionCandidate[] {
    const candidates: EvolutionCandidate[] = [];

    for (const dna of population) {
      // 根据适应度决定是否演化
      const history = this.fitnessHistory.get(dna.id) ?? [];
      const avgFitness =
        history.length > 0
          ? history.reduce((sum, f) => sum + f.overall, 0) / history.length
          : 0.5;

      // 低适应度的 DNA 更容易变异
      const mutationChance = this.config.mutationRate * (1 - avgFitness * 0.5);
      if (Math.random() < mutationChance) {
        const mutatedDna = this.mutate(dna);
        const mutation = this.createMutationRecord('point', dna.id, mutatedDna.id);
        candidates.push({ dna: mutatedDna, mutations: [mutation] });
      }
    }

    // 执行交叉
    for (let i = 0; i < population.length - 1; i += 2) {
      if (Math.random() < this.config.crossoverProbability) {
        const child = this.crossover(population[i], population[i + 1]);
        const mutation = this.createMutationRecord(
          'crossover',
          population[i].id,
          child.id,
        );
        candidates.push({ dna: child, mutations: [mutation] });
      }
    }

    return candidates;
  }

  /**
   * 变异：随机修改 DNA 子集
   */
  private mutate(dna: ColumnProfile): ColumnProfile {
    const mutationType = Math.random();

    return {
      ...dna,
      id: `${dna.id}-m${Date.now()}`,
      version: dna.version + 1,
      personality: this.mutatePersonality(dna.personality),
      preferences: this.mutatePreferences(dna.preferences),
      strategies: this.mutateStrategies(dna.strategies),
    };
  }

  /**
   * 变异人格基因
   */
  private mutatePersonality(personality: PersonalityGenes): PersonalityGenes {
    const delta = () => (Math.random() - 0.5) * 0.1;

    return {
      openness: this.clamp(personality.openness + delta(), 0, 1),
      conscientiousness: this.clamp(personality.conscientiousness + delta(), 0, 1),
      extraversion: this.clamp(personality.extraversion + delta(), 0, 1),
      agreeableness: this.clamp(personality.agreeableness + delta(), 0, 1),
      neuroticism: this.clamp(personality.neuroticism + delta(), 0, 1),
      curiosity: this.clamp(personality.curiosity + delta(), 0, 1),
      riskTolerance: this.clamp(personality.riskTolerance + delta(), 0, 1),
      persistence: this.clamp(personality.persistence + delta(), 0, 1),
    };
  }

  /**
   * 变异偏好基因
   */
  private mutatePreferences(preferences: PreferenceGenes): PreferenceGenes {
    return {
      ...preferences,
      customWeights: {
        ...preferences.customWeights,
        // 随机调整一个权重
        [this.randomKey(preferences.customWeights) ?? 'default']:
          Math.random(),
      },
    };
  }

  /**
   * 变异策略基因
   */
  private mutateStrategies(strategies: StrategyGenes): StrategyGenes {
    return {
      ...strategies,
      // 偶尔更换策略
      ...(Math.random() < 0.2
        ? { evolutionStrategy: this.randomStrategy() }
        : {}),
    };
  }

  /**
   * 交叉：两个 DNA 交换片段
   */
  private crossover(a: ColumnProfile, b: ColumnProfile): ColumnProfile {
    const child: ColumnProfile = {
      id: `${a.id}-${b.id}-x${Date.now()}`,
      version: Math.max(a.version, b.version) + 1,
      personality: this.crossoverPersonality(a.personality, b.personality),
      preferences: Math.random() < 0.5 ? a.preferences : b.preferences,
      strategies: this.crossoverStrategies(a.strategies, b.strategies),
      skillIds: this.crossoverSkillIds(a.skillIds, b.skillIds),
      memoryAnchor: Math.random() < 0.5 ? a.memoryAnchor : b.memoryAnchor,
    };

    return child;
  }

  /**
   * 交叉人格基因（取平均）
   */
  private crossoverPersonality(
    a: PersonalityGenes,
    b: PersonalityGenes,
  ): PersonalityGenes {
    return {
      openness: (a.openness + b.openness) / 2,
      conscientiousness: (a.conscientiousness + b.conscientiousness) / 2,
      extraversion: (a.extraversion + b.extraversion) / 2,
      agreeableness: (a.agreeableness + b.agreeableness) / 2,
      neuroticism: (a.neuroticism + b.neuroticism) / 2,
      curiosity: (a.curiosity + b.curiosity) / 2,
      riskTolerance: (a.riskTolerance + b.riskTolerance) / 2,
      persistence: (a.persistence + b.persistence) / 2,
    };
  }

  /**
   * 交叉策略基因
   */
  private crossoverStrategies(
    a: StrategyGenes,
    b: StrategyGenes,
  ): StrategyGenes {
    const result: StrategyGenes = {
      planningStrategy: Math.random() < 0.5 ? a.planningStrategy : b.planningStrategy,
      problemSolvingStrategy: Math.random() < 0.5 ? a.problemSolvingStrategy : b.problemSolvingStrategy,
      riskStrategy: Math.random() < 0.5 ? a.riskStrategy : b.riskStrategy,
      negotiationStrategy: Math.random() < 0.5 ? a.negotiationStrategy : b.negotiationStrategy,
      evolutionStrategy: Math.random() < 0.5 ? a.evolutionStrategy : b.evolutionStrategy,
    };

    return result;
  }

  /**
   * 交叉 Skill 集合（并集去重）
   */
  private crossoverSkillIds(a: string[], b: string[]): string[] {
    return [...new Set([...a, ...b])];
  }

  /**
   * 选择：适应度评估
   */
  select(candidates: EvolutionCandidate[], fitnessScores: FitnessScore[]): ColumnProfile[] {
    // 按适应度排序
    const sorted = candidates
      .map((candidate, i) => ({ candidate, fitness: fitnessScores[i] ?? { overall: 0 } }))
      .sort((a, b) => b.fitness.overall - a.fitness.overall);

    // 根据选择压力选择前 N 个
    const selectCount = Math.ceil(
      sorted.length * this.config.selectionPressure,
    );
    return sorted.slice(0, selectCount).map((item) => item.candidate.dna);
  }

  /**
   * 评估适应度
   */
  evaluateFitness(dna: ColumnProfile, history: FitnessReflectionOutcome[]): FitnessScore {
    if (history.length === 0) {
      return {
        overall: 0.5,
        taskSuccess: 0.5,
        userSatisfaction: 0.5,
        efficiency: 0.5,
        adaptability: 0.5,
        evolutionPotential: 0.5,
      };
    }

    const recentHistory = history.slice(-20); // 最近 20 次

    const taskSuccess =
      recentHistory.filter((h) => h.success).length / recentHistory.length;

    const userSatisfaction =
      recentHistory
        .filter((h) => h.userRating !== undefined)
        .reduce((sum, h) => sum + (h.userRating ?? 0), 0) /
      (recentHistory.filter((h) => h.userRating !== undefined).length || 1);

    const avgExecutionTime =
      recentHistory.reduce((sum, h) => sum + h.executionTime, 0) /
      recentHistory.length;
    const efficiency = Math.max(0, 1 - avgExecutionTime / 30000); // 30s 为基准

    const adaptability =
      1 -
      recentHistory.reduce((sum, h) => sum + h.errorCount, 0) /
        (recentHistory.length * 10);

    const evolutionPotential =
      (dna.personality.curiosity + dna.personality.persistence) / 2;

    const overall =
      (taskSuccess * 0.3 +
        userSatisfaction * 0.3 +
        efficiency * 0.15 +
        adaptability * 0.15 +
        evolutionPotential * 0.1);

    const fitness: FitnessScore = {
      overall,
      taskSuccess,
      userSatisfaction,
      efficiency,
      adaptability,
      evolutionPotential,
    };

    // 记录历史
    const existing = this.fitnessHistory.get(dna.id) ?? [];
    existing.push(fitness);
    this.fitnessHistory.set(dna.id, existing.slice(-100)); // 保留最近 100 条

    return fitness;
  }

  /**
   * 创建变异记录
   */
  private createMutationRecord(
    type: MutationType,
    parentId: string,
    childId: string,
  ): Mutation {
    return {
      id: `mut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      type,
      description: `${type} mutation from ${parentId} to ${childId}`,
      impact: 0, // 将在评估后更新
    };
  }

  /**
   * 限制范围
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * 获取随机键
   */
  private randomKey(obj: Record<string, unknown>): string | undefined {
    const keys = Object.keys(obj);
    return keys[Math.floor(Math.random() * keys.length)];
  }

  /**
   * 随机策略
   */
  private randomStrategy(): string {
    const strategies = ['exploration', 'exploitation', 'balanced', 'adaptive'];
    return strategies[Math.floor(Math.random() * strategies.length)];
  }

  /**
   * 获取适应度历史
   */
  getFitnessHistory(dnaId: string): FitnessScore[] {
    return this.fitnessHistory.get(dnaId) ?? [];
  }

  /**
   * 清理历史
   */
  clearHistory(dnaId?: string): void {
    if (dnaId) {
      this.fitnessHistory.delete(dnaId);
    } else {
      this.fitnessHistory.clear();
    }
  }
}
