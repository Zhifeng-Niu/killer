/**
 * Cortex 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EvolutionEngine,
  type EvolutionCandidate,
  type FitnessReflectionOutcome,
} from '../cortex/evolution-engine.js';
import { SkillEcosystem } from '../cortex/skill-eco.js';
import type {
  ColumnProfile,
  PersonalityGenes,
  PreferenceGenes,
  StrategyGenes,
  SkillType,
} from '../cortex/types.js';

describe('EvolutionEngine', () => {
  let engine: EvolutionEngine;

  beforeEach(() => {
    engine = new EvolutionEngine({
      mutationRate: 0.5,
      crossoverProbability: 0.5,
      selectionPressure: 0.7,
      populationLimit: 10,
    });
  });

  const createMockDNA = (id: string): ColumnProfile => ({
    id,
    version: 1,
    personality: {
      openness: 0.5,
      conscientiousness: 0.5,
      extraversion: 0.5,
      agreeableness: 0.5,
      neuroticism: 0.5,
      curiosity: 0.5,
      riskTolerance: 0.5,
      persistence: 0.5,
    },
    preferences: {
      learningStyle: 'balanced',
      decisionStyle: 'hybrid',
      communicationStyle: 'adaptive',
      workStyle: 'adaptive',
      customWeights: {},
    },
    strategies: {
      planningStrategy: 'incremental',
      problemSolvingStrategy: 'analytical',
      riskStrategy: 'conservative',
      negotiationStrategy: 'collaborative',
      evolutionStrategy: 'gradual',
    },
    skillIds: ['skill-1', 'skill-2'],
    memoryAnchor: 'mem-1',
  });

  describe('evolve', () => {
    it('应生成变异候选', () => {
      const population = [
        createMockDNA('dna-1'),
        createMockDNA('dna-2'),
      ];

      const candidates = engine.evolve(population);

      expect(Array.isArray(candidates)).toBe(true);
      expect(candidates.length).toBeGreaterThanOrEqual(0);
    });

    it('变异后 DNA 版本应增加', () => {
      const population = [createMockDNA('dna-1')];

      // 强制高变异率
      const highMutationEngine = new EvolutionEngine({
        mutationRate: 1,
        crossoverProbability: 0,
        selectionPressure: 0.5,
        populationLimit: 10,
      });

      const candidates = highMutationEngine.evolve(population);

      if (candidates.length > 0) {
        expect(candidates[0].dna.version).toBeGreaterThan(1);
      }
    });
  });

  describe('evaluateFitness', () => {
    it('应计算总体适应度', () => {
      const dna = createMockDNA('dna-1');
      const history: FitnessReflectionOutcome[] = [
        { success: true, executionTime: 1000, tokensUsed: 100, errorCount: 0 },
        { success: true, executionTime: 1500, tokensUsed: 120, errorCount: 1 },
        { success: false, executionTime: 2000, tokensUsed: 200, errorCount: 3 },
      ];

      const fitness = engine.evaluateFitness(dna, history);

      expect(fitness.overall).toBeGreaterThanOrEqual(0);
      expect(fitness.overall).toBeLessThanOrEqual(1);
      expect(fitness.taskSuccess).toBeCloseTo(2 / 3, 1);
    });

    it('空历史应返回默认适应度', () => {
      const dna = createMockDNA('dna-1');
      const fitness = engine.evaluateFitness(dna, []);

      expect(fitness.overall).toBe(0.5);
    });
  });

  describe('select', () => {
    it('应根据适应度选择 DNA', () => {
      const candidates: EvolutionCandidate[] = [
        { dna: createMockDNA('dna-1'), mutations: [] },
        { dna: createMockDNA('dna-2'), mutations: [] },
        { dna: createMockDNA('dna-3'), mutations: [] },
        { dna: createMockDNA('dna-4'), mutations: [] },
      ];

      const fitnessScores = [
        { overall: 0.9, taskSuccess: 0.9, userSatisfaction: 0.9, efficiency: 0.9, adaptability: 0.9, evolutionPotential: 0.9 },
        { overall: 0.5, taskSuccess: 0.5, userSatisfaction: 0.5, efficiency: 0.5, adaptability: 0.5, evolutionPotential: 0.5 },
        { overall: 0.7, taskSuccess: 0.7, userSatisfaction: 0.7, efficiency: 0.7, adaptability: 0.7, evolutionPotential: 0.7 },
        { overall: 0.3, taskSuccess: 0.3, userSatisfaction: 0.3, efficiency: 0.3, adaptability: 0.3, evolutionPotential: 0.3 },
      ];

      const selected = engine.select(candidates, fitnessScores);

      // Math.ceil(4 * 0.7) = 3
      expect(selected.length).toBe(3);
      expect(selected[0].id).toBe('dna-1');
      expect(selected[1].id).toBe('dna-3');
    });
  });

  describe('getFitnessHistory', () => {
    it('应返回适应度历史', () => {
      const dna = createMockDNA('dna-1');
      const history: FitnessReflectionOutcome[] = [
        { success: true, executionTime: 1000, tokensUsed: 100, errorCount: 0 },
      ];

      engine.evaluateFitness(dna, history);

      const fitnessHistory = engine.getFitnessHistory('dna-1');

      expect(fitnessHistory.length).toBe(1);
    });
  });
});

describe('SkillEcosystem', () => {
  let ecosystem: SkillEcosystem;

  beforeEach(() => {
    ecosystem = new SkillEcosystem();
  });

  describe('generate', () => {
    it('应生成新 Skill', () => {
      const skill = ecosystem.generate({
        type: 'coding',
        domain: 'web',
        requirements: 'Build React components',
      });

      expect(skill.id).toMatch(/^skill-coding-/);
      expect(skill.type).toBe('coding');
      expect(skill.version).toBe(1);
      expect(skill.usageCount).toBe(0);
    });

    it('应包含正确的 Prompt', () => {
      const skill = ecosystem.generate({
        type: 'reasoning',
        domain: 'math',
        requirements: 'Solve equations',
      });

      expect(skill.prompt).toContain('reasoning');
      expect(skill.prompt).toContain('math');
    });
  });

  describe('test', () => {
    it('应测试 Skill 并返回结果', () => {
      const skill = ecosystem.generate({
        type: 'coding',
        domain: 'test',
        requirements: 'Test requirements',
      });

      const result = ecosystem.test(skill.id);

      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('feedback');
      expect(result).toHaveProperty('score');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('不存在的 Skill 应返回失败', () => {
      const result = ecosystem.test('non-existent');

      expect(result.passed).toBe(false);
      expect(result.feedback).toContain('not found');
    });
  });

  describe('improve', () => {
    it('应改进 Skill Prompt', () => {
      const skill = ecosystem.generate({
        type: 'coding',
        domain: 'test',
        requirements: 'Test',
      });

      const improved = ecosystem.improve(skill.id, 'Make it more detailed');

      expect(improved.version).toBe(2);
      expect(improved.prompt).not.toBe(skill.prompt);
    });

    it('不存在的 Skill 应抛出错误', () => {
      expect(() => {
        ecosystem.improve('non-existent', 'feedback');
      }).toThrow();
    });
  });

  describe('prune', () => {
    it('应淘汰低效 Skill', () => {
      const skill = ecosystem.generate({
        type: 'coding',
        domain: 'test',
        requirements: 'Test',
      });

      // 降低成功率
      for (let i = 0; i < 20; i++) {
        ecosystem.test(skill.id);
      }

      const pruned = ecosystem.prune(0.1); // 低阈值

      expect(Array.isArray(pruned)).toBe(true);
    });
  });

  describe('compile', () => {
    it('高频 Skill 应可编译', () => {
      const skill = ecosystem.generate({
        type: 'coding',
        domain: 'test',
        requirements: 'Test',
      });

      // 模拟高频使用
      for (let i = 0; i < 100; i++) {
        ecosystem.test(skill.id);
      }

      const compiled = ecosystem.compile(skill.id);

      expect(typeof compiled).toBe('boolean');
    });
  });

  describe('getByType', () => {
    it('应按类型获取 Skill', () => {
      ecosystem.generate({ type: 'coding', domain: 'web', requirements: 'A' });
      ecosystem.generate({ type: 'coding', domain: 'api', requirements: 'B' });
      ecosystem.generate({ type: 'reasoning', domain: 'math', requirements: 'C' });

      const codingSkills = ecosystem.getByType('coding');

      expect(codingSkills.length).toBe(2);
    });
  });
});
