/**
 * Consciousness - 意识流实现
 *
 * 统一事件总线
 */

import type {
  ConsciousnessEvent,
  EventType,
  EventSource,
  TrajectoryEntry,
  TrajectorySegment,
  CompressedTrajectory,
} from './types.js';

/**
 * 事件阶段
 */
export type EventPhase =
  | 'perception'
  | 'reasoning'
  | 'action'
  | 'reflection'
  | 'evolution';

/**
 * 事件处理器
 */
type EventHandler = (event: ConsciousnessEvent) => void;

/**
 * 订阅信息
 */
interface EventSubscription {
  phase?: EventPhase;
  eventType?: EventType;
  handler: EventHandler;
}

/**
 * 意识流实现
 *
 * 基于 EventEmitter 模式的统一事件总线
 */
export class ConsciousnessStream {
  private events: ConsciousnessEvent[] = [];
  private subscriptions: Set<EventSubscription> = new Set();
  private trajectorySegments: Map<string, TrajectorySegment> = new Map();
  private currentSegmentId: string | null = null;
  private paused = false;
  private maxEvents = 10000;
  private maxSegments = 1000;

  /**
   * 发布事件
   */
  emit(event: Omit<ConsciousnessEvent, 'id' | 'timestamp'>): ConsciousnessEvent {
    if (this.paused) {
      // 暂停时不发布，但返回事件对象
      const fullEvent: ConsciousnessEvent = {
        ...event,
        id: this.generateEventId(),
        timestamp: Date.now(),
      };
      return fullEvent;
    }

    const fullEvent: ConsciousnessEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: Date.now(),
    };

    this.events.push(fullEvent);

    // 限制事件数量
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // 触发订阅
    this.notifySubscribers(fullEvent);

