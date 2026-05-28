/**
 * Sensory - 感官层类型定义
 *
 * 多渠道感知
 */

/**
 * 感官渠道类型
 */
export enum SensoryChannel {
  CLI = 'cli',
  Telegram = 'telegram',
  Discord = 'discord',
  Web = 'web',
  FileWatcher = 'file_watcher',
  Code = 'code',
}

/**
 * 感官输入
 */
export interface SensoryInput {
  id: string;
  timestamp: number;
  channel: SensoryChannel;
  source: string; // 来源标识（如用户 ID、文件路径等）
  content: string;
  metadata: Record<string, unknown>;
  priority: SensoryPriority;
}

export type SensoryPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * 渠道状态
 */
export interface ChannelStatus {
  channel: SensoryChannel;
  connected: boolean;
  lastActivity: number;
  errorCount: number;
}

/**
 * 感官配置
 */
export interface SensoryConfig {
  /**
   * 启用的渠道
   */
  enabledChannels: SensoryChannel[];

  /**
   * 输入缓冲区大小
   */
  bufferSize: number;

  /**
   * 是否启用持久化
   */
  persistent: boolean;
}

/**
 * 消息类型
 */
export type MessageType =
  | 'text'
  | 'thinking'
  | 'action'
  | 'result'
  | 'error'
  | 'dream'
  | 'evolution';

/**
 * 渠道消息
 */
export interface ChannelMessage {
  id: string;
  timestamp: number;
  channel: SensoryChannel;
  type: MessageType;
  content: string;
  metadata?: Record<string, unknown>;
}
