/**
 * HTTP API Server
 *
 * 轻量级 HTTP + WebSocket 服务器
 * 使用 Node.js 原生 http 模块 — 零外部依赖
 */

import * as http from 'node:http';
import * as crypto from 'node:crypto';

/**
 * API 请求
 */
export interface APIRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}

/**
 * API 响应
 */
export interface APIResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

/**
 * 路由处理器
 */
export type RouteHandler = (req: APIRequest) => Promise<APIResponse> | APIResponse;

/**
 * WebSocket 连接
 */
export interface WSConnection {
  id: string;
  send(data: string): void;
  close(): void;
  readonly isAlive: boolean;
}

/**
 * WebSocket 消息处理器
 */
export type WSMessageHandler = (conn: WSConnection, message: string) => void;

/**
 * 路由条目
 */
interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

/**
 * 流式路由条目
 */
interface StreamRoute {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: (req: http.IncomingMessage, res: http.ServerResponse, params: Record<string, string>) => Promise<void>;
}

/**
 * 轻量级 HTTP 服务器
 */
export class APIServer {
  private routes: Route[] = [];
  private streamRoutes: StreamRoute[] = [];
  private wsConnections: Map<string, WSConnectionImpl> = new Map();
  private wsHandlers: WSMessageHandler[] = [];
  private sseClients: Set<http.ServerResponse> = new Set();
  private server: http.Server | null = null;
  private readonly port: number;
  private readonly host: string;
  private readonly authToken: string | null;

  // Rate limiting
  private readonly rateLimitWindow = 60_000; // 1 minute window
  private readonly rateLimitMax = 100; // max requests per window
  private requestTimestamps: Map<string, number[]> = new Map();

  // WebSocket rate limiting
  private readonly wsRateLimitMax = 60; // max messages per minute per connection
  private wsMessageTimestamps: Map<string, number[]> = new Map();

  // WebSocket heartbeat
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private readonly corsOrigin: string;
  private readonly requestTimeout = 30_000; // 30s default request timeout

  constructor(port: number = 3000, host: string = 'localhost', authToken?: string, corsOrigin?: string) {
    this.port = port;
    this.host = host;
    this.authToken = authToken ?? null;
    this.corsOrigin = corsOrigin ?? '*';
  }

  /**
   * 注册流式路由（需要直接访问 raw response）
   *
   * handler 接收原始 req/res，自行处理响应格式。
   */
  streamRoute(method: string, path: string, handler: (req: http.IncomingMessage, res: http.ServerResponse, params: Record<string, string>) => Promise<void>): void {
    const { pattern, paramNames } = this.pathToRegex(path);
    this.streamRoutes.push({ method: method.toUpperCase(), pattern, paramNames, handler });
  }

  /**
   * 注册路由
   */
  route(method: string, path: string, handler: RouteHandler): void {
    const { pattern, paramNames } = this.pathToRegex(path);
    this.routes.push({ method: method.toUpperCase(), pattern, paramNames, handler });
  }

