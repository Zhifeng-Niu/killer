/**
 * Telegram Channel - Telegram Bot 感官渠道
 *
 * 通过 Telegram Bot API 接收消息作为 agent 的感官输入。
 * 支持 getUpdates 轮询模式（无需公网服务器）。
 */

import { BaseSensoryChannel } from '../channel.js';
import type { ChannelMessage, SensoryPriority } from '../types.js';
import { SensoryChannel } from '../types.js';

/**
 * Telegram 渠道配置
 */
export interface TelegramChannelConfig {
  /** Bot API token (from @BotFather) */
  botToken: string;
  /** 轮询间隔（毫秒，默认 3000） */
  pollInterval?: number;
  /** 允许的聊天 ID（空数组 = 允许所有） */
  allowedChatIds?: number[];
}

/**
 * Telegram Update
 */
interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: { id: number; username?: string; first_name?: string };
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

/**
 * Telegram Bot 渠道
 *
 * 使用 getUpdates 长轮询接收用户消息并转换为 SensoryInput。
 */
export class TelegramChannel extends BaseSensoryChannel {
  private readonly config: Required<Pick<TelegramChannelConfig, 'botToken' | 'pollInterval'>> &
    Pick<TelegramChannelConfig, 'allowedChatIds'>;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private lastUpdateId = 0;
  private readonly apiUrl: string;

  constructor(config: TelegramChannelConfig) {
    super(SensoryChannel.Telegram);
    this.config = {
      botToken: config.botToken,
      pollInterval: config.pollInterval ?? 3000,
      allowedChatIds: config.allowedChatIds,
    };
    this.apiUrl = `https://api.telegram.org/bot${this.config.botToken}`;
  }

  async start(): Promise<void> {
    if (this.pollingTimer) return;

    // Verify bot token
    const me = await this.apiRequest<{ username: string }>('getMe');
    if (!me.ok) {
      throw new Error(`Telegram bot initialization failed: ${me.description ?? 'Invalid token'}`);
    }

    this.updateStatus({ connected: true, lastActivity: Date.now() });

    // Start polling
    this.pollingTimer = setInterval(() => this.poll(), this.config.pollInterval);
  }

  async stop(): Promise<void> {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.updateStatus({ connected: false });
  }

  async send(message: ChannelMessage): Promise<void> {
    // Telegram channel doesn't auto-send; use sendToChat for explicit sends
    this.recordActivity();
  }

  /**
   * Send a text message to a Telegram chat
   */
  async sendToChat(chatId: number, text: string): Promise<boolean> {
    const result = await this.apiRequest<unknown>('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    });
    return result.ok;
  }

  private async poll(): Promise<void> {
    try {
      const response = await this.apiRequest<TelegramUpdate[]>('getUpdates', {
        offset: this.lastUpdateId + 1,
        timeout: 1,
        allowed_updates: ['message'],
      });

      if (!response.ok || !response.result) return;

      for (const update of response.result) {
        this.lastUpdateId = update.update_id;
        if (update.message?.text) {
          this.handleMessage(update.message);
        }
      }
    } catch {
      this.recordError();
    }
  }

  private handleMessage(msg: TelegramMessage): void {
    // Filter by allowed chats
    if (this.config.allowedChatIds?.length &&
        !this.config.allowedChatIds.includes(msg.chat.id)) {
      return;
    }

    const username = msg.from?.username ?? msg.from?.first_name ?? 'unknown';
    const input = this.createInput(
      `telegram:${msg.chat.id}:${username}`,
      msg.text!,
      'normal' as SensoryPriority,
      {
        chatId: msg.chat.id,
        userId: msg.from?.id,
        username,
        messageId: msg.message_id,
      },
    );

    this.notifyInput(input);
    this.recordActivity();
  }

  private async apiRequest<T>(method: string, body?: Record<string, unknown>): Promise<TelegramApiResponse<T>> {
    const url = `${this.apiUrl}/${method}`;
    const options: RequestInit = body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {};

    try {
      const res = await fetch(url, options);
      return (await res.json()) as TelegramApiResponse<T>;
    } catch (error) {
      return { ok: false, description: error instanceof Error ? error.message : String(error) };
    }
  }
}
