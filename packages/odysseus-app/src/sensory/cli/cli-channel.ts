/**
 * CLI Channel - 命令行输出渠道
 *
 * 负责 CLI 渠道的消息格式化和输出路由。
 * 注意：不创建自己的 readline 实例 — 主 CLI 交互由 readline-loop.ts 处理。
 * 本渠道仅作为 SensoryRouter 的输出端点，不监听 stdin。
 */

import type { Writable } from 'node:stream';
import { BaseSensoryChannel } from '../channel.js';
import type { ChannelMessage } from '../types.js';
import { SensoryChannel } from '../types.js';

/**
 * ANSI 颜色代码
 */
const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  gray: '\x1b[37m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  yellow: '\x1b[33m',
} as const;

/**
 * 消息图标
 */
const ICONS = {
  text: '',
  thinking: '💭',
  action: '⚡',
  result: '✓',
  error: '✗',
  dream: '🌙',
  evolution: '🧬',
} as const;

/**
 * CLI 渠道配置
 */
export interface CLIChannelConfig {
  output?: Writable;
}

/**
 * CLI 渠道
 *
 * 作为 SensoryRouter 的 CLI 输出端点。
 * 主 CLI 交互（readline、命令处理）由 cli/readline-loop.ts 负责。
 */
export class CLIChannel extends BaseSensoryChannel {
  private readonly output: Writable;
  private _muted = false;

  constructor(config: CLIChannelConfig = {}) {
    super(SensoryChannel.CLI);

    this.output = config.output ?? process.stdout;
  }

  /** TUI 模式下静音 — ink 接管 stdout，直接写会打乱渲染 */
  mute(): void { this._muted = true; }
  unmute(): void { this._muted = false; }
  get muted(): boolean { return this._muted; }

  /**
   * 启动 CLI 渠道
   *
   * 不创建 readline 实例 — 主 CLI 交互由 readline-loop.ts 处理。
   * 仅标记为已连接，作为 SensoryRouter 的输出端点。
   */
  async start(): Promise<void> {
    this.updateStatus({ connected: true, lastActivity: Date.now() });
  }

  /**
   * 停止 CLI 渠道
   */
  async stop(): Promise<void> {
    this.updateStatus({ connected: false });
  }

  /**
   * 发送消息到 CLI
   */
  async send(message: ChannelMessage): Promise<void> {
    if (this._muted) return;
    const formatted = this.formatMessage(message);
    this.output.write(formatted + '\n');
    this.recordActivity();
  }

  /**
   * 格式化消息输出
   */
  private formatMessage(message: ChannelMessage): string {
    const { type, content } = message;

    switch (type) {
      case 'text':
        return content;
      case 'thinking':
        return `${ANSI.dim}${ANSI.gray}${ICONS.thinking} ${content}${ANSI.reset}`;
      case 'action':
        return `${ANSI.cyan}${ICONS.action} ${content}${ANSI.reset}`;
      case 'result':
        return `${ANSI.green}${ICONS.result} ${content}${ANSI.reset}`;
      case 'error':
        return `${ANSI.red}${ICONS.error} ${content}${ANSI.reset}`;
      case 'dream':
        return `${ANSI.magenta}${ICONS.dream} ${content}${ANSI.reset}`;
      case 'evolution':
        return `${ANSI.yellow}${ICONS.evolution} ${content}${ANSI.reset}`;
      default:
        return content;
    }
  }
}
