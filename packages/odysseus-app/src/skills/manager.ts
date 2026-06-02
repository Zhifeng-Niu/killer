/**
 * Skill Manager - 应用层 Skill 管理
 *
 * 桥接核心 SkillEcosystem 与 LLM 执行，
 * 提供 Skill 的生成、测试、执行、改进、编译全生命周期
 */

import {
  SkillEcosystem,
  type Skill,
  type SkillType,
  type SkillTestResult,
  type SkillGenerationConfig as CoreGenConfig,
} from '@odysseus/core';
import type { LLMProvider } from '@odysseus/core';
import type {
  SkillLifecycle,
  SkillEcosystemMetadata,
  SkillGenerationConfig,
  SkillImprovementConfig,
  SkillFeedback,
  SkillCompilationResult,
} from './types.js';

/**
 * Skill 执行结果
 */
export interface SkillExecutionResult {
  skillId: string;
  output: string;
  success: boolean;
  executionTime: number;
  tokensUsed?: number;
}

/**
 * Skill 管理器
 */
export class SkillManager {
  private ecosystem: SkillEcosystem;
  private metadata: Map<string, SkillEcosystemMetadata> = new Map();
  private llm: LLMProvider | null = null;

  constructor() {
    this.ecosystem = new SkillEcosystem();
  }

  /**
   * 绑定 LLM Provider
   */
  bindLLM(provider: LLMProvider): void {
    this.llm = provider;
  }

  /**
   * 生成新 Skill
   */
  generate(config: SkillGenerationConfig): Skill {
    const coreConfig: CoreGenConfig = {
      type: this.mapStrategyToType(config.strategy, config.targetDomain),
      domain: config.targetDomain,
      requirements: config.constraints.map(c => `${c.type}: ${c.value}`).join(', '),
    };

    const skill = this.ecosystem.generate(coreConfig);

    // 如果提供了自定义提示词，覆盖生成的 prompt
    if (config.customPrompt) {
      return { ...skill, prompt: config.customPrompt };
    }

    const meta: SkillEcosystemMetadata = {
      coreSkill: {
        id: skill.id,
        name: skill.name,
        type: skill.type,
        version: skill.version,
      },
      lifecycle: 'active' as SkillLifecycle,
      usageContext: [],
      dependencies: [],
      dependents: [],
    };
    this.metadata.set(skill.id, meta);

    return skill;
  }

