/**
 * Recallable Memory Store — 可检索记忆库
 *
 * 专门存储被 SmartContextTruncator 截断的内容。
 * 支持：
 * 1. 按 recall ID 精确查找（O(1)）
 * 2. 按关键词模糊搜索（TF-IDF）
 * 3. 按来源过滤（message / tool_result / older_tool_result）
 * 4. 容量淘汰（LRU + 重要性加权）
 */

import type { EvictedContent } from './smart-truncator.js';

export interface RecallEntry extends EvictedContent {
  /** 入库时间 */
  storedAt: number;
  /** 被召回次数（热度指标） */
  recallCount: number;
  /** 最后被召回的时间 */
  lastRecalledAt: number | null;
  /** TF-IDF 词频向量（懒计算） */
  termVector?: Map<string, number>;
}

export interface RecallQuery {
  /** 按关键词搜索 */
  keyword?: string;
  /** 按 recall ID 精确查找 */
  recallId?: string;
  /** 按来源过滤 */
  source?: EvictedContent['source'];
  /** 按工具名过滤 */
  toolName?: string;
  /** 返回数量上限 */
  limit?: number;
}

export interface RecallResult {
  entries: RecallEntry[];
  /** 搜索耗时 ms */
  queryTimeMs: number;
  /** 总匹配数 */
  totalMatches: number;
}

export interface RecallableStoreConfig {
  /** 最大条目数 */
  maxEntries: number;
  /** 单条内容最大字符数（超过则二次截断） */
  maxEntryChars: number;
  /** TF-IDF 最小文档频率 */
  minDocFreq: number;
}

const DEFAULT_STORE_CONFIG: RecallableStoreConfig = {
  maxEntries: 500,
  maxEntryChars: 10_000,
  minDocFreq: 1,
};

export class RecallableMemoryStore {
  private entries: Map<string, RecallEntry> = new Map();
  private config: RecallableStoreConfig;
  private documentCount = 0;

  // 倒排索引：term → Set<recallId>
  private invertedIndex: Map<string, Set<string>> = new Map();

  constructor(config?: Partial<RecallableStoreConfig>) {
    this.config = { ...DEFAULT_STORE_CONFIG, ...config };
  }

  /**
   * 存储被截断的内容
   */
  store(evicted: EvictedContent): string {
    // 容量保护
    if (this.entries.size >= this.config.maxEntries) {
      this.evictColdest();
    }

    const entry: RecallEntry = {
      ...evicted,
      storedAt: Date.now(),
      recallCount: 0,
      lastRecalledAt: null,
    };

    // 二次截断保护
    if (entry.content.length > this.config.maxEntryChars) {
      entry.content = entry.content.slice(0, this.config.maxEntryChars) + '...[secondary-truncation]';
    }

    this.entries.set(evicted.recallId, entry);
    this.documentCount++;

    // 更新倒排索引
    this.indexEntry(entry);

    return evicted.recallId;
  }

  /**
   * 批量存储
   */
  storeBatch(evictedList: EvictedContent[]): string[] {
    return evictedList.map(e => this.store(e));
  }

  /**
   * 按 recall ID 精确查找
   */
  recall(recallId: string): RecallEntry | null {
    const entry = this.entries.get(recallId);
    if (!entry) return null;

    entry.recallCount++;
    entry.lastRecalledAt = Date.now();

    return { ...entry };
  }

