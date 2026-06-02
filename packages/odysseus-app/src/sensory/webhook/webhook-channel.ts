/**
 * Webhook Channel - HTTP Webhook 感官渠道
 *
 * 接收外部 HTTP POST 请求作为 agent 的感官输入，
 * 使外部系统能向 agent 注入事件、数据、通知。
 */

import * as http from 'http';
import { BaseSensoryChannel } from '../channel.js';
import type { ChannelMessage, SensoryPriority } from '../types.js';
import { SensoryChannel } from '../types.js';

/**
 * Webhook 渠道配置
 */
export interface WebhookChannelConfig {
  /** 监听端口 */
  port: number;
  /** 监听主机 */
  host?: string;
  /** 路径前缀（默认 /webhook） */
  path?: string;
  /** 可选的 bearer token 验证 */
  authToken?: string;
}

/**
 * Webhook 请求体
 */
export interface WebhookPayload {
  /** 消息内容 */
  content: string;
  /** 来源标识 */
  source?: string;
  /** 优先级 */
  priority?: SensoryPriority;
  /** 附加元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * Webhook 渠道
 *
 * 启动一个轻量 HTTP 服务器，接收 POST 请求并转换为 SensoryInput。
 * 外部系统可以通过 HTTP POST 向 agent 发送事件。
 */
export class WebhookChannel extends BaseSensoryChannel {
  private server: http.Server | null = null;
  private readonly config: Required<Pick<WebhookChannelConfig, 'port' | 'host' | 'path'>> &
    Pick<WebhookChannelConfig, 'authToken'>;

  constructor(config: WebhookChannelConfig) {
    super(SensoryChannel.Web);
    this.config = {
      port: config.port,
      host: config.host ?? 'localhost',
      path: config.path ?? '/webhook',
      authToken: config.authToken,
    };
  }

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.server!.on('error', reject);
      this.server!.listen(this.config.port, this.config.host, () => {
        this.server!.removeListener('error', reject);
        this.updateStatus({ connected: true, lastActivity: Date.now() });
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.server = null;
        this.updateStatus({ connected: false });
        resolve();
      });
    });
  }

  async send(message: ChannelMessage): Promise<void> {
    // Webhook 渠道是只读的（接收外部输入），不发送消息到外部
    this.recordActivity();
  }

  /**
   * 获取 Webhook URL
   */
  getWebhookUrl(): string {
    return `http://${this.config.host}:${this.config.port}${this.config.path}`;
  }

  /**
   * 处理 HTTP 请求
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // 只接受 POST 请求
    if (req.method !== 'POST') {
      this.sendJsonResponse(res, 405, { error: 'Method not allowed. Use POST.' });
      return;
    }

    // 路径检查
    if (!req.url?.startsWith(this.config.path)) {
      this.sendJsonResponse(res, 404, { error: 'Not found.' });
      return;
    }

    // Token 验证
    if (this.config.authToken) {
      const auth = req.headers['authorization'];
      if (auth !== `Bearer ${this.config.authToken}`) {
        this.sendJsonResponse(res, 401, { error: 'Unauthorized.' });
        this.recordError();
        return;
      }
    }

    // 读取请求体
    this.readBody(req)
      .then((body) => {
        try {
          const payload = JSON.parse(body) as WebhookPayload;

          if (!payload.content) {
            this.sendJsonResponse(res, 400, { error: 'Missing "content" field.' });
            return;
          }

          // 转换为 SensoryInput
          const input = this.createInput(
            payload.source ?? `webhook:${req.socket.remoteAddress ?? 'unknown'}`,
            payload.content,
            payload.priority ?? 'normal',
            payload.metadata ?? {},
          );

          this.notifyInput(input);
          this.recordActivity();

          this.sendJsonResponse(res, 200, {
            received: true,
            inputId: input.id,
            timestamp: input.timestamp,
          });
        } catch {
          this.sendJsonResponse(res, 400, { error: 'Invalid JSON body.' });
          this.recordError();
        }
      })
      .catch(() => {
        this.sendJsonResponse(res, 400, { error: 'Failed to read request body.' });
        this.recordError();
      });
  }

  /**
   * 读取请求体
   */
  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      const maxSize = 1024 * 1024; // 1MB 限制

      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxSize) {
          req.destroy();
          reject(new Error('Body too large'));
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });

      req.on('error', reject);
    });
  }

  /**
   * 发送 JSON 响应
   */
  private sendJsonResponse(
    res: http.ServerResponse,
    statusCode: number,
    body: Record<string, unknown>,
  ): void {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'X-Powered-By': 'Killer-Agent',
    });
    res.end(JSON.stringify(body));
  }
}
