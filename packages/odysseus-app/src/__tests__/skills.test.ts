/**
 * SkillManager 测试
 *
 * 测试应用层 Skill 管理器的生成、执行、测试、改进、编译
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SkillManager, type SkillExecutionResult } from '../skills/manager.js';
import type { SkillGenerationConfig } from '../skills/types.js';

class MockLLMProvider {
  async complete(prompt: string): Promise<{ content: string; usage: unknown }> {
    return {
      content: `Mock response for: ${prompt.slice(0, 50)}`,
      usage: { promptTokens: 20, completionTokens: 10 },
    };
  }
}

describe('SkillManager', () => {
  let manager: SkillManager;

  beforeEach(() => {
    manager = new SkillManager();
  });

  describe('Generation', () => {
    it('should generate a skill', () => {
      const config: SkillGenerationConfig = {
        targetDomain: 'coding',
        strategy: 'from_scratch',
        constraints: [{ type: 'max_tokens', value: 2000 }],
      };

      const skill = manager.generate(config);

      expect(skill).toBeDefined();
      expect(skill.id).toBeTruthy();
      expect(skill.name).toContain('coding');
      expect(skill.type).toBe('coding');
      expect(skill.version).toBe(1);
    });

    it('should generate skill with evolution strategy', () => {
      const config: SkillGenerationConfig = {
        targetDomain: 'research',
        strategy: 'evolution',
        constraints: [],
      };

      const skill = manager.generate(config);

      expect(skill).toBeDefined();
      expect(skill.type).toBe('research');
    });

    it('should create metadata for generated skill', () => {
      const config: SkillGenerationConfig = {
        targetDomain: 'planning',
        strategy: 'template',
        constraints: [],
      };

      const skill = manager.generate(config);
      const meta = manager.getMetadata(skill.id);

      expect(meta).toBeDefined();
      expect(meta!.lifecycle).toBe('active');
      expect(meta!.coreSkill.id).toBe(skill.id);
    });
  });

  describe('Execution', () => {
    it('should execute skill with LLM', async () => {
      manager.bindLLM(new MockLLMProvider());

      const skill = manager.generate({
        targetDomain: 'coding',
        strategy: 'from_scratch',
        constraints: [],
      });

      const result = await manager.execute(skill.id, 'Write a hello world function');

      expect(result.success).toBe(true);
      expect(result.output).toContain('Mock response');
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should fail without LLM', async () => {
      const skill = manager.generate({
        targetDomain: 'coding',
        strategy: 'from_scratch',
        constraints: [],
      });

      const result = await manager.execute(skill.id, 'test');

      expect(result.success).toBe(false);
    });

    it('should fail for nonexistent skill', async () => {
      manager.bindLLM(new MockLLMProvider());

      const result = await manager.execute('nonexistent', 'test');

      expect(result.success).toBe(false);
    });

    it('should update usage count after execution', async () => {
      manager.bindLLM(new MockLLMProvider());

      const skill = manager.generate({
        targetDomain: 'coding',
        strategy: 'from_scratch',
        constraints: [],
      });

      expect(skill.usageCount).toBe(0);

      await manager.execute(skill.id, 'test');

      const updated = manager.get(skill.id);
      expect(updated!.usageCount).toBe(1);
    });
  });

  describe('Testing', () => {
    it('should test a skill', () => {
      const skill = manager.generate({
        targetDomain: 'coding',
        strategy: 'from_scratch',
        constraints: [],
      });

      const result = manager.test(skill.id);

      expect(result).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('should update lifecycle based on test result', () => {
      const skill = manager.generate({
        targetDomain: 'coding',
        strategy: 'from_scratch',
        constraints: [],
      });

      manager.test(skill.id);

      const meta = manager.getMetadata(skill.id);
      // Either 'active' or 'improving' based on pass/fail
      expect(['active', 'improving']).toContain(meta!.lifecycle);
    });
  });

  describe('Improvement', () => {
    it('should improve a skill', () => {
      const skill = manager.generate({
        targetDomain: 'coding',
        strategy: 'from_scratch',
        constraints: [],
      });

      const improved = manager.improve(skill.id, {
        mode: 'incremental',
        feedback: [
          { timestamp: Date.now(), outcome: 'partial', latency: 500 },
        ],
        goals: [
          { metric: 'accuracy', target: 0.9, current: 0.7 },
        ],
      });

      expect(improved.version).toBe(2);
      expect(improved.mutations.length).toBeGreaterThan(0);
    });

    it('should create metadata for improved skill', () => {
      const skill = manager.generate({
        targetDomain: 'coding',
        strategy: 'from_scratch',
        constraints: [],
      });

      const improved = manager.improve(skill.id, {
        mode: 'incremental',
        feedback: [],
        goals: [],
      });

      const meta = manager.getMetadata(improved.id);
      expect(meta).toBeDefined();
      expect(meta!.coreSkill.version).toBe(2);
    });
  });

  describe('Compilation', () => {
    it('should reject compilation for low-usage skill', () => {
      const skill = manager.generate({
        targetDomain: 'coding',
        strategy: 'from_scratch',
        constraints: [],
      });

      const result = manager.compile(skill.id);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Statistics', () => {
    it('should return ecosystem stats', () => {
      manager.generate({
        targetDomain: 'coding',
        strategy: 'from_scratch',
        constraints: [],
      });
      manager.generate({
        targetDomain: 'research',
        strategy: 'from_scratch',
        constraints: [],
      });

      const stats = manager.getStats();

      expect(stats.total).toBe(2);
      expect(stats.byType['coding']).toBe(1);
      expect(stats.byType['research']).toBe(1);
      expect(stats.avgSuccessRate).toBeGreaterThanOrEqual(0);
    });

    it('should return empty stats when no skills', () => {
      const stats = manager.getStats();

      expect(stats.total).toBe(0);
      expect(stats.avgSuccessRate).toBe(0);
    });
  });

  describe('Query', () => {
    it('should get skill by id', () => {
      const skill = manager.generate({
        targetDomain: 'coding',
        strategy: 'from_scratch',
        constraints: [],
      });

      const found = manager.get(skill.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(skill.id);
    });

    it('should get all skills', () => {
      manager.generate({ targetDomain: 'a', strategy: 'from_scratch', constraints: [] });
      manager.generate({ targetDomain: 'b', strategy: 'from_scratch', constraints: [] });

      const all = manager.getAll();
      expect(all.length).toBe(2);
    });

    it('should get skills by type', () => {
      manager.generate({ targetDomain: 'coding', strategy: 'from_scratch', constraints: [] });
      manager.generate({ targetDomain: 'research', strategy: 'from_scratch', constraints: [] });

      const coding = manager.getByType('coding');
      expect(coding.length).toBe(1);
      expect(coding[0].type).toBe('coding');
    });
  });

  describe('Prune', () => {
    it('should prune low-success skills with high usage and update lifecycle', () => {
      const skill = manager.generate({
        targetDomain: 'coding',
        strategy: 'from_scratch',
        constraints: [],
      });

      // Force low success rate and high usage count (prune requires usageCount > 10)
      const s = manager.get(skill.id)!;
      s.successRate = 0.1;
      s.usageCount = 15;

      const pruned = manager.prune(0.3);

      expect(pruned).toContain(skill.id);
      const meta = manager.getMetadata(skill.id);
      expect(meta!.lifecycle).toBe('removed');
    });

    it('should not prune high-success skills', () => {
      const skill = manager.generate({
        targetDomain: 'coding',
        strategy: 'from_scratch',
        constraints: [],
      });

      const s = manager.get(skill.id)!;
      s.successRate = 0.9;
      s.usageCount = 15;

      const pruned = manager.prune(0.3);
      expect(pruned).not.toContain(skill.id);
    });
  });

  describe('getEcosystem', () => {
    it('should return the core ecosystem', () => {
      manager.generate({ targetDomain: 'coding', strategy: 'from_scratch', constraints: [] });

      const ecosystem = manager.getEcosystem();
      expect(ecosystem).toBeDefined();
      expect(ecosystem.getAll().length).toBe(1);
    });
  });
});
