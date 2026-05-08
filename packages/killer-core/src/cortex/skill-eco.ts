/**
 * Cortex - Skill 生态系统
 *
 * 管理可演化的能力单元
 */

import type {
  Skill,
  SkillType,
  Mutation,
  MutationType,
} from './types.js';

/**
 * Skill 测试结果
 */
export interface SkillTestResult {
  passed: boolean;
  feedback: string;
  score: number;
  executionTime: number;
}

/**
 * Skill 生成配置
 */
export interface SkillGenerationConfig {
  type: SkillType;
  domain: string;
  requirements: string;
  basePrompt?: string;
}

/**
 * Skill 生态系统
 *
 * 管理 Skill 的生成、测试、改进、淘汰和编译
 */
export class SkillEcosystem {
  private skills: Map<string, Skill> = new Map();
  private usageHistory: Map<string, number[]> = new Map();
  private compiledCache: Map<string, Skill> = new Map();

  /**
   * 生成新 Skill
   */
  generate(config: SkillGenerationConfig): Skill {
    const skillId = `skill-${config.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const prompt = this.generatePrompt(config);

    const skill: Skill = {
      id: skillId,
      name: `${config.domain}:${config.type}`,
      type: config.type,
      prompt,
      version: 1,
      usageCount: 0,
      successRate: 0.5, // 初始值
      avgExecutionTime: 0,
      mutations: [],
      compiled: false,
      fastPath: false,
    };

    this.skills.set(skillId, skill);
    this.usageHistory.set(skillId, []);

    return skill;
  }

  /**
   * 生成 Prompt
   */
  private generatePrompt(config: SkillGenerationConfig): string {
    const templates: Record<SkillType, string> = {
      reasoning: `You are a reasoning specialist for ${config.domain}.
Requirements: ${config.requirements}
Analyze the problem step by step, consider multiple perspectives, and provide a well-reasoned conclusion.`,
      coding: `You are a coding specialist for ${config.domain}.
Requirements: ${config.requirements}
Write clean, maintainable code following best practices. Include error handling and comments where necessary.`,
      research: `You are a research specialist for ${config.domain}.
Requirements: ${config.requirements}
Investate the topic thoroughly, cite sources when applicable, and present findings in an organized manner.`,
      communication: `You are a communication specialist for ${config.domain}.
Requirements: ${config.requirements}
Communicate clearly and effectively, adapting your message to the intended audience.`,
      planning: `You are a planning specialist for ${config.domain}.
Requirements: ${config.requirements}
Create a detailed, actionable plan with clear milestones and contingencies.`,
      analysis: `You are an analysis specialist for ${config.domain}.
Requirements: ${config.requirements}
Analyze the data/situation systematically, identify patterns, and draw evidence-based conclusions.`,
      creative: `You are a creative specialist for ${config.domain}.
Requirements: ${config.requirements}
Generate innovative ideas and solutions, thinking outside conventional boundaries.`,
    };

    return config.basePrompt ?? templates[config.type];
  }

  /**
   * 测试 Skill
   */
  test(skillId: string, testCases?: string[]): SkillTestResult {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return {
        passed: false,
        feedback: `Skill ${skillId} not found`,
        score: 0,
        executionTime: 0,
      };
    }

    // 模拟测试执行
    const startTime = Date.now();
    const mockPass = Math.random() > 0.3; // 70% 通过率
    const executionTime = Date.now() - startTime + Math.random() * 1000;

    const score = mockPass ? 0.7 + Math.random() * 0.3 : Math.random() * 0.5;

    const feedback = mockPass
      ? `Skill ${skill.name} passed tests with score ${score.toFixed(2)}`
      : `Skill ${skill.name} failed tests. Issues identified in prompt clarity.`;

    // 更新 Skill 统计
    skill.usageCount++;
    skill.successRate = skill.successRate * 0.9 + score * 0.1; // 指数移动平均
    skill.avgExecutionTime =
      skill.avgExecutionTime * 0.8 + executionTime * 0.2;

    // 记录使用历史
    const history = this.usageHistory.get(skillId) ?? [];
    history.push(score);
    this.usageHistory.set(skillId, history.slice(-50));

    return {
      passed: mockPass,
      feedback,
      score,
      executionTime,
    };
  }

  /**
   * 改进 Skill
   */
  improve(skillId: string, feedback: string): Skill {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error(`Skill ${skillId} not found`);
    }

    const mutationType: MutationType = this.determineMutationType(feedback);

    const improvedPrompt = this.improvePrompt(skill.prompt, feedback, mutationType);

    const mutation: Mutation = {
      id: `mut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      type: mutationType,
      description: `Improved based on feedback: ${feedback.slice(0, 50)}...`,
      impact: 0, // 将在下次测试后更新
    };

