/**
 * Decision Entropy Detector — 基于信息熵的决策点检测
 *
 * 灵感来源: "Reasoning with Sampling: Cutting at Decision Points" (arXiv:2605.30327)
 *   - 推理trace中真正关键的"决策点"很少
 *   - 用信息熵跳变作为决策点的代理信号
 *   - 混合时间从token数降到决策数
 *
 * 在 Odysseus 中的应用：
 *   - auto_mission waypoint选择：不在随机位置重试，而是聚焦在"真正有分歧"的决策点
 *   - 工具链分析：识别哪步工具调用是真正的分叉点
 *   - 记忆巩固：高熵时刻值得特别保留
 */

export interface DecisionPoint {
  /** 决策点在序列中的索引 */
  index: number;
  /** 信息熵值 */
  entropy: number;
  /** 熵跳变量（与上一个点的熵差） */
  deltaEntropy: number;
  /** 标签 */
  label: string;
  /** 原始内容摘要 */
  context: string;
}

export interface EntropyAnalysis {
  /** 所有决策点，按entropy降序排列 */
  decisionPoints: DecisionPoint[];
  /** 平均熵 */
  meanEntropy: number;
  /** 熵的标准差 */
  stdEntropy: number;
  /** 决策阈值（mean + 1.5 * std） */
  threshold: number;
  /** 关键决策点数（超过阈值的） */
  criticalCount: number;
  /** 序列总长度 */
  sequenceLength: number;
}

/**
 * Shannon 熵计算
 * H(X) = -Σ p(x) log2(p(x))
 */
function shannonEntropy(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  return -values.reduce((h, v) => {
    const p = v / sum;
    return h + (p > 0 ? p * Math.log2(p) : 0);
  }, 0);
}

/**
 * 计算序列中每个位置的信息熵
 *
 * 对于工具调用序列，熵定义为一个滑窗内的"行动多样性"：
 * - 如果窗口内所有操作相同 → 低熵（确定性行为）
 * - 如果窗口内操作多样 → 高熵（决策分支）
 *
 * @param sequence - 操作标签序列（如 ['tool_A', 'tool_A', 'tool_B', 'tool_C', ...]）
 * @param windowSize - 滑动窗口大小
 * @returns 每个位置的熵值数组
 */
export function computeSequenceEntropy(sequence: string[], windowSize: number = 3): number[] {
  if (sequence.length === 0) return [];
  if (windowSize <= 0) windowSize = 1;

  const entropies: number[] = [];

  for (let i = 0; i < sequence.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(sequence.length, i + Math.ceil(windowSize / 2));
    const window = sequence.slice(start, end);

    // 计算窗口内各标签的频率
    const freq: Record<string, number> = {};
    for (const item of window) {
      freq[item] = (freq[item] || 0) + 1;
    }

    entropies.push(shannonEntropy(Object.values(freq)));
  }

  return entropies;
}

/**
 * 基于文本内容的决策熵
 *
 * 对文本序列，用"词汇独特性"作为熵的代理：
 * - 高独特性 → 信息密度高 → 可能是决策点
 * - 低独特性 → 模式化语言 → 可能是填充
 *
 * @param texts - 文本片段序列
 * @param windowSize - 滑窗大小
 * @returns 每个位置的熵值
 */
export function computeTextEntropy(texts: string[], windowSize: number = 3): number[] {
  if (texts.length === 0) return [];

  // 将每段文本tokenize为简单词袋
  const tokenized: string[][] = texts.map(text =>
    text.toLowerCase().split(/\s+/).filter(w => w.length > 1)
  );

  const entropies: number[] = [];

  for (let i = 0; i < tokenized.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(tokenized.length, i + Math.ceil(windowSize / 2));

    // 收集窗口内所有token，计算类型-词符比（TTR）作为信息密度
    const allTokens: string[] = [];
    for (let j = start; j < end; j++) {
      allTokens.push(...tokenized[j]);
    }

    const types = new Set(allTokens).size;
    const tokens = allTokens.length;
    // TTR + 归一化 → 熵代理
    entropies.push(tokens > 0 ? types / tokens : 0);
  }

  return entropies;
}

/**
 * 识别序列中的关键决策点
 *
 * @param entropies - 熵值序列
 * @param labels - 每个位置的标签（用于输出context）
 * @param contexts - 每个位置的上下文摘要
 * @returns 完整的熵分析结果
 */
export function detectDecisionPoints(
  entropies: number[],
  labels?: string[],
  contexts?: string[],
): EntropyAnalysis {
  if (entropies.length === 0) {
    return {
      decisionPoints: [],
      meanEntropy: 0,
      stdEntropy: 0,
      threshold: 0,
      criticalCount: 0,
      sequenceLength: 0,
    };
  }

  // 计算均值和标准差
  const mean = entropies.reduce((a, b) => a + b, 0) / entropies.length;
  const variance = entropies.reduce((a, b) => a + (b - mean) ** 2, 0) / entropies.length;
  const std = Math.sqrt(variance);

  // 阈值 = mean + 1.5 * std（arxiv论文用的是信息熵跳变，这里用类似统计标准）
  const threshold = mean + 1.5 * std;

  // 计算熵跳变
  const deltaEntropies = entropies.map((e, i) =>
    i === 0 ? e : e - entropies[i - 1]
  );

  // 提取超过阈值的点
  const decisionPoints: DecisionPoint[] = entropies
    .map((entropy, i) => ({
      index: i,
      entropy,
      deltaEntropy: deltaEntropies[i],
      label: labels?.[i] ?? `step_${i}`,
      context: contexts?.[i] ?? '',
    }))
    .filter(p => p.entropy >= threshold)
    .sort((a, b) => b.entropy - a.entropy);

  return {
    decisionPoints,
    meanEntropy: mean,
    stdEntropy: std,
    threshold,
    criticalCount: decisionPoints.length,
    sequenceLength: entropies.length,
  };
}

/**
 * 对auto_mission的hypothesis历史进行熵分析
 *
 * 从cerebellum的历史中提取已尝试的hypothesis序列，
 * 找出哪些waypoint是"决策分叉点"。
 *
 * @param hypotheses - 历史hypothesis列表
 * @returns 熵分析，指出下一个waypoint应该聚焦在哪里
 */
export function analyzeMissionEntropy(hypotheses: string[]): {
  topDecisionPoints: DecisionPoint[];
  recommendation: string;
} {
  if (hypotheses.length === 0) {
    return { topDecisionPoints: [], recommendation: 'No history yet. Start from any direction.' };
  }

  // 用text entropy分析hypothesis序列
  const entropies = computeTextEntropy(hypotheses, 3);
  const analysis = detectDecisionPoints(
    entropies,
    hypotheses.map((h, i) => `wp_${i}`),
    hypotheses.map(h => h.slice(0, 80)),
  );

  const top = analysis.decisionPoints.slice(0, 3);

  let recommendation: string;
  if (top.length === 0) {
    recommendation = 'All waypoints show similar information density. Explore a fundamentally different approach.';
  } else {
    const indices = top.map(p => p.index).join(', ');
    recommendation = `Key decision points at waypoints [${indices}]. Next waypoint should target the highest-uncertainty dimension: wp_${top[0].index}.`;
  }

  return { topDecisionPoints: top, recommendation };
}
