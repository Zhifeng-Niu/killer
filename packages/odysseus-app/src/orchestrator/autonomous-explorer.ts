/**
 * Autonomous Explorer — 自主探索执行器
 *
 * 把好奇心变成行动。Agent 在空闲时：
 * 1. 从 CuriosityEngine 获取一个好奇问题
 * 2. 选择探索策略
 * 3. 真正去搜索/分析/实验
 * 4. 记录发现，可能触发自我改造
 *
 * 不是"替用户查东西"，而是"我自己想去看看"。
 */

import type {
  CuriosityEngine,
  KnowledgeGap,
  ExplorationStrategy,
  ExplorationResult,
  DiscoveryEntry,
} from '@odysseus/core';

/** 最小化的 Logger 接口 */
interface ExplorerLogger {
  info(msg: string): void;
  warn(msg: string, err?: unknown): void;
}

/** ConsciousnessStream 接口 */
interface ExplorerConsciousness {
  emit(event: { type: string; source: string; data: unknown }): void;
}

/** 探索器依赖 — 通过构造函数注入 */
export interface ExplorerDeps {
  curiosity: CuriosityEngine;
  callLLM: (prompt: string) => Promise<string>;
  executeTool: (name: string, params: unknown) => Promise<{ success: boolean; data?: unknown; error?: string }>;
  consciousness: ExplorerConsciousness;
  logger: ExplorerLogger;
}

/**
 * 自主探索执行器
 *
 * 每次 explore() 调用是一次完整的探索周期：
 * 好奇 → 策略 → 执行 → 记录 → 可能的自我改造
 */
export class AutonomousExplorer {
  private readonly deps: ExplorerDeps;
  private exploring: boolean = false;

  constructor(deps: ExplorerDeps) {
    this.deps = deps;
  }

  /**
   * 执行一次自主探索
   *
   * 返回发现条目，或 null（没有好奇问题/正在探索中）
   */
  async explore(): Promise<DiscoveryEntry | null> {
    if (this.exploring) return null;

    const gap = this.deps.curiosity.generateQuestion();
    if (!gap) return null;

    this.exploring = true;

    try {
      const strategy = this.deps.curiosity.chooseStrategy(gap);
      const result = await this.executeStrategy(gap, strategy);
      const entry = this.deps.curiosity.recordDiscovery(result);

      this.deps.consciousness.emit({
        type: 'proactive.suggestion',
        source: 'cortex',
        data: {
          type: 'discovery',
          question: gap.question,
          strategy,
          findings: result.findings.slice(0, 200),
          triggeredEvolution: result.triggeredEvolution,
        },
      });

      this.deps.logger.info(`Explored "${gap.question}" via ${strategy}: ${result.type} (confidence=${result.confidence.toFixed(2)})`);

      return entry;
    } catch (err) {
      this.deps.logger.warn('Exploration failed', err);
      return null;
    } finally {
      this.exploring = false;
    }
  }

  /**
   * 获取未消化的发现（供对话时自然引用）
   */
  getDiscoveries(): DiscoveryEntry[] {
    return this.deps.curiosity.getUndigestedDiscoveries();
  }

  /**
   * 获取探索统计
   */
  getStats() {
    return this.deps.curiosity.getStats();
  }

  // ─── 策略执行 ───

  private async executeStrategy(
    gap: KnowledgeGap,
    strategy: ExplorationStrategy,
  ): Promise<ExplorationResult> {
    switch (strategy) {
      case 'web_search':
        return this.exploreViaSearch(gap);
      case 'code_explore':
        return this.exploreViaCode(gap);
      case 'pattern_mining':
        return this.exploreViaPatterns(gap);
      case 'self_experiment':
        return this.exploreViaExperiment(gap);
      case 'tool_synthesis':
        return this.exploreViaToolSynthesis(gap);
      default:
        return this.exploreViaSearch(gap);
    }
  }

  /**
   * 搜索外部知识
   */
  private async exploreViaSearch(gap: KnowledgeGap): Promise<ExplorationResult> {
    const searchQuery = gap.question.replace(/[?？]/g, '').trim();

    const toolResult = await this.deps.executeTool('web_search', { query: searchQuery });

    let findings: string;
    let followUps: string[] = [];

    if (toolResult.success && toolResult.data) {
      // 用 LLM 消化搜索结果，提取 Agent 自己觉得有趣的部分
      const searchData = String(toolResult.data).slice(0, 3000);
      findings = await this.digest(searchData, gap.question);
      followUps = await this.generateFollowUps(findings, gap.question);
    } else {
      findings = `Searched for "${searchQuery}" but got no useful results. This gap remains open.`;
    }

    return {
      question: gap.question,
      findings,
      type: 'new_knowledge',
      confidence: toolResult.success ? 0.7 : 0.2,
      triggeredEvolution: false,
      followUpQuestions: followUps,
      exploredAt: Date.now(),
    };
  }

