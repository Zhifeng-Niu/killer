/**
 * Hippocampus - Ebbinghaus 遗忘曲线
 *
 * R = e^(-t/S)
 * R = 记忆保持率
 * t = 时间
 * S = 稳定性
 */

import type { Episode } from './types.js';

/**
 * 遗忘曲线配置
 */
export interface ForgettingConfig {
  /**
   * 默认稳定性（初始记忆强度）
   */
  defaultStability: number;

  /**
   * 最小稳定性下限
   */
  minStability: number;

  /**
   * 最大稳定性上限
   */
  maxStability: number;

  /**
   * 回忆一次的稳定性增长系数
   */
  reinforcementFactor: number;

  /**
   * 遗忘阈值（低于此值标记为休眠）
   */
  dormantThreshold: number;

  /**
   * 最小访问间隔（毫秒），防止频繁访问过度增强
   */
  minAccessInterval: number;

  /**
   * 是否启用信息熵衰减
   */
  entropyDecayEnabled: boolean;

  /**
   * 低密度记忆的衰减加速因子 (>1 表示加速)
   */
  lowDensityDecayFactor: number;

  /**
   * 高密度记忆的衰减减速因子 (<1 表示减速)
   */
  highDensityDecayFactor: number;

  /**
   * 信息密度阈值，低于此值视为低密度
   */
  lowDensityThreshold: number;

  /**
   * 信息密度阈值，高于此值视为高密度
   */
  highDensityThreshold: number;
}

/**
 * 默认遗忘曲线配置
 */
export const DEFAULT_FORGETTING_CONFIG: ForgettingConfig = {
  defaultStability: 24 * 60 * 60 * 1000, // 24 小时
  minStability: 60 * 60 * 1000, // 1 小时
  maxStability: 365 * 24 * 60 * 60 * 1000, // 1 年
  reinforcementFactor: 2.0, // 每次回忆翻倍
  dormantThreshold: 0.1, // 10% 保持率以下休眠
  minAccessInterval: 60 * 1000, // 1 分钟
  entropyDecayEnabled: true,
  lowDensityDecayFactor: 3.0,   // 低密度衰减3倍加速
  highDensityDecayFactor: 0.5,  // 高密度衰减减半
  lowDensityThreshold: 0.2,     // Shannon熵归一化后低于20%
  highDensityThreshold: 0.6,    // 高于60%视为高密度
};

/**
 * 信息密度评估结果
 */
export interface InformationDensity {
  /** Shannon 熵（归一化到 [0,1]） */
  shannonEntropy: number;
  /** 词汇独特性比例 */
  uniqueRatio: number;
  /** 综合密度评分 [0,1] */
  densityScore: number;
  /** 密度等级 */
  level: 'empty' | 'low' | 'medium' | 'high';
}

/**
 * 计算文本的信息密度
 *
 * 综合三个指标：
 * 1. Shannon熵：衡量字符/词分布的不可预测性
 * 2. 词汇独特性：不重复词占总词数的比例
 * 3. 内容长度因子：过短的内容密度自然低
 *
 * @param text - 要评估的文本
 * @returns 信息密度评估结果
 */
