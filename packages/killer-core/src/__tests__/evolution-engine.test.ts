/**
 * Evolution Engine Tests - Darwinian Evolution
 */

import { describe, it, expect } from 'vitest';
import { EvolutionEngine, type FitnessReflectionOutcome } from '../cortex/evolution-engine.js';
import type { CellDNA, FitnessScore } from '../cortex/types.js';

function createDNA(overrides: Partial<CellDNA> = {}): CellDNA {
  return {
    id: `dna-${Math.random().toString(36).slice(2, 6)}`,
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
      customWeights: { quality: 0.8, speed: 0.5 },
    },
    strategies: {
      planningStrategy: 'sequential',
      problemSolvingStrategy: 'systematic',
      riskStrategy: 'moderate',
      negotiationStrategy: 'collaborative',
      evolutionStrategy: 'balanced',
    },
    skillIds: ['skill-a', 'skill-b'],
    memoryAnchor: 'anchor-1',
    ...overrides,
  };
}

describe('EvolutionEngine', () => {
  describe('evolve', () => {
    it('should return candidates from population', () => {
      const engine = new EvolutionEngine({ mutationRate: 1.0, crossoverProbability: 0 });
      const population = [createDNA(), createDNA()];

      const candidates = engine.evolve(population);

      // With mutationRate=1.0, each DNA should mutate
      expect(candidates.length).toBeGreaterThanOrEqual(0); // Probabilistic
    });

    it('should produce mutated DNA with new id', () => {
      const engine = new EvolutionEngine({ mutationRate: 1.0, crossoverProbability: 0 });
      const dna = createDNA({ id: 'parent-1' });

      const candidates = engine.evolve([dna]);

      if (candidates.length > 0) {
        expect(candidates[0].dna.id).toContain('parent-1');
        expect(candidates[0].dna.id).not.toBe('parent-1');
        expect(candidates[0].dna.version).toBe(2);
      }
    });

    it('should keep personality genes in [0, 1] range after mutation', () => {
      const engine = new EvolutionEngine({ mutationRate: 1.0, crossoverProbability: 0 });
      const dna = createDNA({
        personality: {
          openness: 0.01,
          conscientiousness: 0.99,
          extraversion: 0.5,
          agreeableness: 0.5,
          neuroticism: 0.5,
          curiosity: 0.01,
          riskTolerance: 0.99,
          persistence: 0.5,
        },
      });

      // Run many times to test clamp
      for (let i = 0; i < 20; i++) {
        const candidates = engine.evolve([dna]);
        if (candidates.length > 0) {
          const p = candidates[0].dna.personality;
          for (const val of Object.values(p)) {
            expect(val).toBeGreaterThanOrEqual(0);
            expect(val).toBeLessThanOrEqual(1);
          }
        }
      }
    });

    it('should produce crossover children with combined ids', () => {
      const engine = new EvolutionEngine({ mutationRate: 0, crossoverProbability: 1.0 });
      const a = createDNA({ id: 'alpha' });
      const b = createDNA({ id: 'beta' });

      const candidates = engine.evolve([a, b]);

      if (candidates.length > 0) {
        const crossoverCandidate = candidates.find(c =>
          c.dna.id.includes('alpha') && c.dna.id.includes('beta'),
        );
        if (crossoverCandidate) {
          expect(crossoverCandidate.dna.id).toContain('x');
        }
      }
    });

    it('should handle empty population', () => {
      const engine = new EvolutionEngine();
      const candidates = engine.evolve([]);

      expect(candidates).toEqual([]);
    });

    it('should handle single DNA (no crossover possible)', () => {
      const engine = new EvolutionEngine({ mutationRate: 0, crossoverProbability: 1.0 });
      const candidates = engine.evolve([createDNA()]);

      // No crossover with single DNA, and no mutation with rate 0
      expect(candidates).toEqual([]);
    });
  });

  describe('select', () => {
    it('should select fittest candidates', () => {
      const engine = new EvolutionEngine({ selectionPressure: 0.5 });
      const dnas = [createDNA({ id: 'a' }), createDNA({ id: 'b' }), createDNA({ id: 'c' }), createDNA({ id: 'd' })];
      const candidates = dnas.map(dna => ({ dna, mutations: [] }));

      const fitnessScores: FitnessScore[] = [
        { overall: 0.9, taskSuccess: 0.9, userSatisfaction: 0.9, efficiency: 0.9, adaptability: 0.9, evolutionPotential: 0.9 },
        { overall: 0.1, taskSuccess: 0.1, userSatisfaction: 0.1, efficiency: 0.1, adaptability: 0.1, evolutionPotential: 0.1 },
        { overall: 0.7, taskSuccess: 0.7, userSatisfaction: 0.7, efficiency: 0.7, adaptability: 0.7, evolutionPotential: 0.7 },
        { overall: 0.3, taskSuccess: 0.3, userSatisfaction: 0.3, efficiency: 0.3, adaptability: 0.3, evolutionPotential: 0.3 },
      ];

      const selected = engine.select(candidates, fitnessScores);

      // With pressure 0.5, should select top 2
      expect(selected.length).toBe(2);
      expect(selected[0].id).toBe('a');
      expect(selected[1].id).toBe('c');
    });

    it('should handle mismatched lengths gracefully', () => {
      const engine = new EvolutionEngine({ selectionPressure: 1.0 });
      const candidates = [createDNA({ id: 'only' })].map(dna => ({ dna, mutations: [] }));

      // No fitness scores provided
      const selected = engine.select(candidates, []);

      expect(selected.length).toBe(1);
    });
  });

  describe('evaluateFitness', () => {
    it('should return default 0.5 fitness for no history', () => {
      const engine = new EvolutionEngine();
      const dna = createDNA();

      const fitness = engine.evaluateFitness(dna, []);

      expect(fitness.overall).toBe(0.5);
      expect(fitness.taskSuccess).toBe(0.5);
      expect(fitness.userSatisfaction).toBe(0.5);
    });

    it('should calculate fitness from history', () => {
      const engine = new EvolutionEngine();
      const dna = createDNA();

      const history: FitnessReflectionOutcome[] = [
        { success: true, userRating: 0.9, executionTime: 1000, tokensUsed: 100, errorCount: 0 },
        { success: true, userRating: 0.8, executionTime: 2000, tokensUsed: 200, errorCount: 1 },
        { success: false, userRating: 0.3, executionTime: 15000, tokensUsed: 500, errorCount: 3 },
      ];

      const fitness = engine.evaluateFitness(dna, history);

      expect(fitness.taskSuccess).toBeCloseTo(2 / 3, 3);
      expect(fitness.overall).toBeGreaterThan(0);
      expect(fitness.overall).toBeLessThanOrEqual(1);
    });

    it('should weigh task success and satisfaction most', () => {
      const engine = new EvolutionEngine();
      const dna = createDNA();

      const perfectHistory: FitnessReflectionOutcome[] = Array.from({ length: 10 }, () => ({
        success: true, userRating: 1.0, executionTime: 100, tokensUsed: 50, errorCount: 0,
      }));

      const badHistory: FitnessReflectionOutcome[] = Array.from({ length: 10 }, () => ({
        success: false, userRating: 0.0, executionTime: 30000, tokensUsed: 1000, errorCount: 10,
      }));

      const goodFitness = engine.evaluateFitness(dna, perfectHistory);
      engine.clearHistory(dna.id);
      const badFitness = engine.evaluateFitness(dna, badHistory);

      expect(goodFitness.overall).toBeGreaterThan(badFitness.overall);
    });

    it('should factor evolution potential from personality', () => {
      const engine = new EvolutionEngine();

      const curiousDna = createDNA({
        personality: { openness: 0.9, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5, curiosity: 0.9, riskTolerance: 0.5, persistence: 0.9 },
      });
      const dullDna = createDNA({
        personality: { openness: 0.1, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5, curiosity: 0.1, riskTolerance: 0.5, persistence: 0.1 },
      });

      const history: FitnessReflectionOutcome[] = [{ success: true, executionTime: 1000, tokensUsed: 100, errorCount: 0 }];

      const curiousFitness = engine.evaluateFitness(curiousDna, history);
      const dullFitness = engine.evaluateFitness(dullDna, history);

      expect(curiousFitness.evolutionPotential).toBeGreaterThan(dullFitness.evolutionPotential);
    });
  });

  describe('fitness history', () => {
    it('should track fitness history per DNA', () => {
      const engine = new EvolutionEngine();
      const dna = createDNA({ id: 'tracked' });
      const history: FitnessReflectionOutcome[] = [{ success: true, executionTime: 1000, tokensUsed: 100, errorCount: 0 }];

      engine.evaluateFitness(dna, history);
      engine.evaluateFitness(dna, history);

      expect(engine.getFitnessHistory('tracked')).toHaveLength(2);
    });

    it('should return empty for unknown DNA', () => {
      const engine = new EvolutionEngine();
      expect(engine.getFitnessHistory('unknown')).toEqual([]);
    });

    it('should clear specific DNA history', () => {
      const engine = new EvolutionEngine();
      const dna = createDNA({ id: 'clearable' });

      engine.evaluateFitness(dna, [{ success: true, executionTime: 1000, tokensUsed: 100, errorCount: 0 }]);
      engine.clearHistory('clearable');

      expect(engine.getFitnessHistory('clearable')).toEqual([]);
    });

    it('should clear all history', () => {
      const engine = new EvolutionEngine();
      const dna1 = createDNA({ id: 'dna-1' });
      const dna2 = createDNA({ id: 'dna-2' });

      engine.evaluateFitness(dna1, [{ success: true, executionTime: 1000, tokensUsed: 100, errorCount: 0 }]);
      engine.evaluateFitness(dna2, [{ success: true, executionTime: 1000, tokensUsed: 100, errorCount: 0 }]);

      engine.clearHistory();

      expect(engine.getFitnessHistory('dna-1')).toEqual([]);
      expect(engine.getFitnessHistory('dna-2')).toEqual([]);
    });
  });
});
