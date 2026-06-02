/**
 * Token Efficiency Tracker
 *
 * 借鉴 multi-agent-efficiency 的 Translation Gap (TG) 概念，
 * 追踪工具链循环中每轮 LLM 调用的 token 效率。
 *
 * 核心指标：
 * - Translation Gap (TG): 有效产出 token / 总投入 token
 * - Waste 分类: retry_waste / dead_branch_waste / failed_waste
 * - 工具级别效能评分
 *
 * DeepSeek V4 特化：
 * - 缓存命中 token 的 TG 独立计算（缓存折扣下有效产出率更重要）
 * - thinking mode 的 reasoning token 效率追踪
 */

/** 单次 LLM 调用记录 */
export interface LLMCallRecord {
  /** 调用轮次 (1-based) */
  round: number;
  /** 投入 tokens (input + cache hit + cache miss) */
  inputTokens: number;
  /** 产出 tokens */
  outputTokens: number;
  /** 缓存命中 tokens */
  cacheHitTokens: number;
  /** reasoning tokens (DeepSeek thinking mode) */
  reasoningTokens: number;
  /** 是否产生了工具调用 */
  hadToolCalls: boolean;
  /** 工具调用详情 */
  toolCalls: ToolCallRecord[];
  /** 调用耗时 (ms) */
  latencyMs: number;
  /** 时间戳 */
  timestamp: number;
}

/** 单次工具调用记录 */
export interface ToolCallRecord {
  /** 工具名 */
  tool: string;
  /** 参数签名 (用于重复检测) */
  paramSignature: string;
  /** 是否成功 */
  success: boolean;
  /** 结果字符数 */
  resultChars: number;
  /** 耗时 ms */
  latencyMs: number;
}

/** TG 效率报告 */
export interface EfficiencyReport {
  /** 总投入 tokens (所有 LLM 调用的 input) */
  totalInputTokens: number;
  /** 总产出 tokens (所有 LLM 调用的 output) */
  totalOutputTokens: number;
  /** 总缓存命中 tokens */
  totalCacheHitTokens: number;
  /** 总 reasoning tokens */
  totalReasoningTokens: number;
  /** Translation Gap: 有效产出 / 总投入 */
  translationGap: number;
  /** 缓存感知 TG: 只看非缓存 token 的有效产出率 */
  cacheAwareTG: number;
  /** Waste 分类 */
  waste: {
    retryWaste: number;
    deadBranchWaste: number;
    failedWaste: number;
    totalWaste: number;
  };
  /** 工具级别效能 */
  toolEfficiency: Map<string, ToolEfficiencyStats>;
  /** 总轮次 */
  totalRounds: number;
  /** 有效轮次 (产生了最终被采纳的输出) */
  effectiveRounds: number;
  /** 总耗时 */
  totalLatencyMs: number;
}

/** 工具效能统计 */
export interface ToolEfficiencyStats {
  /** 调用次数 */
  calls: number;
  /** 成功次数 */
  successes: number;
  /** 失败次数 */
  failures: number;
  /** 重复调用次数 */
  retries: number;
  /** 平均耗时 */
  avgLatencyMs: number;
  /** 总结果字符数 */
  totalResultChars: number;
  /** 工具级 TG (成功调用数 / 总调用数) */
  tg: number;
}

/**
 * Token 效率追踪器
 *
 * 在 runNativeToolLoop 的每一轮中记录 token 消耗，
 * 最终生成 TG 报告供自适应预算调整使用。
 */
export class TokenEfficiencyTracker {
  private records: LLMCallRecord[] = [];
  private toolStats = new Map<string, ToolEfficiencyStats>();
  private paramSignatureHistory: string[] = [];
  private sessionStart = Date.now();

  /** 记录一轮 LLM 调用 */
  recordCall(record: LLMCallRecord): void {
    this.records.push(record);

    // 更新工具级统计
    for (const tc of record.toolCalls) {
      this.updateToolStats(tc);
      this.paramSignatureHistory.push(tc.paramSignature);
    }
  }

  /** 标记当前轮为有效（最终被采纳） */
  markEffective(round: number): void {
    const record = this.records.find(r => r.round === round);
    if (record) {
      (record as any)._effective = true;
    }
  }