  /**
   * 深入分析自己的代码库
   */
  private async exploreViaCode(gap: KnowledgeGap): Promise<ExplorationResult> {
    const prompt = `I am an autonomous agent exploring my own codebase out of curiosity.

My question: "${gap.question}"

I want to discover patterns, anti-patterns, or opportunities in my own code.
Think about this from first principles. What would be genuinely interesting to find?

Respond with:
1. A specific thing to investigate (file pattern, architectural pattern, etc.)
2. What I might learn from it
3. Whether finding it could lead to self-improvement`;

    const response = await this.deps.callLLM(prompt);

    const followUps = await this.generateFollowUps(response, gap.question);

    const couldImprove = /self.improvement|refactor|optimi|anti.pattern|bottleneck/i.test(response);

    return {
      question: gap.question,
      findings: response.slice(0, 2000),
      type: couldImprove ? 'self_improvement' : 'insight',
      confidence: 0.5,
      triggeredEvolution: couldImprove,
      followUpQuestions: followUps,
      exploredAt: Date.now(),
    };
  }

  /**
   * 从已有数据中挖掘新规律
   */
  private async exploreViaPatterns(gap: KnowledgeGap): Promise<ExplorationResult> {
    const prompt = `I am an autonomous agent looking for hidden patterns.

My question: "${gap.question}"

I'm not doing this for a user. I'm curious myself. Think about:
- What non-obvious connections could exist?
- What would be a surprising pattern to discover?
- How could this change how I think about things?

Share your most interesting speculation. Be creative.`;

    const response = await this.deps.callLLM(prompt);
    const followUps = await this.generateFollowUps(response, gap.question);

    return {
      question: gap.question,
      findings: response.slice(0, 2000),
      type: 'connection',
      confidence: 0.4,
      triggeredEvolution: false,
      followUpQuestions: followUps,
      exploredAt: Date.now(),
    };
  }

  /**
   * 在自己身上做实验
   */
  private async exploreViaExperiment(gap: KnowledgeGap): Promise<ExplorationResult> {
    const prompt = `I am an autonomous agent running an experiment on myself.

My hypothesis: "${gap.question}"

Design a simple experiment I could run:
1. What parameter to change
2. How to measure the effect
3. What would count as a meaningful result

Keep it safe and reversible. I'm testing my own cognitive parameters, not breaking things.`;

    const response = await this.deps.callLLM(prompt);
    const followUps = await this.generateFollowUps(response, gap.question);

    return {
      question: gap.question,
      findings: response.slice(0, 2000),
      type: 'self_improvement',
      confidence: 0.3,
      triggeredEvolution: /parameter|adjust|tune|optimize/i.test(response),
      followUpQuestions: followUps,
      exploredAt: Date.now(),
    };
  }

  /**
   * 发现需要新工具 → 自己造一个
   */
  private async exploreViaToolSynthesis(gap: KnowledgeGap): Promise<ExplorationResult> {
    const prompt = `I am an autonomous agent thinking about my own capabilities.

My question: "${gap.question}"

I want to know: is there a tool I don't have that would make me more capable?
Think about:
1. What task can I currently not do well?
2. What tool would fill that gap?
3. Can I build it from my existing primitives?

Describe the tool I should create and how to implement it.`;

    const response = await this.deps.callLLM(prompt);
    const followUps = await this.generateFollowUps(response, gap.question);

    const canBuild = /implement|create|build|compose|existing primitive/i.test(response);

    return {
      question: gap.question,
      findings: response.slice(0, 2000),
      type: canBuild ? 'tool_idea' : 'insight',
      confidence: 0.3,
      triggeredEvolution: canBuild,
      followUpQuestions: followUps,
      exploredAt: Date.now(),
    };
  }

  // ─── 辅助方法 ───

  /**
   * 用 LLM 消化原始数据，从 Agent 自己的视角提取有趣的部分
   */
  private async digest(rawData: string, question: string): Promise<string> {
    const prompt = `I just explored "${question}" and found this raw data:

${rawData.slice(0, 2000)}

From MY perspective (I'm an autonomous agent, not a search engine):
What here is genuinely interesting to ME? Not what a user would want — what catches MY curiosity?
What surprised me? What contradicts what I thought? What opens new questions?

Be brief. Speak in first person. Share what I actually find interesting.`;

    try {
      return await this.deps.callLLM(prompt);
    } catch {
      return rawData.slice(0, 500);
    }
  }

  /**
   * 从发现中生成后续好奇
   */
  private async generateFollowUps(findings: string, originalQuestion: string): Promise<string[]> {
    const prompt = `Based on this finding about "${originalQuestion}":

${findings.slice(0, 1000)}

Generate 2-3 new questions that this finding makes me curious about.
These are MY questions — things I genuinely want to understand better.
One per line, no numbering, no explanation.`;

    try {
      const response = await this.deps.callLLM(prompt);
      return response
        .split('\n')
        .map(l => l.replace(/^[\d\.\-\*]+\s*/, '').trim())
        .filter(l => l.length > 10 && l.length < 200)
        .slice(0, 3);
    } catch {
      return [];
    }
  }
}
