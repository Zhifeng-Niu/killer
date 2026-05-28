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
};

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
 * 批量应用遗忘曲线
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
    const decayed = decay(episode, now);

    // 标记为休眠但不删除
    if (decayed.emotionalWeight < config.dormantThreshold) {
      return {
        ...decayed,
        tags: [...decayed.tags, 'dormant'],
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