  /**
   * 生成效率报告
   *
   * 核心算法：
   * 1. 最后一轮为有效轮（产生了用户看到的输出）
   * 2. 有工具调用且成功的中间轮为有效轮
   * 3. 重试相同工具 = retry_waste
   * 4. 失败的调用 = failed_waste
   */
  generateReport(): EfficiencyReport {
    const totalRounds = this.records.length;
    if (totalRounds === 0) {
      return this.emptyReport();
    }

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheHitTokens = 0;
    let totalReasoningTokens = 0;
    let effectiveRounds = 0;
    let totalLatencyMs = 0;

    let retryWaste = 0;
    let deadBranchWaste = 0;
    let failedWaste = 0;

    // 判断每轮是否有效
    const effectiveRoundsSet = this.identifyEffectiveRounds();

    for (const record of this.records) {
      totalInputTokens += record.inputTokens;
      totalOutputTokens += record.outputTokens;
      totalCacheHitTokens += record.cacheHitTokens;
      totalReasoningTokens += record.reasoningTokens;
      totalLatencyMs += record.latencyMs;

      const isEffective = effectiveRoundsSet.has(record.round);
      if (isEffective) {
        effectiveRounds++;
      } else {
        // 分类 waste
        const allFailed = record.toolCalls.length > 0
          && record.toolCalls.every(tc => !tc.success);
        const hasRetries = record.toolCalls.some(tc => {
          const sig = tc.paramSignature;
          const count = this.paramSignatureHistory.filter(s => s === sig).length;
          return count > 1;
        });

        if (allFailed) {
          failedWaste += record.inputTokens + record.outputTokens;
        } else if (hasRetries) {
          retryWaste += record.inputTokens + record.outputTokens;
        } else {
          deadBranchWaste += record.inputTokens + record.outputTokens;
        }
      }
    }

    const totalTokens = totalInputTokens + totalOutputTokens;
    const totalWaste = retryWaste + deadBranchWaste + failedWaste;
    const effectiveTokens = totalTokens - totalWaste;

    // Translation Gap: 有效产出 / 总投入
    const translationGap = totalTokens > 0 ? effectiveTokens / totalTokens : 1;

    // 缓存感知 TG: 非缓存部分的效率
    const nonCacheInput = totalInputTokens - totalCacheHitTokens;
    const cacheAwareTG = nonCacheInput > 0
      ? Math.min(1, totalOutputTokens / nonCacheInput)
      : 1;

    return {
      totalInputTokens,
      totalOutputTokens,
      totalCacheHitTokens,
      totalReasoningTokens,
      translationGap,
      cacheAwareTG,
      waste: {
        retryWaste,
        deadBranchWaste,
        failedWaste,
        totalWaste,
      },
      toolEfficiency: new Map(this.toolStats),
      totalRounds,
      effectiveRounds,
      totalLatencyMs,
    };
  }

  /** 快速获取当前 TG（不生成完整报告） */
  getQuickTG(): number {
    if (this.records.length === 0) return 1;
    const effective = this.identifyEffectiveRounds();
    let effectiveTokens = 0;
    let totalTokens = 0;
    for (const r of this.records) {
      const tokens = r.inputTokens + r.outputTokens;
      totalTokens += tokens;
      if (effective.has(r.round)) effectiveTokens += tokens;
    }
    return totalTokens > 0 ? effectiveTokens / totalTokens : 1;
  }

  /** 获取当前缓存命中率 */
  getCacheHitRate(): number {
    let hits = 0;
    let total = 0;
    for (const r of this.records) {
      hits += r.cacheHitTokens;
      total += r.inputTokens;
    }
    return total > 0 ? hits / total : 0;
  }

  /** 重置追踪器（新对话时调用） */
  reset(): void {
    this.records = [];
    this.toolStats = new Map();
    this.paramSignatureHistory = [];
    this.sessionStart = Date.now();
  }

  /** 获取记录数 */
  getRecordCount(): number {
    return this.records.length;
  }

  /** 判断哪些轮次是有效的 */
  private identifyEffectiveRounds(): Set<number> {
    const effective = new Set<number>();
    const totalRounds = this.records.length;
    if (totalRounds === 0) return effective;

    // 最后一轮始终有效（产生了用户看到的输出）
    effective.add(totalRounds);

    // 中间轮：有成功工具调用且不在重复模式中的轮次
    for (const record of this.records) {
      if (effective.has(record.round)) continue;
      const hasSuccess = record.toolCalls.some(tc => tc.success);
      if (hasSuccess && !this.isRetryOnlyRound(record)) {
        effective.add(record.round);
      }
    }

    return effective;
  }

  /** 判断是否为纯重试轮 */
  private isRetryOnlyRound(record: LLMCallRecord): boolean {
    if (record.toolCalls.length === 0) return false;
    return record.toolCalls.every(tc => {
      const sig = tc.paramSignature;
      const firstIndex = this.paramSignatureHistory.indexOf(sig);
      const lastIndex = this.paramSignatureHistory.lastIndexOf(sig);
      return firstIndex !== lastIndex && this.paramSignatureHistory.indexOf(sig) < this.paramSignatureHistory.lastIndexOf(sig);
    });
  }

  private updateToolStats(tc: ToolCallRecord): void {
    const existing = this.toolStats.get(tc.tool) ?? {
      calls: 0, successes: 0, failures: 0, retries: 0,
      avgLatencyMs: 0, totalResultChars: 0, tg: 1,
    };

    existing.calls++;
    if (tc.success) {
      existing.successes++;
    } else {
      existing.failures++;
    }
    existing.totalResultChars += tc.resultChars;
    existing.avgLatencyMs = (existing.avgLatencyMs * (existing.calls - 1) + tc.latencyMs) / existing.calls;

    // 检查是否为重复调用
    const sigCount = this.paramSignatureHistory.filter(s => s === tc.paramSignature).length;
    if (sigCount > 1) existing.retries++;

    existing.tg = existing.calls > 0 ? existing.successes / existing.calls : 1;
    this.toolStats.set(tc.tool, existing);
  }

  private emptyReport(): EfficiencyReport {
    return {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheHitTokens: 0,
      totalReasoningTokens: 0,
      translationGap: 1,
      cacheAwareTG: 1,
      waste: { retryWaste: 0, deadBranchWaste: 0, failedWaste: 0, totalWaste: 0 },
      toolEfficiency: new Map(),
      totalRounds: 0,
      effectiveRounds: 0,
      totalLatencyMs: 0,
    };
  }
}
