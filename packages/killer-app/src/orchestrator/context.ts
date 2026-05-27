/**
 * Context Window Manager
 *
 * 智能管理对话上下文窗口，确保在 token 限制内保留最重要的信息。
 *
 * 策略：
 * 1. 最近 N 轮保持完整
 * 2. 超出部分提取摘要（LLM 驱动）
 * 3. 持久事实存储到 facts 列表
 * 4. 工具调用结果截断
 * 5. 根据对话阶段动态调整预算分配
 */

import type { LLMProvider } from '@killer/core';

/**
 * 对话消息
 */
export interface ContextMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

/**
 * 上下文窗口配置
 */
export interface ContextWindowConfig {
  /** 最大保留的完整对话轮数 */
  maxFullTurns: number;
  /** 每条消息最大字符数 */
  maxMessageChars: number;
  /** 摘要最大字符数 */
  maxSummaryChars: number;
  /** 持久事实最大数量 */
  maxFacts: number;
  /** 工具结果截断长度 */
  maxToolResultChars: number;
}

/**
 * 对话阶段预设 — 不同阶段的最优上下文分配策略
 */
const PHASE_PRESETS: Record<string, Partial<ContextWindowConfig>> = {
  'deep-work': {
    maxFullTurns: 16,
    maxMessageChars: 3000,
    maxSummaryChars: 1000,
    maxToolResultChars: 1200,
  },
  'exploration': {
    maxFullTurns: 8,
    maxMessageChars: 2000,
    maxSummaryChars: 2000,
    maxToolResultChars: 600,
  },
  'review': {
    maxFullTurns: 12,
    maxMessageChars: 2000,
    maxSummaryChars: 1500,
    maxToolResultChars: 1000,
  },
  'wrap-up': {
    maxFullTurns: 6,
    maxMessageChars: 1500,
    maxSummaryChars: 800,
    maxFacts: 40,
    maxToolResultChars: 500,
  },
  'greeting': {
    maxFullTurns: 4,
    maxMessageChars: 1000,
    maxSummaryChars: 500,
    maxToolResultChars: 400,
  },
  'idle': {
    maxFullTurns: 10,
    maxMessageChars: 2000,
    maxSummaryChars: 1500,
    maxToolResultChars: 800,
  },
};

const DEFAULT_CONTEXT_CONFIG: ContextWindowConfig = {
  maxFullTurns: 10,
  maxMessageChars: 2000,
  maxSummaryChars: 1500,
  maxFacts: 30,
  maxToolResultChars: 800,
};

/**
 * 上下文窗口管理器
 */
export class ContextWindowManager {
  private config: ContextWindowConfig;
  private facts: string[] = [];
  private summary: string = '';
  private llm: LLMProvider | null = null;

  // 摘要熔断器：连续失败超过阈值后停止尝试 LLM 摘要
  private consecutiveSummaryFailures = 0;
  private summaryCircuitOpenUntil = 0;
  private totalSummaryAttempts = 0;
  private totalSummarySuccesses = 0;
  private static readonly MAX_CONSECUTIVE_FAILURES = 3;
  private static readonly CIRCUIT_RESET_MS = 60_000; // 1 分钟后重试

