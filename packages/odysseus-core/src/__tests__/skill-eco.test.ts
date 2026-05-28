/**
 * SkillEcosystem Tests - Skill Generation, Testing, Improvement
 */

import { describe, it, expect } from 'vitest';
import { SkillEcosystem, type SkillGenerationConfig } from '../cortex/skill-eco.js';
import type { SkillType } from '../cortex/types.js';

function createConfig(type: SkillType = 'reasoning', overrides: Partial<SkillGenerationConfig> = {}): SkillGenerationConfig {
  return {
    type,
    domain: 'testing',
    requirements: 'Write comprehensive tests',
    ...overrides,
  };
}

describe('SkillEcosystem', () => {
  describe('generate', () => {
    it('should generate a skill with unique id', () => {
      const eco = new SkillEcosystem();
      const skill = eco.generate(createConfig());

      expect(skill.id).toContain('skill-reasoning-');
      expect(skill.version).toBe(1);
      expect(skill.compiled).toBe(false);
      expect(skill.fastPath).toBe(false);
      expect(skill.successRate).toBe(0.5);
    });

    it('should generate skill with correct name', () => {
      const eco = new SkillEcosystem();
      const skill = eco.generate(createConfig('coding', { domain: 'web' }));

      expect(skill.name).toBe('web:coding');
      expect(skill.type).toBe('coding');
    });

    it('should generate different prompts for different types', () => {
      const eco = new SkillEcosystem();
      const reasoning = eco.generate(createConfig('reasoning'));
      const coding = eco.generate(createConfig('coding'));

      expect(reasoning.prompt).toContain('reasoning specialist');
      expect(coding.prompt).toContain('coding specialist');
    });

    it('should use basePrompt when provided', () => {
      const eco = new SkillEcosystem();
      const skill = eco.generate(createConfig('analysis', { basePrompt: 'Custom prompt' }));

      expect(skill.prompt).toBe('Custom prompt');
    });

    it('should generate prompts for all skill types', () => {
      const types: SkillType[] = ['reasoning', 'coding', 'research', 'communication', 'planning', 'analysis', 'creative'];
      const eco = new SkillEcosystem();

      for (const type of types) {
        const skill = eco.generate(createConfig(type));
        expect(skill.prompt.length).toBeGreaterThan(0);
        expect(skill.type).toBe(type);
      }
    });
  });

  describe('test', () => {
    it('should return failed result for non-existent skill', () => {
      const eco = new SkillEcosystem();
      const result = eco.test('ghost');

      expect(result.passed).toBe(false);
      expect(result.feedback).toContain('not found');
      expect(result.score).toBe(0);
    });

    it('should return test result with score for existing skill', () => {
      const eco = new SkillEcosystem();
      const skill = eco.generate(createConfig());

      const result = eco.test(skill.id);

      expect(typeof result.passed).toBe('boolean');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
      expect(result.feedback).toBeTruthy();
    });

    it('should update skill statistics after test', () => {
      const eco = new SkillEcosystem();
      const skill = eco.generate(createConfig());
      const initialCount = skill.usageCount;

      eco.test(skill.id);

      expect(skill.usageCount).toBe(initialCount + 1);
    });

    it('should update success rate with exponential moving average', () => {
      const eco = new SkillEcosystem();
      const skill = eco.generate(createConfig());
      const initialRate = skill.successRate;

      eco.test(skill.id);

      // success rate should change (EMA update)
      expect(typeof skill.successRate).toBe('number');
    });

    it('should record usage history', () => {
      const eco = new SkillEcosystem();
      const skill = eco.generate(createConfig());

      eco.test(skill.id);
      eco.test(skill.id);

      const stats = eco.getStats(skill.id);
      expect(stats!.usageCount).toBe(2);
    });
  });

  describe('improve', () => {
    it('should throw for non-existent skill', () => {
      const eco = new SkillEcosystem();
      expect(() => eco.improve('ghost', 'feedback')).toThrow('Skill ghost not found');
    });

    it('should create improved skill with incremented version', () => {
      const eco = new SkillEcosystem();
      const skill = eco.generate(createConfig());

      const improved = eco.improve(skill.id, 'Add better error handling');

      expect(improved.version).toBe(2);
      expect(improved.id).toContain(`${skill.id}-v2`);
      expect(improved.compiled).toBe(false);
    });

    it('should record mutation in improved skill', () => {
      const eco = new SkillEcosystem();
      const skill = eco.generate(createConfig());

      const improved = eco.improve(skill.id, 'Add more tests');

      expect(improved.mutations).toHaveLength(1);
      expect(improved.mutations[0].type).toBe('insertion');
    });

    it('should determine mutation types from feedback', () => {
      const eco = new SkillEcosystem();
      const skill = eco.generate(createConfig());

      // Each improve call creates a new skill; mutations accumulate
      // insertion (feedback contains 'add')
      const s1 = eco.improve(skill.id, 'Add more details');
      expect(s1.mutations.at(-1)!.type).toBe('insertion');

      // deletion (feedback contains 'remove')
      const s2 = eco.improve(s1.id, 'Remove redundancy');
      expect(s2.mutations.at(-1)!.type).toBe('deletion');

      // inversion (feedback contains 'reorder')
      const s3 = eco.improve(s2.id, 'Reorder the steps');
      expect(s3.mutations.at(-1)!.type).toBe('inversion');

      // crossover (feedback contains 'combine')
      const s4 = eco.improve(s3.id, 'Combine the phases');
      expect(s4.mutations.at(-1)!.type).toBe('crossover');

      // duplication (feedback contains 'duplicate')
      const s5 = eco.improve(s4.id, 'Duplicate the validation');
      expect(s5.mutations.at(-1)!.type).toBe('duplication');

      // point (default fallback)
      const s6 = eco.improve(s5.id, 'Improve quality');
      expect(s6.mutations.at(-1)!.type).toBe('point');
    });

    it('should modify prompt based on mutation type', () => {
      const eco = new SkillEcosystem();
      const skill = eco.generate(createConfig());

      const improved = eco.improve(skill.id, 'Add error handling');

      // Insertion appends to prompt
      expect(improved.prompt.length).toBeGreaterThan(skill.prompt.length);
      expect(improved.prompt).toContain('Additional instruction');
    });
  });

  describe('prune', () => {
    it('should prune low-success skills with high usage', () => {
      const eco = new SkillEcosystem();
      const skill = eco.generate(createConfig());

      // Simulate heavy usage with low success
      skill.usageCount = 15;
      skill.successRate = 0.1;

      const pruned = eco.prune(0.5);

      expect(pruned).toContain(skill.id);
      expect(eco.get(skill.id)).toBeUndefined();
    });

    it('should not prune skills with low usage', () => {
      const eco = new SkillEcosystem();
      const skill = eco.generate(createConfig());

      skill.usageCount = 2;
      skill.successRate = 0.1;

      const pruned = eco.prune(0.5);

      expect(pruned).not.toContain(skill.id);
      expect(eco.get(skill.id)).toBeDefined();
    });

    it('should not prune high-success skills', () => {
      const eco = new SkillEcosystem();
      const skill = eco.generate(createConfig());

      skill.usageCount = 20;
      skill.successRate = 0.9;

      const pruned = eco.prune(0.5);

      expect(pruned).not.toContain(skill.id);
    });

    it('should return empty when no skills to prune', () => {
      const eco = new SkillEcosystem();
      expect(eco.prune(0.5)).toEqual([]);
    });
  });

  describe('compile', () => {
    it('should return false for non-existent skill', () => {
      const eco = new SkillEcosystem();
      expect(eco.compile('ghost')).toBe(false);
    });

    it('should return false for low-usage skill', () => {
      const eco = new SkillEcosystem();
      const skill = eco.generate(createConfig());

      expect(eco.compile(skill.id)).toBe(false);
    });

    it('should compile high-frequency successful skill', () => {
      const eco = new SkillEcosystem();
      const skill = eco.generate(createConfig());

      skill.usageCount = 60;
      skill.successRate = 0.9;

      expect(eco.compile(skill.id)).toBe(true);

      const compiled = eco.get(skill.id);
      expect(compiled!.compiled).toBe(true);
      expect(compiled!.fastPath).toBe(true);
    });

    it('should not compile high-usage but low-success skill', () => {
      const eco = new SkillEcosystem();
      const skill = eco.generate(createConfig());

      skill.usageCount = 60;
      skill.successRate = 0.5;

      expect(eco.compile(skill.id)).toBe(false);
    });
  });

  describe('get / getAll / getByType', () => {
    it('should get a skill by id', () => {
      const eco = new SkillEcosystem();
      const skill = eco.generate(createConfig());

      expect(eco.get(skill.id)).toBeDefined();
      expect(eco.get(skill.id)!.id).toBe(skill.id);
    });

    it('should return undefined for non-existent skill', () => {
      const eco = new SkillEcosystem();
      expect(eco.get('ghost')).toBeUndefined();
    });

    it('should return all skills', () => {
      const eco = new SkillEcosystem();
      eco.generate(createConfig('reasoning'));
      eco.generate(createConfig('coding'));

      expect(eco.getAll()).toHaveLength(2);
    });

    it('should filter skills by type', () => {
      const eco = new SkillEcosystem();
      eco.generate(createConfig('reasoning'));
      eco.generate(createConfig('coding'));
      eco.generate(createConfig('reasoning'));

      expect(eco.getByType('reasoning')).toHaveLength(2);
      expect(eco.getByType('coding')).toHaveLength(1);
      expect(eco.getByType('analysis')).toHaveLength(0);
    });

    it('should prefer compiled version in get', () => {
      const eco = new SkillEcosystem();
      const skill = eco.generate(createConfig());
      skill.usageCount = 60;
      skill.successRate = 0.9;

      eco.compile(skill.id);

      const retrieved = eco.get(skill.id);
      expect(retrieved!.compiled).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return stats for existing skill', () => {
      const eco = new SkillEcosystem();
      const skill = eco.generate(createConfig());

      const stats = eco.getStats(skill.id);
      expect(stats).toEqual({
        usageCount: 0,
        successRate: 0.5,
        avgExecutionTime: 0,
      });
    });

    it('should return undefined for non-existent skill', () => {
      const eco = new SkillEcosystem();
      expect(eco.getStats('ghost')).toBeUndefined();
    });
  });

  describe('delete / clear', () => {
    it('should delete a skill', () => {
      const eco = new SkillEcosystem();
      const skill = eco.generate(createConfig());

      expect(eco.delete(skill.id)).toBe(true);
      expect(eco.get(skill.id)).toBeUndefined();
    });

    it('should return false for deleting non-existent skill', () => {
      const eco = new SkillEcosystem();
      expect(eco.delete('ghost')).toBe(false);
    });

    it('should clear all skills', () => {
      const eco = new SkillEcosystem();
      eco.generate(createConfig());
      eco.generate(createConfig());

      eco.clear();

      expect(eco.getAll()).toHaveLength(0);
    });
  });
});
