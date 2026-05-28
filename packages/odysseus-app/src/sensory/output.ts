/**
 * Output Manager - 输出管理器
 *
 * 格式化和路由消息到感官渠道
 */

import type { SensoryRouter } from './router.js';
import type { ChannelMessage, MessageType, SensoryChannel } from './types.js';
import { SensoryChannel as SensoryChannelEnum } from './types.js';

/**
 * 行动结果接口
 */
interface ActionResult {
  type: string;
  status: string;
}

/**
 * 输出管理器
 *
 * 负责格式化消息并路由到正确的渠道
 */
export class OutputManager {
  private readonly router: SensoryRouter;

  constructor(router: SensoryRouter) {
    this.router = router;
  }

  /**
   * 处理行动结果
   */
  async handleActionResult(
    action: ActionResult,
    result: unknown,
  ): Promise<void> {
    const messageType = this.getStatusMessageType(action.status);
    const content = this.formatActionResult(action, result);

    const message = this.formatMessage(messageType, content);

    await this.router.routeOutput(message);
  }

  /**
   * 广播思考消息到所有渠道
   */
  async broadcastThinking(content: string): Promise<void> {
    const channels = this.router.getChannels();

    for (const channel of channels) {
      const message = this.formatMessage('thinking', content, channel.getChannelType());
      await this.router.routeOutput(message);
    }
  }

  /**
   * 发送结果消息
   */
  async sendResult(content: string, channel?: SensoryChannel): Promise<void> {
    const targetChannel = channel ?? this.getDefaultChannel();
    const message = this.formatMessage('result', content, targetChannel);
    await this.router.routeOutput(message);
  }

  /**
   * 发送错误消息
   */
  async sendError(content: string, channel?: SensoryChannel): Promise<void> {
    const targetChannel = channel ?? this.getDefaultChannel();
    const message = this.formatMessage('error', content, targetChannel);
    await this.router.routeOutput(message);
  }

  /**
   * 发送动作消息
   */
  async sendAction(content: string, channel?: SensoryChannel): Promise<void> {
    const targetChannel = channel ?? this.getDefaultChannel();
    const message = this.formatMessage('action', content, targetChannel);
    await this.router.routeOutput(message);
  }

  /**
   * 发送梦境消息
   */
  async sendDream(content: string, channel?: SensoryChannel): Promise<void> {
    const targetChannel = channel ?? this.getDefaultChannel();
    const message = this.formatMessage('dream', content, targetChannel);
    await this.router.routeOutput(message);
  }

  /**
   * 发送演化消息
   */
  async sendEvolution(content: string, channel?: SensoryChannel): Promise<void> {
    const targetChannel = channel ?? this.getDefaultChannel();
    const message = this.formatMessage('evolution', content, targetChannel);
    await this.router.routeOutput(message);
  }

  /**
   * 格式化梦境结果
   */
  formatDreamResult(result: unknown): ChannelMessage {
    // DreamResult interface (from @odysseus/core)
    const dreamResult = result as {
      episodesReplayed: number;
      patternsExtracted: number;
      memoriesConsolidated: number;
      memoriesDecayed: number;
      insights: string[];
    };

    const lines = [
      '🌙 Dream cycle completed',
      `📖 Episodes replayed: ${dreamResult.episodesReplayed}`,
      `🔍 Patterns extracted: ${dreamResult.patternsExtracted}`,
      `💡 Insights: ${dreamResult.insights.length > 0 ? dreamResult.insights.slice(0, 3).join(', ') : 'None'}`,
      `🧠 Memories consolidated: ${dreamResult.memoriesConsolidated}`,
    ];

    return this.formatMessage('dream', lines.join('\n'));
  }

  /**
   * 格式化消息
   */
  formatMessage(
    type: MessageType,
    content: string,
    channel?: SensoryChannel,
  ): ChannelMessage {
    const targetChannel = channel ?? this.getDefaultChannel();

    return {
      id: this.generateId('msg'),
      timestamp: Date.now(),
      channel: targetChannel,
      type,
      content,
    };
  }

  /**
   * 格式化行动结果
   */
  private formatActionResult(action: ActionResult, result: unknown): string {
    const resultStr =
      typeof result === 'string'
        ? result
        : JSON.stringify(result, null, 2);

    return `[${action.type}:${action.status}] ${resultStr}`;
  }

  /**
   * 根据状态获取消息类型
   */
  private getStatusMessageType(status: string): MessageType {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'success':
        return 'result';
      case 'failed':
      case 'error':
        return 'error';
      case 'executing':
      case 'pending':
        return 'action';
      default:
        return 'text';
    }
  }

  /**
   * 获取默认渠道
   */
  private getDefaultChannel(): SensoryChannel {
    return SensoryChannelEnum.CLI;
  }

  /**
   * 生成唯一 ID
   */
  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