  /**
   * 搜索被截断的内容
   */
  search(query: RecallQuery): RecallResult {
    const startedAt = Date.now();

    // 精确 ID 查找
    if (query.recallId) {
      const entry = this.recall(query.recallId);
      return {
        entries: entry ? [entry] : [],
        queryTimeMs: Date.now() - startedAt,
        totalMatches: entry ? 1 : 0,
      };
    }

    // 关键词搜索
    let candidates = Array.from(this.entries.values());

    // 按来源过滤
    if (query.source) {
      candidates = candidates.filter(e => e.source === query.source);
    }

    // 按工具名过滤
    if (query.toolName) {
      candidates = candidates.filter(e => e.metadata.toolName === query.toolName);
    }

    // 关键词排序
    if (query.keyword) {
      const terms = this.tokenize(query.keyword);
      const scored = candidates.map(entry => {
        let score = 0;
        for (const term of terms) {
          const posting = this.invertedIndex.get(term);
          if (posting?.has(entry.recallId)) {
            // TF-IDF 简化：idf = log(N / df)
            const df = posting.size;
            const idf = Math.log(this.documentCount / (df || 1));
            score += idf;
          }
        }
        // 热度加权：被召回过的条目略微提权
        score += entry.recallCount * 0.1;
        return { entry, score };
      });

      scored.sort((a, b) => b.score - a.score);
      candidates = scored.filter(s => s.score > 0).map(s => s.entry);
    }

    const limit = query.limit ?? 10;
    const results = candidates.slice(0, limit);

    return {
      entries: results.map(e => ({ ...e })),
      queryTimeMs: Date.now() - startedAt,
      totalMatches: candidates.length,
    };
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalEntries: number;
    totalChars: number;
    bySource: Record<string, number>;
    avgRecallCount: number;
    indexSize: number;
  } {
    let totalChars = 0;
    let totalRecalls = 0;
    const bySource: Record<string, number> = {};

    for (const entry of this.entries.values()) {
      totalChars += entry.content.length;
      totalRecalls += entry.recallCount;
      bySource[entry.source] = (bySource[entry.source] ?? 0) + 1;
    }

    return {
      totalEntries: this.entries.size,
      totalChars,
      bySource,
      avgRecallCount: this.entries.size > 0 ? totalRecalls / this.entries.size : 0,
      indexSize: this.invertedIndex.size,
    };
  }

  /**
   * 生成上下文注入文本
   *
   * 将当前记忆库中最相关的条目摘要注入到上下文中，
   * 让 LLM 知道有哪些可回溯的内容
   */
  getContextSummary(maxEntries: number = 5): string {
    if (this.entries.size === 0) return '';

    // 按最近召回时间排序，未召回的按存储时间排序
    const sorted = Array.from(this.entries.values())
      .sort((a, b) => {
        const aTime = a.lastRecalledAt ?? a.storedAt;
        const bTime = b.lastRecalledAt ?? b.storedAt;
        return bTime - aTime;
      })
      .slice(0, maxEntries);

    const lines = sorted.map(e => {
      const preview = e.content.slice(0, 60).replace(/\n/g, ' ');
      const sourceTag = e.source === 'tool_result' ? `[tool:${e.metadata.toolName}]` : `[${e.source}]`;
      return `  - ${e.recallId} ${sourceTag} "${preview}..."`;
    });

    return `[Recallable memory: ${this.entries.size} entries, use /recall ID to retrieve]\n${lines.join('\n')}`;
  }

  /**
   * 清空记忆库
   */
  clear(): void {
    this.entries.clear();
    this.invertedIndex.clear();
    this.documentCount = 0;
  }

  // === 私有方法 ===

  private indexEntry(entry: RecallEntry): void {
    const terms = this.tokenize(entry.content);
    for (const term of terms) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, new Set());
      }
      this.invertedIndex.get(term)!.add(entry.recallId);
    }
  }

  private tokenize(text: string): string[] {
    // 简单分词：按空格和标点拆分，转小写，过滤短词
    return text
      .toLowerCase()
      .replace(/[^\w一-鿿]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 2);
  }

  private evictColdest(): void {
    // 淘汰最冷门的条目（recallCount 最低 + storedAt 最久远）
    let coldest: { id: string; score: number } | null = null;

    for (const [id, entry] of this.entries) {
      // 综合分数：召回次数权重高，时间权重低
      const ageHours = (Date.now() - entry.storedAt) / 3_600_000;
      const score = entry.recallCount * 10 - ageHours;
      if (!coldest || score < coldest.score) {
        coldest = { id, score };
      }
    }

    if (coldest) {
      const entry = this.entries.get(coldest.id);
      if (entry) {
        // 清理倒排索引
        const terms = this.tokenize(entry.content);
        for (const term of terms) {
          const posting = this.invertedIndex.get(term);
          if (posting) {
            posting.delete(coldest.id);
            if (posting.size === 0) {
              this.invertedIndex.delete(term);
            }
          }
        }
        this.entries.delete(coldest.id);
        this.documentCount = Math.max(0, this.documentCount - 1);
      }
    }
  }
}