  /**
   * 执行 Skill（通过 LLM）
   */
  async execute(skillId: string, input: string): Promise<SkillExecutionResult> {
    const skill = this.ecosystem.get(skillId);
    if (!skill) {
      return {
        skillId,
        output: '',
        success: false,
        executionTime: 0,
      };
    }

    if (!this.llm) {
      return {
        skillId,
        output: `[No LLM bound] Skill prompt: ${skill.prompt.slice(0, 100)}`,
        success: false,
        executionTime: 0,
      };
    }

    const startTime = Date.now();
    const fullPrompt = `${skill.prompt}\n\nInput: ${input}`;

    try {
      const result = await this.llm.complete(fullPrompt);
      const executionTime = Date.now() - startTime;

      // 更新使用统计
      skill.usageCount++;

      // 记录反馈
      this.recordFeedback(skillId, {
        timestamp: Date.now(),
        outcome: 'success',
        latency: executionTime,
      });

      return {
        skillId,
        output: result.content,
        success: true,
        executionTime,
        tokensUsed: result.tokensUsed,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.recordFeedback(skillId, {
        timestamp: Date.now(),
        outcome: 'failure',
        latency: executionTime,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        skillId,
        output: '',
        success: false,
        executionTime,
      };
    }
  }

  /**
   * 测试 Skill
   */
  test(skillId: string, testCases?: string[]): SkillTestResult {
    const result = this.ecosystem.test(skillId, testCases);

    // 更新生命周期
    const meta = this.metadata.get(skillId);
    if (meta) {
      meta.lifecycle = result.passed ? 'active' as SkillLifecycle : 'improving' as SkillLifecycle;
    }

    return result;
  }

  /**
   * 改进 Skill
   */
  improve(skillId: string, config: SkillImprovementConfig): Skill {
    const feedbackSummary = config.feedback
      .map(f => `${f.outcome}: ${f.error ?? 'ok'}`)
      .join('; ');

    const improved = this.ecosystem.improve(skillId, feedbackSummary);

    // 更新元数据
    const oldMeta = this.metadata.get(skillId);
    if (oldMeta) {
      const meta: SkillEcosystemMetadata = {
        coreSkill: {
          id: improved.id,
          name: improved.name,
          type: improved.type,
          version: improved.version,
        },
        lifecycle: 'active' as SkillLifecycle,
        usageContext: oldMeta.usageContext,
        dependencies: oldMeta.dependencies,
        dependents: oldMeta.dependents,
      };
      this.metadata.set(improved.id, meta);
    }

    return improved;
  }

  /**
   * 编译高频 Skill
   */
  compile(skillId: string): SkillCompilationResult {
    const startTime = Date.now();
    const success = this.ecosystem.compile(skillId);

    if (success) {
      const meta = this.metadata.get(skillId);
      if (meta) {
        meta.lifecycle = 'compiled' as SkillLifecycle;
      }
    }

    return {
      success,
      compiledSkillId: success ? skillId : undefined,
      compilationTime: Date.now() - startTime,
      errors: success ? [] : ['Skill does not meet compilation criteria (usage > 50, successRate > 0.8)'],
    };
  }

  /**
   * 淘汰低效 Skill
   */
  prune(threshold: number = 0.3): string[] {
    const pruned = this.ecosystem.prune(threshold);

    for (const id of pruned) {
      const meta = this.metadata.get(id);
      if (meta) {
        meta.lifecycle = 'removed' as SkillLifecycle;
      }
    }

    return pruned;
  }

  /**
   * 获取 Skill
   */
  get(skillId: string): Skill | undefined {
    return this.ecosystem.get(skillId);
  }

  /**
   * 获取所有 Skill
   */
  getAll(): Skill[] {
    return this.ecosystem.getAll();
  }

  /**
   * 按类型获取
   */
  getByType(type: SkillType): Skill[] {
    return this.ecosystem.getByType(type);
  }

  /**
   * 获取 Skill 元数据
   */
  getMetadata(skillId: string): SkillEcosystemMetadata | undefined {
    return this.metadata.get(skillId);
  }

  /**
   * 获取生态统计
   */
  getStats(): { total: number; byType: Record<string, number>; avgSuccessRate: number } {
    const skills = this.ecosystem.getAll();
    const byType: Record<string, number> = {};

    let totalSuccess = 0;
    for (const skill of skills) {
      byType[skill.type] = (byType[skill.type] ?? 0) + 1;
      totalSuccess += skill.successRate;
    }

    return {
      total: skills.length,
      byType,
      avgSuccessRate: skills.length > 0 ? totalSuccess / skills.length : 0,
    };
  }

  /**
   * 获取核心生态（供高级使用）
   */
  getEcosystem(): SkillEcosystem {
    return this.ecosystem;
  }

  /**
   * 导出所有 skills 为可序列化格式
   */
  exportSkills(): Array<{ skill: Skill; metadata?: SkillEcosystemMetadata }> {
    const skills = this.ecosystem.getAll();
    return skills.map(skill => ({
      skill: { ...skill },
      metadata: this.metadata.get(skill.id),
    }));
  }

  /**
   * 从导出数据恢复 skills
   */
  importSkills(data: Array<{ skill: Skill; metadata?: SkillEcosystemMetadata }>): { restored: number; skipped: number } {
    let restored = 0;
    let skipped = 0;

    for (const item of data) {
      if (this.ecosystem.get(item.skill.id)) {
        skipped++;
        continue;
      }

      this.ecosystem.restore(item.skill);

      if (item.metadata) {
        this.metadata.set(item.skill.id, {
          ...item.metadata,
          lifecycle: 'active' as SkillLifecycle,
        });
      }

      restored++;
    }

    return { restored, skipped };
  }

  /**
   * 记录反馈
   */
  private recordFeedback(skillId: string, feedback: SkillFeedback): void {
    const meta = this.metadata.get(skillId);
    if (meta) {
      meta.usageContext.push({
        domain: skillId,
        frequency: 1,
        lastUsed: feedback.timestamp,
        successRate: feedback.outcome === 'success' ? 1 : 0,
      });
    }
  }

  /**
   * 将生成策略映射到 Skill 类型
   */
  private mapStrategyToType(strategy: string, domain: string): SkillType {
    const domainMap: Record<string, SkillType> = {
      coding: 'coding',
      code: 'coding',
      development: 'coding',
      research: 'research',
      search: 'research',
      planning: 'planning',
      communication: 'communication',
      analysis: 'analysis',
      creative: 'creative',
      reasoning: 'reasoning',
    };

    const mapped = domainMap[domain.toLowerCase()];
    if (mapped) return mapped;

    // Fallback: partial match
    for (const [key, type] of Object.entries(domainMap)) {
      if (domain.toLowerCase().includes(key)) return type;
    }

    return 'reasoning';
  }
}
