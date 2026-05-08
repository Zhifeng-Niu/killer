/**
 * Sensory Router - 感官路由器
 *
 * 管理多个感官渠道，优先级队列，消息路由
 */

import type {
  SensoryInput,
  ChannelMessage,
  SensoryChannel as SensoryChannelEnum,
  SensoryPriority,
  ChannelStatus,
} from './types.js';
import type { ISensoryChannel } from './channel.js';

/**
 * 优先级权重
 */
const PRIORITY_WEIGHT: Record<SensoryPriority, number> = {
  urgent: 1000,
  high: 100,
  normal: 10,
  low: 1,
};

/**
 * 感官路由器
 *
 * 负责渠道注册、输入队列管理、输出路由
 */
export class SensoryRouter {
  private readonly channels: Map<SensoryChannelEnum, ISensoryChannel>;
  private inputQueue: SensoryInput[] = [];
  private inputCallbacks: Set<(input: SensoryInput) => void>;

  constructor() {
    this.channels = new Map();
    this.inputCallbacks = new Set();
  }

  /**
   * 注册渠道
   */
  register(channel: ISensoryChannel): void {
    this.channels.set(channel.getChannelType(), channel);

    // 订阅渠道输入
    channel.onInput((input) => {
      this.enqueueInput(input);
    });
  }

  /**
   * 注销渠道
   */
  async unregister(channelType: SensoryChannelEnum): Promise<void> {
    const channel = this.channels.get(channelType);
    if (channel) {
      await channel.stop();
      this.channels.delete(channelType);
    }
  }

  /**
   * 启动所有渠道
   */
  async startAll(): Promise<void> {
    const startPromises: Promise<void>[] = [];

    for (const channel of this.channels.values()) {
      startPromises.push(channel.start());
    }

    await Promise.all(startPromises);
  }

  /**
   * 停止所有渠道
   */
  async stopAll(): Promise<void> {
    const stopPromises: Promise<void>[] = [];

    for (const channel of this.channels.values()) {
      stopPromises.push(channel.stop());
    }

    await Promise.all(stopPromises);
  }

  /**
   * 获取下一个输入（按优先级）
   */
  next(): SensoryInput | null {
    if (this.inputQueue.length === 0) {
      return null;
    }

    // 按优先级排序
    this.sortQueueByPriority();

    // 返回最高优先级的输入
    return this.inputQueue.shift() ?? null;
  }

  /**
   * 路由输出消息到指定渠道
   */
  async routeOutput(message: ChannelMessage): Promise<void> {
    const channel = this.channels.get(message.channel);

    if (!channel) {
      console.error(
        `[Router] No channel found for: ${message.channel}`,
      );
      return;
    }

    await channel.send(message);
  }

  /**
   * 订阅所有输入
   */
  onInput(callback: (input: SensoryInput) => void): void {
    this.inputCallbacks.add(callback);
  }

  /**
   * 取消订阅输入
   */
  offInput(callback: (input: SensoryInput) => void): void {
    this.inputCallbacks.delete(callback);
  }

  /**
   * 获取已注册的渠道
   */
  getChannels(): ISensoryChannel[] {
    return Array.from(this.channels.values());
  }

  /**
   * 获取渠道状态
   */
  getChannelStatus(channelType: SensoryChannelEnum): ChannelStatus | null {
    const channel = this.channels.get(channelType);
    return channel ? channel.getStatus() : null;
  }

  /**
   * 获取队列大小
   */
  getQueueSize(): number {
    return this.inputQueue.length;
  }

  /**
   * 清空队列
   */
  clearQueue(): void {
    this.inputQueue = [];
  }

  /**
   * 将输入加入队列
   */
  private enqueueInput(input: SensoryInput): void {
    this.inputQueue.push(input);

    // 通知所有订阅者
    this.notifyInputSubscribers(input);
  }

  /**
   * 按优先级排序队列
   */
  private sortQueueByPriority(): void {
    this.inputQueue.sort((a, b) => {
      const weightA = PRIORITY_WEIGHT[a.priority] ?? 0;
      const weightB = PRIORITY_WEIGHT[b.priority] ?? 0;

      // 优先级相同时，按时间戳排序（FIFO）
      if (weightA === weightB) {
        return a.timestamp - b.timestamp;
      }

      return weightB - weightA;
    });
  }

  /**
   * 通知输入订阅者
   */
  private notifyInputSubscribers(input: SensoryInput): void {
    for (const callback of this.inputCallbacks) {
      try {
        callback(input);
      } catch (error) {
        console.error('[Router] Input callback error:', error);
      }
    }
  }
}
