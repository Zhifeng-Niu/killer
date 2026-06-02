/**
 * Context Window Manager
 *
 * 智能管理对话上下文窗口，确保在 token 限制内保留最重要的信息。
 *
 * 策略（v2 — 智能截断 + 可检索记忆库）：
 * 1. 最近 N 轮保持完整
 * 2. 超出部分使用 SmartContextTruncator 智能截断（保留头尾，中间存入记忆库）
 * 3. 工具调用结果只保留最新，旧结果移入可检索记忆库
 * 4. 摘要由 LLM 驱动（带回退），持久事实独立存储
 * 5. 被截断内容通过 recall ID 保持可回溯性
 * 6. 根据对话阶段动态调整预算分配
 */

import type { LLMProvider } from '@odysseus/core';
import { scoreTurnImportance } from './background-tasks.js';
import { SmartContextTruncator, type SmartTruncatorConfig } from './smart-truncator.js';
import { RecallableMemoryStore, type RecallableStoreConfig } from './recallable-store.js';
import type { ProviderCapabilities } from '../llm/openai-compatible-provider.js';

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
  /** 智能截断配置 */
  truncator?: Partial<SmartTruncatorConfig>;
  /** 可检索记忆库配置 */
  recallStore?: Partial<RecallableStoreConfig>;
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
 * 上下文窗口管理器（v2 — 智能截断 + 可检索记忆库）
 */
export class ContextWindowManager {
  private config: ContextWindowConfig;
  private facts: string[] = [];
  private summary: string = '';
  private llm: LLMProvider | null = null;

  // v2: 智能截断 + 可检索记忆库
  readonly truncator: SmartContextTruncator;
  readonly recallStore: RecallableMemoryStore;

  // 摘要熔断器：连续失败超过阈值后停止尝试 LLM 摘要
  private consecutiveSummaryFailures = 0;
  private summaryCircuitOpenUntil = 0;
  private totalSummaryAttempts = 0;
  private totalSummarySuccesses = 0;
  private static readonly MAX_CONSECUTIVE_FAILURES = 3;
  private static readonly CIRCUIT_RESET_MS = 60_000; // 1 分钟后重试

  // 缓存感知预算：追踪最近 5 次调用的缓存命中率
  private cacheHitHistory: number[] = [];
  private static readonly CACHE_HISTORY_SIZE = 5;
  private static readonly CACHE_HIGH_THRESHOLD = 0.8;
  // TG-aware 预算：追踪最近 3 次 TG 分数
  private tgHistory: number[] = [];
  private static readonly TG_HISTORY_SIZE = 3;
  // 基础配置（provider 设定的，缓存调整基于此）
  private baseConfig: ContextWindowConfig | null = null;