    const improvedSkill: Skill = {
      ...skill,
      id: `${skill.id}-v${skill.version + 1}`,
      version: skill.version + 1,
      prompt: improvedPrompt,
      mutations: [...skill.mutations, mutation],
      compiled: false, // 需要重新编译
      fastPath: false,
    };

    this.skills.set(improvedSkill.id, improvedSkill);
    this.usageHistory.set(improvedSkill.id, []);

    return improvedSkill;
  }

  /**
   * 确定变异类型
   */
  private determineMutationType(feedback: string): MutationType {
    const lower = feedback.toLowerCase();

    if (lower.includes('missing') || lower.includes('add')) {
      return 'insertion';
    }
    if (lower.includes('remove') || lower.includes('delete')) {
      return 'deletion';
    }
    if (lower.includes('reorder') || lower.includes('swap')) {
      return 'inversion';
    }
    if (lower.includes('combine') || lower.includes('merge')) {
      return 'crossover';
    }
    if (lower.includes('duplicate') || lower.includes('copy')) {
      return 'duplication';
    }
    return 'point';
  }

  /**
   * 改进 Prompt
   */
  private improvePrompt(
    prompt: string,
    feedback: string,
    mutationType: MutationType,
  ): string {
    switch (mutationType) {
      case 'insertion':
        return `${prompt}\n\nAdditional instruction based on feedback: ${feedback}`;
      case 'deletion':
        // 简化：移除最后一句
        const sentences = prompt.split('.');
        return sentences.slice(0, -1).join('.') + '.';
      case 'inversion':
        // 反转指令顺序
        const lines = prompt.split('\n').filter(Boolean);
        return lines.reverse().join('\n');
      case 'point':
      default:
        // 微调：添加细化说明
        return `${prompt}\nRefinement: Be more specific and detailed in your responses.`;
    }
  }

  /**
   * 淘汰低效 Skill
   */
  prune(threshold: number): string[] {
    const pruned: string[] = [];

    for (const [id, skill] of this.skills.entries()) {
      if (skill.successRate < threshold && skill.usageCount > 10) {
        this.skills.delete(id);
        this.usageHistory.delete(id);
        this.compiledCache.delete(id);
        pruned.push(id);
      }
    }

    return pruned;
  }

  /**
   * 编译高频 Skill 为快速路径
   */
  compile(skillId: string): boolean {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return false;
    }

    // 检查是否满足编译条件
    const history = this.usageHistory.get(skillId) ?? [];
    const isHighFrequency =
      skill.usageCount > 50 && skill.successRate > 0.8;

    if (!isHighFrequency) {
      return false;
    }

    // 编译为快速路径
    const compiled: Skill = {
      ...skill,
      compiled: true,
      fastPath: true,
    };

    this.compiledCache.set(skillId, compiled);
    this.skills.set(skillId, compiled);

    return true;
  }

  /**
   * 获取 Skill
   */
  get(skillId: string): Skill | undefined {
    // 优先返回编译版本
    return this.compiledCache.get(skillId) ?? this.skills.get(skillId);
  }

  /**
   * 获取所有 Skill
   */
  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * 按类型获取 Skill
   */
  getByType(type: SkillType): Skill[] {
    return this.getAll().filter((s) => s.type === type);
  }

  /**
   * 获取使用统计
   */
  getStats(skillId: string): { usageCount: number; successRate: number; avgExecutionTime: number } | undefined {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return undefined;
    }

    return {
      usageCount: skill.usageCount,
      successRate: skill.successRate,
      avgExecutionTime: skill.avgExecutionTime,
    };
  }

  /**
   * 删除 Skill
   */
  delete(skillId: string): boolean {
    this.compiledCache.delete(skillId);
    this.usageHistory.delete(skillId);
    return this.skills.delete(skillId);
  }

  /**
   * 清空所有 Skill
   */
  clear(): void {
    this.skills.clear();
    this.usageHistory.clear();
    this.compiledCache.clear();
  }
}
