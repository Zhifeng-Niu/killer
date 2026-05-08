/**
 * Sensory Channel - 渠道抽象与基类
 *
 * 定义感官渠道接口和通用实现
 */

import type {
  SensoryInput,
  ChannelMessage,
  ChannelStatus,
  SensoryChannel as SensoryChannelEnum,
} from './types.js';

/**
 * 生成唯一 ID
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 初始化渠道状态
 */
function createInitialStatus(channel: SensoryChannelEnum): ChannelStatus {
  return {
    channel,
    connected: false,
    lastActivity: 0,
    errorCount: 0,
  };
}

/**
 * 感官渠道接口
 *
 * 定义所有感官渠道必须实现的基本功能
 */
export interface ISensoryChannel {
  /**
   * 获取渠道类型
   */
  getChannelType(): SensoryChannelEnum;

  /**
   * 获取渠道状态
   */
  getStatus(): ChannelStatus;

  /**
   * 启动渠道
   */
  start(): Promise<void>;

  /**
   * 停止渠道
   */
  stop(): Promise<void>;

  /**
   * 发送消息到渠道
   */
  send(message: ChannelMessage): Promise<void>;

  /**
   * 订阅输入事件
   */
  onInput(callback: (input: SensoryInput) => void): void;

  /**
   * 取消订阅输入事件
   */
  offInput(callback: (input: SensoryInput) => void): void;
}

/**
 * 感官渠道基类
 *
 * 实现通用的状态管理和订阅机制
 */
export abstract class BaseSensoryChannel implements ISensoryChannel {
  protected readonly channelType: SensoryChannelEnum;
  protected status: ChannelStatus;
  protected readonly inputSubscribers: Set<(input: SensoryInput) => void>;
  protected lastSentMessage: ChannelMessage | null = null;

  constructor(channelType: SensoryChannelEnum) {
    this.channelType = channelType;
    this.status = createInitialStatus(channelType);
    this.inputSubscribers = new Set();
  }

  /**
   * 获取渠道类型
   */
  getChannelType(): SensoryChannelEnum {
    return this.channelType;
  }

  /**
   * 获取当前状态
   */
  getStatus(): ChannelStatus {
    return { ...this.status };
  }

  /**
   * 启动渠道 - 由子类实现
   */
  abstract start(): Promise<void>;

  /**
   * 停止渠道 - 由子类实现
   */
  abstract stop(): Promise<void>;

  /**
   * 发送消息 - 由子类实现
   */
  abstract send(message: ChannelMessage): Promise<void>;

  /**
   * 订阅输入事件
   */
  onInput(callback: (input: SensoryInput) => void): void {
    this.inputSubscribers.add(callback);
  }

  /**
   * 取消订阅输入事件
   */
  offInput(callback: (input: SensoryInput) => void): void {
    this.inputSubscribers.delete(callback);
  }

  /**
   * 通知所有订阅者有新输入
   */
  protected notifyInput(input: SensoryInput): void {
    for (const callback of this.inputSubscribers) {
      try {
        callback(input);
      } catch (error) {
        this.handleCallbackError(error);
      }
    }
  }

  /**
   * 更新渠道状态
   */
  protected updateStatus(updates: Partial<ChannelStatus>): void {
    this.status = { ...this.status, ...updates };
  }

  /**
   * 记录活动时间
   */
  protected recordActivity(): void {
    this.updateStatus({ lastActivity: Date.now() });
  }

  /**
   * 记录错误
   */
  protected recordError(): void {
    this.updateStatus({
      errorCount: this.status.errorCount + 1,
    });
  }

  /**
   * 处理回调错误
   */
  private handleCallbackError(error: unknown): void {
    // 记录错误但不中断其他订阅者
    const errorMsg =
      error instanceof Error ? error.message : String(error);
    console.error(`[Channel:${this.channelType}] Callback error:`, errorMsg);
    this.recordError();
  }

  /**
   * 创建感官输入
   */
  protected createInput(
    source: string,
    content: string,
    priority: SensoryInput['priority'] = 'normal',
    metadata: Record<string, unknown> = {},
  ): SensoryInput {
    return {
      id: generateId('input'),
      timestamp: Date.now(),
      channel: this.channelType,
      source,
      content,
      metadata,
      priority,
    };
  }

  /**
   * 创建渠道消息
   */
  protected createMessage(
    type: ChannelMessage['type'],
    content: string,
    metadata?: Record<string, unknown>,
  ): ChannelMessage {
    return {
      id: generateId('msg'),
      timestamp: Date.now(),
      channel: this.channelType,
      type,
      content,
      metadata,
    };
  }
}
