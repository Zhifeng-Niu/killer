/**
 * Sensory Mapper - 感官映射
 *
 * 将感官输入映射到主循环的感知
 */

import type { PerceptionSource, PerceptionPriority } from '@killer/core';
import type { SensoryInput } from '../sensory/types.js';

/**
 * 映射感官优先级到感知优先级
 */
export function mapSensoryPriority(
  priority: SensoryInput['priority'],
): PerceptionPriority {
  const map: Record<SensoryInput['priority'], PerceptionPriority> = {
    urgent: 'critical',
    high: 'high',
    normal: 'normal',
    low: 'low',
  };
  return map[priority] ?? 'normal';
}

/**
 * 映射感官渠道到感知来源
 */
export function mapSensoryChannelToSource(
  channel: SensoryInput['channel'],
): PerceptionSource {
  const map: Record<SensoryInput['channel'], PerceptionSource> = {
    cli: 'cli',
    telegram: 'telegram',
    discord: 'discord',
    web: 'internal', // web 渠道映射到 internal
    file_watcher: 'file',
    code: 'code',
  };
  return map[channel] ?? 'internal';
}
