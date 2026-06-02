/**
 * Smart Context Truncator — 智能截断引擎
 *
 * 核心策略：
 * 1. 保留头部 HEAD_CHARS 字符 + 尾部 TAIL_CHARS 字符
 * 2. 中间挖掉的部分生成摘要 + 存入可检索记忆库（通过 ID 引用）
 * 3. 工具调用结果特别长时，只保留最新结果，旧结果移入记忆库
 * 4. 保持"可回溯性" — 任何被截断的内容都可以通过 recall ID 找回
 */

export interface TruncationSegment {
  type: 'head' | 'gap' | 'tail';
  content: string;
  recallId?: string;
}

export interface TruncationResult {
  /** 拼接后的截断文本 */
  truncated: string;
  /** 被挖掉的中间内容（用于存入记忆库） */
  evicted: EvictedContent[];
  /** 原始长度 */
  originalLength: number;
  /** 截断后长度 */
  truncatedLength: number;
  /** 节省的字符数 */
  savedChars: number;
}

export interface EvictedContent {
  recallId: string;
  content: string;
  source: 'message' | 'tool_result' | 'older_tool_result';
  metadata: {
    originalIndex?: number;
    toolName?: string;
    timestamp?: number;
  };
}

export interface SmartTruncatorConfig {
  headChars: number;
  tailChars: number;
  maxToolResultChars: number;
  keepLatestToolResults: number;
  gapSummaryChars: number;
}

export const DEFAULT_TRUNCATOR_CONFIG: SmartTruncatorConfig = {
  headChars: 100,
  tailChars: 100,
  maxToolResultChars: 800,
  keepLatestToolResults: 1,
  gapSummaryChars: 50,
};

export class SmartContextTruncator {
  private config: SmartTruncatorConfig;
  private idCounter = 0;

  constructor(config?: Partial<SmartTruncatorConfig>) {
    this.config = { ...DEFAULT_TRUNCATOR_CONFIG, ...config };
  }

  /**
   * 截断单条消息内容
   *
   * 保留 head + [gap ref] + tail，中间部分标记为 evicted
   */
  truncateContent(
    content: string,
    source: 'message' | 'tool_result' = 'message',
    metadata?: { toolName?: string },
  ): TruncationResult {
    const originalLength = content.length;

    if (originalLength <= this.config.headChars + this.config.tailChars + 20) {
      return {
        truncated: content,
        evicted: [],
        originalLength,
        truncatedLength: originalLength,
        savedChars: 0,
      };
    }

    const { headChars, tailChars } = this.config;
    const head = content.slice(0, headChars);
    const tail = content.slice(-tailChars);
    const middle = content.slice(headChars, -tailChars);

    const recallId = this.generateRecallId();

    const evicted: EvictedContent = {
      recallId,
      content: middle,
      source,
      metadata: {
        originalIndex: headChars,
        toolName: metadata?.toolName,
      },
    };

    const gapMarker = `[...recall:${recallId}...]`;
    const truncated = `${head}${gapMarker}${tail}`;

    return {
      truncated,
      evicted: [evicted],
      originalLength,
      truncatedLength: truncated.length,
      savedChars: originalLength - truncated.length,
    };
  }

  /**
   * 截断工具调用结果块
   *
   * 匹配 [Tool Result: name]\n...\n 格式，
   * 保留最新 N 个完整结果，旧结果只保留摘要
   */
  truncateToolResults(content: string): TruncationResult {
    const toolBlockPattern = /\[Tool Result: (\w+)\]\n([\s\S]*?)(?=\n(?:\[Tool (?:Result|Error):)|$)/g;
    const blocks: Array<{ full: string; name: string; result: string; index: number }> = [];

    let match: RegExpExecArray | null;
    while ((match = toolBlockPattern.exec(content)) !== null) {
      blocks.push({
        full: match[0],
        name: match[1],
        result: match[2],
        index: match.index,
      });
    }

    if (blocks.length === 0) {
      return {
        truncated: content,
        evicted: [],
        originalLength: content.length,
        truncatedLength: content.length,
        savedChars: 0,
      };
    }

    const keepCount = this.config.keepLatestToolResults;
    const allEvicted: EvictedContent[] = [];
    let result = content;

    // 从旧到新处理 — 旧结果做摘要
    const blocksToEvict = blocks.slice(0, Math.max(0, blocks.length - keepCount));

    for (const block of blocksToEvict) {
      if (block.result.length > this.config.maxToolResultChars) {
        const recallId = this.generateRecallId();
        allEvicted.push({
          recallId,
          content: block.result,
          source: 'older_tool_result',
          metadata: { toolName: block.name, timestamp: Date.now() },
        });

        const summary = block.result.slice(0, this.config.gapSummaryChars);
        const replacement = `[Tool Result: ${block.name}] ${summary}... [...recall:${recallId}...]\n`;
        result = result.replace(block.full, replacement);
      }
    }

    // 保留的最新结果也做截断
    const keptBlocks = blocks.slice(Math.max(0, blocks.length - keepCount));
    for (const block of keptBlocks) {
      if (block.result.length > this.config.maxToolResultChars) {
        const recallId = this.generateRecallId();
        const head = block.result.slice(0, this.config.maxToolResultChars);

        allEvicted.push({
          recallId,
          content: block.result.slice(this.config.maxToolResultChars),
          source: 'tool_result',
          metadata: { toolName: block.name },
        });

        const replacement = `[Tool Result: ${block.name}]\n${head}... [...recall:${recallId}...]\n`;
        result = result.replace(block.full, replacement);
      }
    }

    return {
      truncated: result,
      evicted: allEvicted,
      originalLength: content.length,
      truncatedLength: result.length,
      savedChars: content.length - result.length,
    };
  }

  /**
   * 批量截断多条消息
   */
  truncateMessages(
    messages: Array<{ role: string; content: string }>,
  ): {
    messages: Array<{ role: string; content: string }>;
    allEvicted: EvictedContent[];
    totalSaved: number;
  } {
    const allEvicted: EvictedContent[] = [];
    let totalSaved = 0;

    const truncated = messages.map((msg) => {
      const toolResult = this.truncateToolResults(msg.content);
      allEvicted.push(...toolResult.evicted);
      totalSaved += toolResult.savedChars;

      let content = toolResult.truncated;

      if (content.length > this.config.headChars + this.config.tailChars + 20) {
        const contentResult = this.truncateContent(content);
        allEvicted.push(...contentResult.evicted);
        totalSaved += contentResult.savedChars;
        content = contentResult.truncated;
      }

      return { ...msg, content };
    });

    return { messages: truncated, allEvicted, totalSaved };
  }

  private generateRecallId(): string {
    return `rc_${Date.now().toString(36)}_${(this.idCounter++).toString(36)}`;
  }
}