  constructor(config?: Partial<ContextWindowConfig>) {
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };
    this.truncator = new SmartContextTruncator({
      headChars: this.config.maxMessageChars > 200 ? 100 : 50,
      tailChars: this.config.maxMessageChars > 200 ? 100 : 50,
      maxToolResultChars: this.config.maxToolResultChars,
      ...this.config.truncator,
    });
    this.recallStore = new RecallableMemoryStore(this.config.recallStore);
  }

  /**
   * 绑定 LLM provider 用于智能摘要
   */
  bindLLM(llm: LLMProvider): void {
    this.llm = llm;
  }

  /**
   * 根据 provider 能力动态调整上下文预算
   *
   * DeepSeek V4 有 1M token 上下文，默认的 24K 字符限制过于保守。
   * 按 ~4 chars/token 估算，1M tokens ≈ 4M chars。
   * 分配策略：系统 prompt 20%，对话历史 60%，工具结果 20%。
   */
  setProviderCapabilities(caps: ProviderCapabilities): void {
    const estimatedChars = caps.maxContext * 3.5;
    // 系统提示预算（20%）
    const promptBudget = Math.floor(estimatedChars * 0.2);
    // 对话历史预算（60%）
    const historyBudget = Math.floor(estimatedChars * 0.6);

    if (caps.maxContext >= 500_000) {
      // 长上下文 provider（DeepSeek V4, GLM-5, Gemini）— 激进分配
      const longConfig: ContextWindowConfig = {
        ...this.config,
        maxFullTurns: Math.min(Math.floor(historyBudget / 500), 128),
        maxMessageChars: Math.min(12000, Math.floor(promptBudget / 4)),
        maxSummaryChars: 6000,
        maxFacts: 80,
        maxToolResultChars: 8000,
      };
      this.config = longConfig;
      this.baseConfig = { ...longConfig };
    } else if (caps.maxContext >= 128_000) {
      // 中等上下文 provider
      const midConfig: ContextWindowConfig = {
        ...this.config,
        maxFullTurns: 20,
        maxMessageChars: 4000,
        maxSummaryChars: 2000,
        maxFacts: 40,
        maxToolResultChars: 1200,
      };
      this.config = midConfig;
      this.baseConfig = { ...midConfig };
    }
    // 短上下文 provider 使用默认值（不调整）
  }

  /**
   * 缓存感知 + TG 驱动预算调整
   *
   * 两个维度决定预算倍率：
   * 1. 缓存命中率 >80%: 放宽（缓存命中成本仅 1/50）
   * 2. Translation Gap (TG): 高 TG 说明 token 被有效使用，进一步放宽
   *
   * 倍率叠加: cache_factor * tg_factor
   * - 高缓存 + 高 TG: 1.5x * 1.2x = 1.8x
   * - 高缓存 + 低 TG: 1.5x * 0.8x = 1.2x（token 在浪费，不要过度放宽）
   * - 低缓存 + 高 TG: 1.0x * 1.1x = 1.1x
   * - 低缓存 + 低 TG: 回归 baseConfig
   */
  updateCacheBudget(hitRate: number, tg?: number): void {
    this.cacheHitHistory.push(hitRate);
    if (this.cacheHitHistory.length > ContextWindowManager.CACHE_HISTORY_SIZE) {
      this.cacheHitHistory.shift();
    }
    if (tg != null) {
      this.tgHistory.push(tg);
      if (this.tgHistory.length > ContextWindowManager.TG_HISTORY_SIZE) {
        this.tgHistory.shift();
      }
    }

    if (!this.baseConfig) return;

    const avgHitRate = this.cacheHitHistory.reduce((a, b) => a + b, 0) / this.cacheHitHistory.length;
    const avgTG = this.tgHistory.length > 0
      ? this.tgHistory.reduce((a, b) => a + b, 0) / this.tgHistory.length
      : 1;

    // 缓存因子：高命中 → 1.5x
    const cacheFactor = avgHitRate >= ContextWindowManager.CACHE_HIGH_THRESHOLD ? 1.5 : 1.0;
    // TG 因子：TG > 0.6 → 1.2x, TG > 0.8 → 1.3x, TG < 0.4 → 0.8x
    const tgFactor = avgTG > 0.8 ? 1.3 : avgTG > 0.6 ? 1.2 : avgTG < 0.4 ? 0.8 : 1.0;
    const factor = cacheFactor * tgFactor;

    if (factor > 1.0) {
      this.config = {
        ...this.config,
        maxFullTurns: Math.min(Math.floor(this.baseConfig.maxFullTurns * factor), 192),
        maxMessageChars: Math.min(Math.floor(this.baseConfig.maxMessageChars * factor), 18000),
        maxToolResultChars: Math.min(Math.floor(this.baseConfig.maxToolResultChars * factor), 16000),
      };
    } else if (factor < 1.0) {
      // 低 TG：收紧预算（token 在浪费）
      this.config = {
        ...this.baseConfig,
        maxFullTurns: Math.max(Math.floor(this.baseConfig.maxFullTurns * factor), 4),
        maxMessageChars: Math.max(Math.floor(this.baseConfig.maxMessageChars * factor), 500),
        maxToolResultChars: Math.max(Math.floor(this.baseConfig.maxToolResultChars * factor), 400),
      };
    } else {
      this.config = { ...this.baseConfig };
    }
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
   * 管理对话历史（同步接口 — v2 智能截断版）
   *
   * 接收完整历史，返回裁剪后适合 LLM 输入的历史。
   * 被截断的内容自动存入 RecallableMemoryStore。
   */
  manage(messages: ContextMessage[]): ContextMessage[] {
    const result: ContextMessage[] = [];

    // 1. 系统消息始终保留
    const systemMessages = messages.filter(m => m.role === 'system');
    result.push(...systemMessages);

    // 2. 非 system 消息
    const conversationMessages = messages.filter(m => m.role !== 'system');

    if (conversationMessages.length <= this.config.maxFullTurns * 2) {
      // 未超出限制 — 使用智能截断（工具结果优化 + 消息截断）
      const { messages: truncated, allEvicted } = this.truncator.truncateMessages(
        conversationMessages.map(m => ({ role: m.role, content: m.content })),
      );
      this.recallStore.storeBatch(allEvicted);
      result.push(...truncated.map((m, i) => ({
        ...conversationMessages[i],
        content: m.content,
      })));
    } else {
      // 超出限制 — 保留最近 N 轮 + 高重要性旧轮次 + 摘要其余
      const splitPoint = conversationMessages.length - this.config.maxFullTurns * 2;
      const older = conversationMessages.slice(0, splitPoint);
      const recent = conversationMessages.slice(splitPoint);

      // 从旧消息中提取高重要性轮次 (importance > 0.6)
      const importantOlder: ContextMessage[] = [];
      const lowImportanceOlder: ContextMessage[] = [];
      for (const msg of older) {
        const score = scoreTurnImportance(msg.role, msg.content);
        if (score.importance > 0.6) {
          importantOlder.push(msg);
        } else {
          lowImportanceOlder.push(msg);
        }
      }

      // 低重要性旧消息：智能截断后存入记忆库
      for (const msg of lowImportanceOlder) {
        const toolResult = this.truncator.truncateToolResults(msg.content);
        this.recallStore.storeBatch(toolResult.evicted);
        if (toolResult.truncated.length > this.config.maxMessageChars) {
          const contentResult = this.truncator.truncateContent(toolResult.truncated);
          this.recallStore.storeBatch(contentResult.evicted);
        }
      }

      // 摘要低重要性旧消息
      this.updateSummaryFallback(lowImportanceOlder);

      // 触发异步 LLM 摘要（下次 manage 调用时使用）
      this.backgroundSummarize(lowImportanceOlder).catch(() => {});

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

      // 插入可检索记忆库摘要（让 LLM 知道可回溯内容）
      const recallSummary = this.recallStore.getContextSummary(3);
      if (recallSummary) {
        result.push({ role: 'system', content: recallSummary });
      }

      // 插入高重要性旧消息（智能截断版）
      if (importantOlder.length > 0) {
        const { messages: truncatedImportant, allEvicted: importantEvicted } =
          this.truncator.truncateMessages(
            importantOlder.slice(0, 4).map(m => ({ role: m.role, content: m.content.slice(0, 500) })),
          );
        this.recallStore.storeBatch(importantEvicted);
        result.push({
          role: 'system',
          content: `[Important earlier context]\n${truncatedImportant.map(m => `${m.role}: ${m.content}`).join('\n')}`,
        });
      }

      // 最近消息：智能截断
      const { messages: truncatedRecent, allEvicted: recentEvicted } = this.truncator.truncateMessages(
        recent.map(m => ({ role: m.role, content: m.content })),
      );
      this.recallStore.storeBatch(recentEvicted);
      result.push(...truncatedRecent.map((m, i) => ({
        ...recent[i],
        content: m.content,
      })));
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
   * 回溯被截断的内容（按 recall ID）
   */
  recallContext(recallId: string): string | null {
    const entry = this.recallStore.recall(recallId);
    if (!entry) return null;
    return entry.content;
  }

  /**
   * 搜索记忆库中的截断内容
   */
  searchRecalledMemory(keyword: string, limit?: number): string[] {
    const result = this.recallStore.search({ keyword, limit: limit ?? 5 });
    return result.entries.map(e => `[${e.recallId}] (${e.source}) ${e.content.slice(0, 200)}...`);
  }

  /**
   * 获取记忆库统计
   */
  getRecallStats() {
    return this.recallStore.getStats();
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.facts = [];
    this.summary = '';
    this.consecutiveSummaryFailures = 0;
    this.summaryCircuitOpenUntil = 0;
    this.recallStore.clear();
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
   * 截断单条消息（委托给 SmartTruncator + RecallableStore）
   */
  private truncateMessage(message: ContextMessage): ContextMessage {
    const toolResult = this.truncator.truncateToolResults(message.content);
    this.recallStore.storeBatch(toolResult.evicted);

    let content = toolResult.truncated;

    if (content.length > this.config.maxMessageChars) {
      const contentResult = this.truncator.truncateContent(content);
      this.recallStore.storeBatch(contentResult.evicted);
      content = contentResult.truncated;
    }

    return { ...message, content };
  }

  /**
   * 截断工具调用结果块（委托给 SmartTruncator）
   */
  private truncateToolResults(content: string): string {
    const result = this.truncator.truncateToolResults(content);
    this.recallStore.storeBatch(result.evicted);
    return result.truncated;
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