export function calculateInformationDensity(text: string): InformationDensity {
  if (!text || text.trim().length === 0) {
    return { shannonEntropy: 0, uniqueRatio: 0, densityScore: 0, level: 'empty' };
  }

  // 提取词（支持中英文混合：英文按空格分，中文按字符）
  const tokens = extractTokens(text);
  if (tokens.length === 0) {
    return { shannonEntropy: 0, uniqueRatio: 0, densityScore: 0, level: 'empty' };
  }

  // 1. Shannon熵计算
  const freq = new Map<string, number>();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) || 0) + 1);
  }

  let entropy = 0;
  const len = tokens.length;
  for (const count of freq.values()) {
    const p = count / len;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  // 归一化熵：最大熵 = log2(len)，但用 log2(freq.size) 作为更合理的上限
  const maxEntropy = freq.size > 1 ? Math.log2(freq.size) : 1;
  const normalizedEntropy = Math.min(entropy / maxEntropy, 1);

  // 2. 词汇独特性
  const uniqueRatio = freq.size / len;

  // 3. 长度因子：过短(<10 token)的内容密度打折
  const lengthFactor = len >= 10 ? 1 : len / 10;

  // 综合评分
  const densityScore = (normalizedEntropy * 0.5 + uniqueRatio * 0.35 + lengthFactor * 0.15);

  // 确定等级
  let level: InformationDensity['level'];
  if (densityScore < 0.1) level = 'empty';
  else if (densityScore < 0.3) level = 'low';
  else if (densityScore < 0.5) level = 'medium';
  else level = 'high';

  return { shannonEntropy: normalizedEntropy, uniqueRatio, densityScore, level };
}

/**
 * 提取token，支持中英文混合
 */
function extractTokens(text: string): string[] {
  const tokens: string[] = [];
  // 英文单词
  const englishWords = text.match(/[a-zA-Z]+/g) || [];
  tokens.push(...englishWords.map(w => w.toLowerCase()));
  // 中文字符（连续中文作为单独token，2-gram更好但单字也行）
  const chineseChars = text.match(/[\u4e00-\u9fff]/g) || [];
  tokens.push(...chineseChars);
  // 数字序列
  const numbers = text.match(/\d+/g) || [];
  tokens.push(...numbers);
  return tokens;
}

/**
 * 根据信息密度调整稳定性
 *
 * 低密度记忆初始稳定性降低（加速遗忘）
 * 高密度记忆初始稳定性提高（保护有价值信息）
 *
 * @param baseStability - 基础稳定性
 * @param density - 信息密度评估
 * @param config - 遗忘配置
 * @returns 调整后的稳定性
 */
export function adjustStabilityByDensity(
  baseStability: number,
  density: InformationDensity,
  config: ForgettingConfig = DEFAULT_FORGETTING_CONFIG
): number {
  if (!config.entropyDecayEnabled) return baseStability;

  if (density.level === 'empty') {
    return config.minStability; // 空内容，极低稳定性
  }

  if (density.densityScore < config.lowDensityThreshold) {
    // 低密度：加速衰减
    return Math.max(
      baseStability / config.lowDensityDecayFactor,
      config.minStability
    );
  }

  if (density.densityScore > config.highDensityThreshold) {
    // 高密度：保护性衰减
    return Math.min(
      baseStability * (2 - config.highDensityDecayFactor),
      config.maxStability
    );
  }

  return baseStability;
}

/**
 * 计算记忆保持率
 *
 * Ebbinghaus 遗忘公式：R = e^(-t/S)
 *
 * @param stability - 记忆稳定性（毫秒）
 * @param timeSinceLastAccess - 距离上次访问时间（毫秒）
 * @returns 保持率 [0, 1]
 */
export function calculateRetention(
  stability: number,
  timeSinceLastAccess: number
): number {
  if (stability <= 0) {
    return 0;
  }

  if (timeSinceLastAccess <= 0) {
    return 1;
  }

  const ratio = timeSinceLastAccess / stability;
  return Math.exp(-ratio);
}

/**
 * 判断情节是否应该被回忆
 *
 * 当保持率低于阈值时触发回忆
 *
 * @param episode - 情节记忆
 * @param now - 当前时间戳
 * @param config - 遗忘曲线配置
 * @returns 是否需要回忆
 */
export function shouldRecall(
  episode: Episode,
  now: number,
  config: ForgettingConfig = DEFAULT_FORGETTING_CONFIG
): boolean {
  const timeSinceLastAccess = now - episode.timestamp;
  const retention = calculateRetention(episode.decayRate, timeSinceLastAccess);

  // 检查最小访问间隔
  if (timeSinceLastAccess < config.minAccessInterval) {
    return false;
  }

  return retention < 0.7; // 70% 阈值
}