    return fullEvent;
  }

  /**
   * 订阅特定阶段的事件
   */
  on(phase: EventPhase, handler: EventHandler): () => void {
    const subscription: EventSubscription = { phase, handler };
    this.subscriptions.add(subscription);

    return () => {
      this.subscriptions.delete(subscription);
    };
  }

  /**
   * 订阅特定类型的事件
   */
  onType(eventType: EventType, handler: EventHandler): () => void {
    const subscription: EventSubscription = { eventType, handler };
    this.subscriptions.add(subscription);

    return () => {
      this.subscriptions.delete(subscription);
    };
  }

  /**
   * 订阅所有事件
   */
  onAll(handler: EventHandler): () => void {
    const subscription: EventSubscription = { handler };
    this.subscriptions.add(subscription);

    return () => {
      this.subscriptions.delete(subscription);
    };
  }

  /**
   * 获取当前意识状态
   */
  getCurrentState(): ConsciousnessEvent[] {
    // 返回最近的事件
    const limit = 100;
    return this.events.slice(-limit);
  }

  /**
   * 获取历史事件
   */
  getHistory(filter?: {
    eventType?: EventType;
    source?: EventSource;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): ConsciousnessEvent[] {
    let filtered = [...this.events];

    if (filter?.eventType) {
      filtered = filtered.filter((e) => e.type === filter.eventType);
    }

    if (filter?.source) {
      filtered = filtered.filter((e) => e.source === filter.source);
    }

    if (filter?.startTime !== undefined) {
      filtered = filtered.filter((e) => e.timestamp >= filter.startTime!);
    }

    if (filter?.endTime !== undefined) {
      filtered = filtered.filter((e) => e.timestamp <= filter.endTime!);
    }

    if (filter?.limit) {
      filtered = filtered.slice(-filter.limit);
    }

    return filtered;
  }

  /**
   * 开始新轨迹片段
   */
  startSegment(phase: string): string {
    const segmentId = `segment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const segment: TrajectorySegment = {
      id: segmentId,
      startTime: Date.now(),
      endTime: 0,
      entries: [],
      outcome: 'partial',
    };

    this.trajectorySegments.set(segmentId, segment);
    this.currentSegmentId = segmentId;

    // 限制片段数量
    if (this.trajectorySegments.size > this.maxSegments) {
      const oldestKey = Array.from(this.trajectorySegments.keys())[0];
      this.trajectorySegments.delete(oldestKey);
    }

    return segmentId;
  }

  /**
   * 结束轨迹片段
   */
  endSegment(
    segmentId: string,
    outcome: 'success' | 'failure' | 'partial',
  ): void {
    const segment = this.trajectorySegments.get(segmentId);
    if (!segment) {
      return;
    }

    segment.endTime = Date.now();
    segment.outcome = outcome;

    if (this.currentSegmentId === segmentId) {
      this.currentSegmentId = null;
    }
  }

  /**
   * 记录轨迹条目
   */
  recordEntry(entry: Omit<TrajectoryEntry, 'id' | 'timestamp'>): void {
    if (!this.currentSegmentId) {
      // 如果没有当前片段，自动开始一个
      this.startSegment(entry.phase);
    }

    const segment = this.trajectorySegments.get(this.currentSegmentId!);
    if (!segment) {
      return;
    }

    const fullEntry: TrajectoryEntry = {
      ...entry,
      id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };

    segment.entries.push(fullEntry);
  }

  /**
   * 获取当前轨迹片段
   */
  getCurrentSegment(): TrajectorySegment | null {
    if (!this.currentSegmentId) {
      return null;
    }
    return this.trajectorySegments.get(this.currentSegmentId) ?? null;
  }

  /**
   * 获取轨迹用于回放
   */
  getTrajectory(startTime: number, endTime: number): TrajectorySegment[] {
    const segments: TrajectorySegment[] = [];

    for (const segment of this.trajectorySegments.values()) {
      if (segment.startTime >= startTime && segment.startTime <= endTime) {
        segments.push(segment);
      }
    }

    return segments;
  }

  /**
   * 压缩轨迹
   */
  compressTrajectory(segmentIds: string[]): CompressedTrajectory {
    const segments = segmentIds
      .map((id) => this.trajectorySegments.get(id))
      .filter(Boolean) as TrajectorySegment[];

    if (segments.length === 0) {
      return {
        id: `compressed-${Date.now()}`,
        startTime: Date.now(),
        endTime: Date.now(),
        segments: 0,
        compressed: [],
        compressionRatio: 0,
        keyInsights: [],
      };
    }

    // 按时间排序
    const sorted = segments.sort((a, b) => a.startTime - b.startTime);

    // 简化压缩：合并相似的片段
    const compressed: TrajectorySegment[] = [];
    let currentSegment = { ...sorted[0] };

    for (let i = 1; i < sorted.length; i++) {
      const segment = sorted[i];

      // 如果结果相同，合并
      if (segment.outcome === currentSegment.outcome) {
        currentSegment.entries.push(...segment.entries);
        currentSegment.endTime = segment.endTime;
      } else {
        compressed.push(currentSegment);
        currentSegment = { ...segment };
      }
    }
    compressed.push(currentSegment);

    // 提取关键洞察
    const keyInsights = this.extractKeyInsights(compressed);

    return {
      id: `compressed-${Date.now()}`,
      startTime: sorted[0].startTime,
      endTime: sorted[sorted.length - 1].endTime,
      segments: segments.length,
      compressed,
      compressionRatio: segments.length / compressed.length,
      keyInsights,
    };
  }

  /**
   * 提取关键洞察
   */
  private extractKeyInsights(segments: TrajectorySegment[]): string[] {
    const insights: string[] = [];

    const successCount = segments.filter((s) => s.outcome === 'success').length;
    const failureCount = segments.filter((s) => s.outcome === 'failure').length;

    if (successCount > segments.length * 0.7) {
      insights.push('High success rate detected');
    }

    if (failureCount > segments.length * 0.3) {
      insights.push('Significant failure rate detected');
    }

    const avgEntries =
      segments.reduce((sum, s) => sum + s.entries.length, 0) / segments.length;

    if (avgEntries > 50) {
      insights.push('Complex workflows with many steps');
    } else if (avgEntries < 10) {
      insights.push('Simple, direct workflows');
    }

    return insights;
  }

  /**
   * 回放轨迹
   */
  replay(segmentId: string): TrajectoryEntry[] {
    const segment = this.trajectorySegments.get(segmentId);
    return segment?.entries ?? [];
  }

  /**
   * 获取历史轨迹（压缩）
   */
  getCompressedTrajectory(): string {
    const recent = Array.from(this.trajectorySegments.values()).slice(-10);

    if (recent.length === 0) {
      return 'No trajectory recorded';
    }

    const compressed = this.compressTrajectory(recent.map((s) => s.id));

    return JSON.stringify({
      duration: compressed.endTime - compressed.startTime,
      segments: compressed.segments,
      compressed: compressed.compressed.length,
      insights: compressed.keyInsights,
    });
  }

  /**
   * 暂停事件流
   */
  pause(): void {
    this.paused = true;
  }

  /**
   * 恢复事件流
   */
  resume(): void {
    this.paused = false;
  }

  /**
   * 清空历史
   */
  async clear(): Promise<void> {
    this.events = [];
    this.trajectorySegments.clear();
    this.currentSegmentId = null;
  }

  /**
   * 关闭意识流，释放所有订阅和资源
   */
  shutdown(): void {
    this.subscriptions.clear();
    this.events = [];
    this.trajectorySegments.clear();
    this.currentSegmentId = null;
    this.paused = true;
  }

  /**
   * 获取流状态
   */
  getStatus(): {
    running: boolean;
    eventCount: number;
    currentSegmentId: string | null;
    segmentCount: number;
    memoryUsage: number;
  } {
    return {
      running: !this.paused,
      eventCount: this.events.length,
      currentSegmentId: this.currentSegmentId,
      segmentCount: this.trajectorySegments.size,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  /**
   * 估算内存使用（字节）
   */
  private estimateMemoryUsage(): number {
    const eventSize = JSON.stringify(this.events).length;
    const segmentSize = JSON.stringify(Array.from(this.trajectorySegments.values())).length;
    return eventSize + segmentSize;
  }

  /**
   * 通知订阅者
   */
  private notifySubscribers(event: ConsciousnessEvent): void {
    for (const sub of this.subscriptions) {
      let shouldNotify = true;

      if (sub.phase) {
        // 检查阶段匹配（简单映射）
        const phaseMap: Record<string, EventType[]> = {
          perception: ['loop.perception_received', 'sensory.input_received'],
          reasoning: ['loop.reasoning_complete'],
          action: ['loop.action_executed'],
          reflection: ['loop.reflection_complete'],
          evolution: ['loop.evolution_complete', 'evolution.mutation_generated'],
        };

        const relevantTypes = phaseMap[sub.phase] ?? [];
        shouldNotify = relevantTypes.includes(event.type);
      }

      if (shouldNotify && sub.eventType) {
        shouldNotify = event.type === sub.eventType;
      }

      if (shouldNotify) {
        try {
          sub.handler(event);
        } catch (error) {
          // 处理器错误不影响其他订阅者
          console.error('Event handler error:', error);
        }
      }
    }
  }

  /**
   * 生成事件 ID
   */
  private generateEventId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
