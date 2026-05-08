/**
 * Consciousness - 意识流事件总线
 *
 * 统一事件总线
 */

import type {
  ConsciousnessEvent,
  EventType,
  TrajectoryEntry,
  TrajectorySegment,
  CompressedTrajectory,
} from './types.js';

/**
 * 意识流接口
 */
export interface IConsciousnessStream {
  // === 事件流 ===
  /**
   * 发布事件
   */
  publish(event: ConsciousnessEvent): Promise<void>;

  /**
   * 订阅事件
   */
  subscribe(
    eventType: EventType,
    callback: (event: ConsciousnessEvent) => void,
  ): () => void;

  /**
   * 订阅所有事件
   */
  subscribeAll(
    callback: (event: ConsciousnessEvent) => void,
  ): () => void;

  /**
   * 获取事件历史
   */
  getHistory(
    filter?: {
      eventType?: EventType;
      startTime?: number;
      endTime?: number;
      limit?: number;
    },
  ): Promise<ConsciousnessEvent[]>;

  // === 轨迹记录 ===
  /**
   * 开始新轨迹片段
   */
  startSegment(phase: string): Promise<string>;

  /**
   * 结束轨迹片段
   */
  endSegment(
    segmentId: string,
    outcome: 'success' | 'failure' | 'partial',
  ): Promise<void>;

  /**
   * 记录轨迹条目
   */
  recordEntry(entry: Omit<TrajectoryEntry, 'id' | 'timestamp'>): Promise<void>;

  /**
   * 获取当前轨迹片段
   */
  getCurrentSegment(): Promise<TrajectorySegment | null>;

  // === 经验回放 ===
  /**
   * 获取轨迹用于回放
   */
  getTrajectory(
    startTime: number,
    endTime: number,
  ): Promise<TrajectorySegment[]>;

  /**
   * 压缩轨迹
   */
  compressTrajectory(
    segmentIds: string[],
  ): Promise<CompressedTrajectory>;

  /**
   * 回放轨迹
   */
  replay(segmentId: string): Promise<TrajectoryEntry[]>;

  // === 流控制 ===
  /**
   * 暂停事件流
   */
  pause(): void;

  /**
   * 恢复事件流
   */
  resume(): void;

  /**
   * 清空历史
   */
  clear(): Promise<void>;

  /**
   * 获取流状态
   */
  getStatus(): StreamStatus;
}

/**
 * 流状态
 */
export interface StreamStatus {
  running: boolean;
  eventCount: number;
  currentSegmentId: string | null;
  memoryUsage: number;
}