  /**
   * 注册 WebSocket 消息处理器
   */
  onWSMessage(handler: WSMessageHandler): void {
    this.wsHandlers.push(handler);
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.timeout = this.requestTimeout;
      this.server.requestTimeout = this.requestTimeout;

      this.server.on('upgrade', (req, socket, head) => {
        this.handleUpgrade(req, socket, head);
      });

      this.server.on('error', reject);

      this.server.listen(this.port, this.host, () => {
        // Start WebSocket heartbeat — ping every 30s, kill unresponsive connections
        this.heartbeatInterval = setInterval(() => this.pingWsConnections(), 30_000);
        resolve();
      });
    });
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // 关闭所有 SSE 连接
    for (const res of this.sseClients) {
      try { res.end(); } catch { /* already closed */ }
    }
    this.sseClients.clear();

    // 关闭所有 WebSocket 连接
    for (const conn of this.wsConnections.values()) {
      conn.close();
    }
    this.wsConnections.clear();

    if (this.server) {
      return new Promise((resolve, reject) => {
        this.server!.close((err) => {
          this.server = null;
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  /**
   * 获取连接数（WebSocket + SSE）
   */
  get connectionCount(): number {
    return this.wsConnections.size + this.sseClients.size;
  }

  /**
   * 广播消息到所有 WebSocket 连接
   */
  broadcast(data: string): void {
    for (const conn of this.wsConnections.values()) {
      if (conn.isAlive) {
        conn.send(data);
      }
    }
  }

  /**
   * 注册 SSE 端点（GET /events）
   *
   * 客户端连接后持续推送 agent 事件。
   * 消息格式：`data: {"type":"...","payload":{...}}\n\n`
   */
  registerSSEEndpoint(path: string = '/events'): void {
    this.route('GET', path, () => {
      // SSE 端点不走普通 JSON 响应 — 由 handleSSERequest 单独处理
      // 但 route() 不支持 raw res 访问，所以我们用另一种方式：
      // 在 handleRequest 中拦截 SSE 请求
      return { status: 200, body: { sse: true } };
    });
  }

  /**
   * 向所有 SSE 客户端推送事件
   */
  pushSSE(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.sseClients) {
      try {
        res.write(payload);
      } catch {
        this.sseClients.delete(res);
      }
    }
  }

  /**
   * 获取 SSE 客户端数
   */
  get sseClientCount(): number {
    return this.sseClients.size;
  }

  /**
   * 处理 HTTP 请求
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Request ID for tracing
    const requestId = crypto.randomUUID();

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', this.corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('X-Request-Id', requestId);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${this.host}:${this.port}`);
    const path = url.pathname;

    // 认证检查（/health 除外）
    if (this.authToken && path !== '/health' && !this.isAuthenticated(req)) {
      this.sendResponse(res, { status: 401, body: { error: 'Unauthorized', message: 'Missing or invalid Bearer token' } });
      return;
    }

    // Rate limiting（/health 除外）
    if (path !== '/health' && this.isRateLimited(req)) {
      this.sendResponse(res, { status: 429, body: { error: 'Rate limit exceeded', retryAfter: 60 } });
      return;
    }

    // SSE 端点检测
    if (path === '/events' && req.method === 'GET' && this.acceptsSSE(req)) {
      this.handleSSERequest(req, res);
      return;
    }

    // 匹配流式路由
    for (const route of this.streamRoutes) {
      if (route.method !== req.method) continue;
      const match = path.match(route.pattern);
      if (!match) continue;

      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => { params[name] = match[i + 1]; });

      try {
        await route.handler(req, res, params);
      } catch (error) {
        if (!res.headersSent) {
          this.sendResponse(res, { status: 500, body: { error: String(error) } });
        }
      }
      return;
    }

    // 匹配路由
    for (const route of this.routes) {
      if (route.method !== req.method) continue;

      const match = path.match(route.pattern);
      if (!match) continue;

      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });

      // 读取请求体
      const body = await this.readBody(req);

      const apiReq: APIRequest = {
        method: req.method ?? 'GET',
        path,
        params,
        body,
        headers: this.extractHeaders(req),
      };

      try {
        const apiRes = await route.handler(apiReq);
        this.sendResponse(res, apiRes);
      } catch (error) {
        this.sendResponse(res, {
          status: 500,
          body: { error: 'Internal server error', message: String(error) },
        });
      }
      return;
    }

    // 404
    this.sendResponse(res, {
      status: 404,
      body: { error: 'Not found', path },
    });
  }

  /**
   * 处理 WebSocket 升级
   */
  private handleUpgrade(req: http.IncomingMessage, socket: import('stream').Duplex, head: Buffer): void {
    // Auth check for WebSocket connections
    if (this.authToken && !this.isAuthenticated(req)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const id = crypto.randomUUID();
    const conn = new WSConnectionImpl(id, socket);

    this.wsConnections.set(id, conn);

    socket.on('data', (data: Buffer) => {
      // Handle ping/pong at frame level before parsing
      if (data.length >= 1) {
        const opcode = data[0] & 0x0f;
        if (opcode === 0x9) {
          // Ping → auto-reply pong
          const payload = data.slice(2, 2 + (data[1] & 0x7f));
          socket.write(Buffer.from([0x8a, payload.length, ...payload]));
          return;
        }
        if (opcode === 0xa) {
          // Pong received — mark alive
          return;
        }
      }

      const message = this.parseWSFrame(data);
      if (message) {
        // Per-connection WS rate limiting
        if (this.isWSRateLimited(id)) {
          conn.send(JSON.stringify({ type: 'error', error: 'Rate limit exceeded. Slow down.' }));
          return;
        }

        for (const handler of this.wsHandlers) {
          try {
            handler(conn, message);
          } catch {
            // Handler error, ignore
          }
        }
      }
    });

    socket.on('close', () => {
      this.wsConnections.delete(id);
      this.wsMessageTimestamps.delete(id);
    });

    socket.on('error', () => {
      this.wsConnections.delete(id);
    });

    // 发送 WebSocket 接受握手
    const key = req.headers['sec-websocket-key'];
    if (key) {
      const acceptKey = crypto
        .createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`
      );
    }
  }

  /**
   * 简单的 WebSocket 帧解析
   */
  private parseWSFrame(data: Buffer): string | null {
    try {
      if (data.length < 2) return null;

      const opcode = data[0] & 0x0f;
      // 0x8 = close, 0x9 = ping, 0xa = pong
      if (opcode === 0x8) return null;

      const masked = (data[1] & 0x80) !== 0;
      let payloadLength = data[1] & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        payloadLength = data.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLength === 127) {
        payloadLength = Number(data.readBigUInt64BE(offset));
        offset += 8;
      }

      if (masked) {
        const maskKey = data.slice(offset, offset + 4);
        offset += 4;
        const payload = data.slice(offset, offset + payloadLength);
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i % 4];
        }
        return payload.toString('utf-8');
      }

      return data.slice(offset, offset + payloadLength).toString('utf-8');
    } catch {
      return null;
    }
  }

  /**
   * 读取请求体（带大小限制）
   */
  private static readonly MAX_BODY_SIZE = 1024 * 1024; // 1MB

  private readBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;

      req.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > APIServer.MAX_BODY_SIZE) {
          req.destroy();
          resolve(null);
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        if (totalSize > APIServer.MAX_BODY_SIZE) {
          resolve(null);
          return;
        }
        const body = Buffer.concat(chunks).toString('utf-8');
        if (!body) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(body);
        }
      });
    });
  }

  /**
   * 发送响应（含安全头）
   */
  private sendResponse(res: http.ServerResponse, apiRes: APIResponse): void {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Cache-Control': 'no-store',
      ...apiRes.headers,
    };
    res.writeHead(apiRes.status, headers);
    res.end(JSON.stringify(apiRes.body));
  }

  /**
   * 检测 SSE 请求
   */
  private acceptsSSE(req: http.IncomingMessage): boolean {
    const accept = req.headers.accept ?? '';
    return accept.includes('text/event-stream');
  }

  /**
   * 验证 Bearer token（timing-safe comparison）
   */
  private isAuthenticated(req: http.IncomingMessage): boolean {
    const auth = req.headers.authorization ?? '';
    if (!auth.startsWith('Bearer ')) return false;
    const token = auth.slice(7).trim();
    // Timing-safe comparison to prevent timing attacks
    try {
      const tokenBuf = Buffer.from(token, 'utf-8');
      const expectedBuf = Buffer.from(this.authToken!, 'utf-8');
      if (tokenBuf.length !== expectedBuf.length) return false;
      return crypto.timingSafeEqual(tokenBuf, expectedBuf);
    } catch {
      return false;
    }
  }

  /**
   * Rate limit check — per-IP sliding window
   */
  private isRateLimited(req: http.IncomingMessage): boolean {
    const ip = req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const timestamps = this.requestTimestamps.get(ip) ?? [];

    // Prune old entries
    const recent = timestamps.filter(t => now - t < this.rateLimitWindow);

    if (recent.length >= this.rateLimitMax) {
      return true;
    }

    recent.push(now);
    this.requestTimestamps.set(ip, recent);
    return false;
  }

  /**
   * WebSocket per-connection rate limit check
   */
  private isWSRateLimited(connId: string): boolean {
    const now = Date.now();
    const timestamps = this.wsMessageTimestamps.get(connId) ?? [];
    const recent = timestamps.filter(t => now - t < this.rateLimitWindow);
    if (recent.length >= this.wsRateLimitMax) {
      return true;
    }
    recent.push(now);
    this.wsMessageTimestamps.set(connId, recent);
    return false;
  }

  /**
   * Ping all WebSocket connections, close unresponsive ones
   */
  private pingWsConnections(): void {
    for (const [id, conn] of this.wsConnections) {
      if (!conn.isAlive) {
        conn.close();
        this.wsConnections.delete(id);
        continue;
      }
      // Mark as expecting pong — will be reset by pong handler
      (conn as WSConnectionImpl).markPendingPong();
      // Send empty text as heartbeat (WSConnectionImpl.send handles framing)
      try {
        conn.send('\x89\x00'); // triggers a ping via the text path
      } catch {
        conn.close();
        this.wsConnections.delete(id);
      }
    }

    // Prune stale rate limit entries
    const now = Date.now();
    for (const [ip, timestamps] of this.requestTimestamps) {
      if (timestamps.length === 0 || now - timestamps[timestamps.length - 1]! > this.rateLimitWindow) {
        this.requestTimestamps.delete(ip);
      }
    }
    // Prune stale WS rate limit entries (connections already cleaned up, but just in case)
    for (const [connId, timestamps] of this.wsMessageTimestamps) {
      if (!this.wsConnections.has(connId) || timestamps.length === 0 || now - timestamps[timestamps.length - 1]! > this.rateLimitWindow) {
        this.wsMessageTimestamps.delete(connId);
      }
    }
  }

  /**
   * 处理 SSE 连接
   */
  private handleSSERequest(_req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': this.corsOrigin,
    });

    // 发送初始连接事件
    res.write(`event: connected\ndata: {"timestamp":${Date.now()}}\n\n`);

    // 注册客户端
    this.sseClients.add(res);

    // 心跳（每 30s）
    const heartbeat = setInterval(() => {
      try {
        res.write(`:heartbeat\n\n`);
      } catch {
        clearInterval(heartbeat);
        this.sseClients.delete(res);
      }
    }, 30000);

    res.on('close', () => {
      clearInterval(heartbeat);
      this.sseClients.delete(res);
    });
  }

  /**
   * 提取请求头
   */
  private extractHeaders(req: http.IncomingMessage): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers[key] = value;
      }
    }
    return headers;
  }

  /**
   * 路径模式转正则
   */
  private pathToRegex(path: string): { pattern: RegExp; paramNames: string[] } {
    const paramNames: string[] = [];
    const patternStr = path.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    return {
      pattern: new RegExp(`^${patternStr}$`),
      paramNames,
    };
  }
}

/**
 * WebSocket 连接实现
 */
class WSConnectionImpl implements WSConnection {
  readonly id: string;
  private socket: import('stream').Duplex;
  private _isAlive = true;

  constructor(id: string, socket: import('stream').Duplex) {
    this.id = id;
    this.socket = socket;
  }

  get isAlive(): boolean {
    return this._isAlive;
  }

  /**
   * Mark as expecting a pong response — will be set back to true by pong handler
   */
  markPendingPong(): void {
    this._isAlive = false;
  }

  send(data: string): void {
    if (!this._isAlive) return;

    try {
      // 简单的 WebSocket 帧封装（文本帧，不掩码）
      const payload = Buffer.from(data, 'utf-8');
      const frame: number[] = [0x81]; // FIN + text opcode

      if (payload.length < 126) {
        frame.push(payload.length);
      } else if (payload.length < 65536) {
        frame.push(126);
        frame.push((payload.length >> 8) & 0xff);
        frame.push(payload.length & 0xff);
      } else {
        frame.push(127);
        for (let i = 7; i >= 0; i--) {
          frame.push((payload.length >> (i * 8)) & 0xff);
        }
      }

      this.socket.write(Buffer.from([...frame, ...payload]));
    } catch {
      this._isAlive = false;
    }
  }

  close(): void {
    this._isAlive = false;
    try {
      this.socket.end();
    } catch {
      // Already closed
    }
  }
}