/**
 * 强化记忆（回忆后调用）
 *
 * 每次成功回忆，增加记忆稳定性
 *
 * @param episode - 情节记忆
 * @param now - 当前时间戳
 * @param config - 遗忘曲线配置
 * @returns 更新后的情节记忆
 */
export function reinforce(
  episode: Episode,
  now: number,
  config: ForgettingConfig = DEFAULT_FORGETTING_CONFIG
): Episode {
  // 增加稳定性（有上限）
  const newStability = Math.min(
    episode.decayRate * config.reinforcementFactor,
    config.maxStability
  );

  return {
    ...episode,
    decayRate: newStability,
    accessCount: episode.accessCount + 1,
    emotionalWeight: Math.min(episode.emotionalWeight * 1.05, 1), // 轻微增强情感权重
    timestamp: now,
  };
}

/**
 * 衰减记忆
 *
 * 应用遗忘曲线，返回衰减后的状态
 *
 * @param episode - 情节记忆
 * @param now - 当前时间戳
 * @returns 更新后的情节记忆
 */
export function decay(episode: Episode, now: number): Episode {
  const timeSinceLastAccess = now - episode.timestamp;
  const retention = calculateRetention(episode.decayRate, timeSinceLastAccess);

  return {
    ...episode,
    emotionalWeight: episode.emotionalWeight * retention,
  };
}

/**
 * 计算下一次复习时间
 *
 * @param episode - 情节记忆
 * @param targetRetention - 目标保持率（默认 0.8）
 * @returns 下次复习时间戳
 */
export function calculateNextReview(
  episode: Episode,
  targetRetention: number = 0.8
): number {
  // R = e^(-t/S) => t = -S * ln(R)
  const timeUntilReview = -episode.decayRate * Math.log(targetRetention);
  return episode.timestamp + timeUntilReview;
}

/**
 * 批量应用遗忘曲线（含信息熵衰减）
 *
 * 对每个episode评估其narrative的信息密度，
 * 低密度记忆加速衰减，高密度记忆保护性衰减
 *
 * @param episodes - 情节记忆集合
 * @param now - 当前时间戳
 * @param config - 遗忘曲线配置
 * @returns 更新后的情节记忆集合
 */
export function applyForgettingCurve(
  episodes: Episode[],
  now: number,
  config: ForgettingConfig = DEFAULT_FORGETTING_CONFIG
): Episode[] {
  return episodes.map((episode) => {
    let decayed = decay(episode, now);

    // 信息熵衰减：根据narrative密度调整衰减速率
    if (config.entropyDecayEnabled) {
      const density = calculateInformationDensity(episode.narrative);
      if (density.level === 'empty' || density.level === 'low') {
        // 低密度额外加速衰减
        const factor = density.level === 'empty' ? 0.5 : 0.7;
        decayed = {
          ...decayed,
          emotionalWeight: decayed.emotionalWeight * factor,
        };
      }
    }

    // 标记为休眠但不删除
    if (decayed.emotionalWeight < config.dormantThreshold) {
      return {
        ...decayed,
        tags: [...new Set([...decayed.tags, 'dormant'])],
      };
    }

    return decayed;
  });
}

/**
 * 获取记忆健康度
 *
 * @param episode - 情节记忆
 * @param now - 当前时间戳
 * @returns 健康度描述
 */
export function getMemoryHealth(
  episode: Episode,
  now: number
): 'strong' | 'moderate' | 'weak' | 'dormant' {
  const retention = calculateRetention(
    episode.decayRate,
    now - episode.timestamp
  );

  if (retention >= 0.8) return 'strong';
  if (retention >= 0.5) return 'moderate';
  if (retention >= 0.1) return 'weak';
  return 'dormant';
}
