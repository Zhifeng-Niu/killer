/**
 * Discord Channel - Discord Bot 感官渠道
 *
 * Stub implementation. Requires `discord.js` dependency to activate.
 * Install: pnpm add discord.js
 *
 * 配置 DiscordChannelConfig 后传入 botToken 即可启用。
 * 当前为 placeholder，完整实现需要 discord.js 库支持。
 */

import { BaseSensoryChannel } from '../channel.js';
import type { ChannelMessage } from '../types.js';
import { SensoryChannel } from '../types.js';

/**
 * Discord 渠道配置
 */
export interface DiscordChannelConfig {
  /** Discord Bot Token */
  botToken: string;
  /** 允许的 Guild/Server IDs（空 = 所有） */
  allowedGuildIds?: string[];
  /** 监视的频道 IDs（空 = 所有文字频道） */
  watchedChannelIds?: string[];
}

/**
 * Discord Bot 渠道（Stub）
 *
 * 占位实现。完整功能需要 discord.js 依赖。
 * 启动时会抛出错误提示安装 discord.js。
 */
export class DiscordChannel extends BaseSensoryChannel {
  private readonly config: DiscordChannelConfig;

  constructor(config: DiscordChannelConfig) {
    super(SensoryChannel.Discord);
    this.config = config;
  }

  async start(): Promise<void> {
    throw new Error(
      'Discord channel requires the "discord.js" package.\n' +
      'Install it with: pnpm add discord.js\n' +
      'Then implement DiscordChannel.start() with Client and GatewayIntentBits.'
    );
  }

  async stop(): Promise<void> {
    this.updateStatus({ connected: false });
  }

  async send(message: ChannelMessage): Promise<void> {
    // No-op: Discord not connected
  }
}