  constructor(config?: Partial<ContextWindowConfig>) {
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };
  }

  /**
   * 绑定 LLM provider 用于智能摘要
   */
  bindLLM(llm: LLMProvider): void {
    this.llm = llm;
  }

  /**
   * 根据对话阶段调整上下文预算
   */
  setPhase(phase: string): void {
    const preset = PHASE_PRESETS[phase];
    if (preset) {
      this.config = { ...DEFAULT_CONTEXT_CONFIG, ...preset };
    }
  }

  /**
   * 获取当前生效的阶段名称
   */
  getCurrentPhase(): string {
    for (const [phase, preset] of Object.entries(PHASE_PRESETS)) {
      if (preset.maxFullTurns === this.config.maxFullTurns
        && preset.maxMessageChars === this.config.maxMessageChars) {
        return phase;
      }
    }
    return 'default';
  }

  /**
   * 管理对话历史（同步接口）
   *
   * 接收完整历史，返回裁剪后适合 LLM 输入的历史。
   * 使用已有的摘要（由 backgroundSummarize 异步更新）。
   */
  manage(messages: ContextMessage[]): ContextMessage[] {
    const result: ContextMessage[] = [];

    // 1. 系统消息始终保留
    const systemMessages = messages.filter(m => m.role === 'system');
    result.push(...systemMessages);

    // 2. 非 system 消息
    const conversationMessages = messages.filter(m => m.role !== 'system');

    if (conversationMessages.length <= this.config.maxFullTurns * 2) {
      // 未超出限制 — 保留全部（截断单条）
      result.push(...conversationMessages.map(m => this.truncateMessage(m)));
    } else {
      // 超出限制 — 保留最近 N 轮完整 + 摘要前半部分
      const splitPoint = conversationMessages.length - this.config.maxFullTurns * 2;
      const older = conversationMessages.slice(0, splitPoint);
      const recent = conversationMessages.slice(splitPoint);

      // 摘要旧消息（同步：使用已有的摘要，或简单回退）
      this.updateSummaryFallback(older);

      // 触发异步 LLM 摘要（下次 manage 调用时使用）
      this.backgroundSummarize(older).catch(() => {});

      // 插入摘要作为 system 消息
      if (this.summary) {
        result.push({
          role: 'system',
          content: `[Earlier conversation summary]\n${this.summary}`,
        });
      }

      // 插入持久事实
      if (this.facts.length > 0) {
        result.push({
          role: 'system',
          content: `[Key facts]\n${this.facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}`,
        });
      }

      // 最近消息完整保留
      result.push(...recent.map(m => this.truncateMessage(m)));
    }

    return result;
  }

  /**
   * 添加持久事实
   */
  addFact(fact: string): void {
    // 去重
    const normalized = fact.trim().toLowerCase();
    if (this.facts.some(f => f.trim().toLowerCase() === normalized)) return;

    this.facts.push(fact.trim());

    // 超出限制则移除最旧的
    if (this.facts.length > this.config.maxFacts) {
      this.facts.shift();
    }
  }

  /**
   * 获取当前事实列表
   */
  getFacts(): string[] {
    return [...this.facts];
  }

  /**
   * 获取当前摘要
   */
  getSummary(): string {
    return this.summary;
  }

  /**
   * 获取配置
   */
  getConfig(): ContextWindowConfig {
    return { ...this.config };
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.facts = [];
    this.summary = '';
    this.consecutiveSummaryFailures = 0;
    this.summaryCircuitOpenUntil = 0;
  }

  /**
   * 获取摘要健康统计
   */
  getSummarizationStats(): {
    attempts: number;
    successes: number;
    successRate: number;
    circuitOpen: boolean;
    consecutiveFailures: number;
  } {
    return {
      attempts: this.totalSummaryAttempts,
      successes: this.totalSummarySuccesses,
      successRate: this.totalSummaryAttempts > 0
        ? this.totalSummarySuccesses / this.totalSummaryAttempts
        : 1,
      circuitOpen: Date.now() < this.summaryCircuitOpenUntil,
      consecutiveFailures: this.consecutiveSummaryFailures,
    };
  }

  /**
   * 截断单条消息
   */
  private truncateMessage(message: ContextMessage): ContextMessage {
    let content = message.content;

    // 截断工具调用结果
    content = this.truncateToolResults(content);

    // 截断超长消息
    if (content.length > this.config.maxMessageChars) {
      content = content.slice(0, this.config.maxMessageChars) + '\n...[truncated]';
    }

    return { ...message, content };
  }

  /**
   * 截断工具调用结果块
   */
  private truncateToolResults(content: string): string {
    // 匹配 [Tool Result: ...]\n...\n 格式
    return content.replace(
      /\[Tool Result: (\w+)\]\n([\s\S]*?)(?=\n(?! )|$)/g,
      (match, toolName, result) => {
        if (result.length > this.config.maxToolResultChars) {
          return `[Tool Result: ${toolName}]\n${result.slice(0, this.config.maxToolResultChars)}...[truncated]\n`;
        }
        return match;
      },
    );
  }

  /**
   * 从旧消息中生成/更新摘要
   *
   * 如果绑定了 LLM，使用 LLM 生成智能摘要。
   * 否则回退到简单的消息提取。
   */
  private async updateSummary(olderMessages: ContextMessage[]): Promise<void> {
    if (olderMessages.length === 0) return;

    if (this.llm) {
      await this.updateSummaryWithLLM(olderMessages);
    } else {
      this.updateSummaryFallback(olderMessages);
    }
  }

  /**
   * LLM 驱动的智能摘要
   *
   * 由 backgroundSummarize 调用，异步更新 this.summary。
   * 包含熔断器：连续失败 3 次后暂停 LLM 摘要 1 分钟。
   */
  private async updateSummaryWithLLM(olderMessages: ContextMessage[]): Promise<void> {
    // 熔断器检查
    if (Date.now() < this.summaryCircuitOpenUntil) {
      this.updateSummaryFallback(olderMessages);
      return;
    }

    const conversationText = olderMessages
      .map(m => `${m.role}: ${m.content.slice(0, this.config.maxMessageChars)}`)
      .join('\n');

    const existingContext = this.summary ? `\n\nExisting summary to build upon:\n${this.summary}` : '';

    const prompt = `Summarize this conversation as if you're the AI assistant remembering what happened. Use first person. Include:
1. What we talked about and what mattered to the user
2. Decisions made, preferences expressed, or plans discussed
3. Emotional tone — how the user seemed to feel${existingContext}

Keep it under ${this.config.maxSummaryChars} characters. Be specific and personal, not generic.

Conversation:
${conversationText}`;

    this.totalSummaryAttempts++;

    try {
      const result = await this.llm!.complete(prompt);
      if (result.content) {
        this.summary = result.content.length > this.config.maxSummaryChars
          ? result.content.slice(0, this.config.maxSummaryChars)
          : result.content;

        // 成功 — 重置熔断器
        this.consecutiveSummaryFailures = 0;
        this.totalSummarySuccesses++;

        // Extract key facts from the conversation
        await this.extractFacts(olderMessages);
      }
    } catch {
      // LLM summarization failed — track failure and apply circuit breaker
      this.consecutiveSummaryFailures++;
      if (this.consecutiveSummaryFailures >= ContextWindowManager.MAX_CONSECUTIVE_FAILURES) {
        this.summaryCircuitOpenUntil = Date.now() + ContextWindowManager.CIRCUIT_RESET_MS;
      }
      this.updateSummaryFallback(olderMessages);
    }
  }

  /**
   * 从对话中提取关键事实
   */
  private async extractFacts(messages: ContextMessage[]): Promise<void> {
    const userMessages = messages
      .filter(m => m.role === 'user')
      .map(m => m.content.slice(0, this.config.maxMessageChars))
      .join('\n');

    if (!userMessages) return;

    const prompt = `Extract key facts from these user messages. Return each fact on a new line, prefixed with "- ". Only include concrete facts (name, preference, decision, requirement). Maximum 5 facts.

User messages:
${userMessages}`;

    try {
      const result = await this.llm!.complete(prompt);
      const lines = result.content.split('\n')
        .map(l => l.replace(/^-\s*/, '').trim())
        .filter(l => l.length > 5);

      for (const fact of lines.slice(0, 5)) {
        this.addFact(fact);
      }
    } catch {
      // Fact extraction failed — non-critical
    }
  }

  /**
   * 后台异步摘要（不阻塞 manage 返回）
   *
   * 在后台使用 LLM 生成更好的摘要，下次 manage 调用时生效。
   * 熔断器开启时跳过 LLM 调用。
   */
  private async backgroundSummarize(olderMessages: ContextMessage[]): Promise<void> {
    if (!this.llm || olderMessages.length === 0) return;
    // 熔断器开启时不浪费 LLM 调用
    if (Date.now() < this.summaryCircuitOpenUntil) return;

    await this.updateSummaryWithLLM(olderMessages);
  }

  /**
   * 简单回退摘要（无 LLM 时使用）
   */
  private updateSummaryFallback(olderMessages: ContextMessage[]): void {
    const userMessages = olderMessages
      .filter(m => m.role === 'user')
      .map(m => m.content.slice(0, this.config.maxMessageChars));

    const newPoints = userMessages.slice(-5);

    const combined = this.summary
      ? `${this.summary}\n- ${newPoints.join('\n- ')}`
      : newPoints.map(p => `- ${p}`).join('\n');

    this.summary = combined.length > this.config.maxSummaryChars
      ? combined.slice(0, this.config.maxSummaryChars) + '\n...[summary truncated]'
      : combined;
  }
}
