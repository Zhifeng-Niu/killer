/**
 * Middleware Pipeline
 *
 * 洋葱模型中间件系统 — 包装 processInput 处理流程。
 * 每个中间件可以在请求前后执行逻辑（日志、限流、指标、输入净化等）。
 */

import { Logger } from '../log/index.js';

/**
 * 中间件上下文 — 请求处理过程中的共享状态
 */
export interface MiddlewareContext {
  /** 原始用户输入 */
  input: string;
  /** 输入渠道 */
  channel: string;
  /** 中间件可设置的元数据 */
  metadata: Record<string, unknown>;
  /** 最终响应（由核心处理或中间件设置） */
  response?: string;
  /** 是否跳过核心处理 */
  skipped?: boolean;
  /** 错误（如果发生） */
  error?: Error;
  /** 开始时间戳 */
  startedAt: number;
}

/**
 * 中间件函数
 *
 * @param ctx - 共享上下文
 * @param next - 调用下一个中间件（或核心处理逻辑）
 */
export type Middleware = (ctx: MiddlewareContext, next: () => Promise<void>) => Promise<void>;

/**
 * 中间件管道
 *
 * 将多个中间件组合成一个处理函数。
 */
export class MiddlewarePipeline {
  private readonly middlewares: Middleware[] = [];

  /**
   * 添加中间件（按添加顺序执行）
   */
  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * 执行管道
   *
   * @param ctx - 初始上下文
   * @param coreHandler - 核心处理函数（最后一个 "next"）
   */
  async execute(ctx: MiddlewareContext, coreHandler: (ctx: MiddlewareContext) => Promise<void>): Promise<void> {
    // 从最后一个中间件开始构建调用链
    let index = this.middlewares.length;

    const dispatch = async (i: number): Promise<void> => {
      if (i < index) {
        const middleware = this.middlewares[i]!;
        await middleware(ctx, () => dispatch(i + 1));
      } else {
        // 所有中间件执行完毕，调用核心处理
        await coreHandler(ctx);
      }
    };

    await dispatch(0);
  }

  /**
   * 获取已注册的中间件数量
   */
  get size(): number {
    return this.middlewares.length;
  }

  /**
   * 移除所有中间件
   */
  clear(): void {
    this.middlewares.length = 0;
  }
}

// ─── 内置中间件 ────────────────────────────────────

/**
 * 结构化日志中间件 — 使用 Logger 模块记录请求和响应
 */
export function structuredLoggingMiddleware(): Middleware {
  const logger = Logger.getInstance().child('middleware');
  return async (ctx, next) => {
    const start = Date.now();
    logger.info(`→ [${ctx.channel}] ${ctx.input.slice(0, 80)}${ctx.input.length > 80 ? '...' : ''}`);
    await next();
    const duration = Date.now() - start;
    const responsePreview = (ctx.response ?? '').slice(0, 80);
    logger.info(`← [${duration}ms] ${responsePreview}${responsePreview.length >= 80 ? '...' : ''}`);
  };
}

/**
 * 简单日志中间件 — 使用回调函数（向后兼容）
 */
export function loggingMiddleware(onLog: (msg: string) => void): Middleware {
  return async (ctx, next) => {
    const start = Date.now();
    onLog(`→ [${ctx.channel}] ${ctx.input.slice(0, 80)}${ctx.input.length > 80 ? '...' : ''}`);
    await next();
    const duration = Date.now() - start;
    onLog(`← [${duration}ms] ${(ctx.response ?? '').slice(0, 80)}`);
  };
}

/**
 * 指标收集中间件 — 记录处理时间和响应长度
 */
export function metricsMiddleware(): Middleware {
  return async (ctx, next) => {
    const start = performance.now();
    await next();
    const duration = performance.now() - start;
    ctx.metadata.metricsDuration = duration;
    ctx.metadata.metricsResponseLength = (ctx.response ?? '').length;
  };
}

/**
 * 输入净化中间件 — 去除危险字符和空白
 */
export function sanitizeMiddleware(): Middleware {
  return async (ctx, next) => {
    // 去除首尾空白和控制字符
    ctx.input = ctx.input
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .trim();

    // 限制输入长度
    const MAX_INPUT_LENGTH = 10000;
    if (ctx.input.length > MAX_INPUT_LENGTH) {
      ctx.input = ctx.input.slice(0, MAX_INPUT_LENGTH);
      ctx.metadata.truncated = true;
    }

    await next();
  };
}

/**
 * 速率限制中间件
 */
export function rateLimitMiddleware(options: {
  maxRequests: number;
  windowMs: number;
  onLimited?: (ctx: MiddlewareContext) => void;
}): Middleware {
  const timestamps: number[] = [];

  return async (ctx, next) => {
    const now = Date.now();
    const windowStart = now - options.windowMs;

    // 清理过期记录
    while (timestamps.length > 0 && timestamps[0]! < windowStart) {
      timestamps.shift();
    }

    if (timestamps.length >= options.maxRequests) {
      ctx.skipped = true;
      ctx.response = 'Rate limit exceeded. Please wait a moment.';
      ctx.metadata.rateLimited = true;
      options.onLimited?.(ctx);
      return;
    }

    timestamps.push(now);
    await next();
  };
}

/**
 * API 认证中间件 — 验证 Bearer token
 *
 * 用于 API server 的请求认证。如果配置了 token，
 * 则要求请求头中包含正确的 Authorization: Bearer <token>。
 * CLI 渠道跳过认证。
 */
export function authMiddleware(apiToken: string): Middleware {
  const logger = Logger.getInstance().child('auth');
  return async (ctx, next) => {
    // CLI 渠道不需要认证
    if (ctx.channel === 'cli') {
      await next();
      return;
    }

    // 未配置 token 则跳过
    if (!apiToken) {
      await next();
      return;
    }

    const provided = ctx.metadata.authToken as string | undefined;
    if (!provided || provided !== apiToken) {
      ctx.skipped = true;
      ctx.response = 'Unauthorized: Invalid or missing API token';
      ctx.metadata.authFailed = true;
      logger.warn(`Auth failed for channel=${ctx.channel}`);
      return;
    }

    ctx.metadata.authenticated = true;
    await next();
  };
}

/**
 * 敏感数据过滤中间件 — 遮盖响应中的 PII 模式
 *
 * 在核心处理完成后对响应文本进行脱敏处理。
 * 匹配 API key、信用卡号、邮箱、SSN 等模式并替换为占位符。
 */
export function sensitiveDataFilterMiddleware(): Middleware {
  // 常见敏感数据模式
  const patterns: Array<{ regex: RegExp; replacement: string }> = [
    // API Keys (常见格式)
    { regex: /\b(sk|pk|api[_-]?key)[_-][\w-]{20,}\b/gi, replacement: '[REDACTED_API_KEY]' },
    // AWS Access Keys
    { regex: /\bAKIA[0-9A-Z]{16}\b/g, replacement: '[REDACTED_AWS_KEY]' },
    // AWS Secret Keys
    { regex: /\b[A-Za-z0-9/+=]{40}\b/g, replacement: '[REDACTED_SECRET]' },
    // 长数字序列（可能是信用卡）
    { regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, replacement: '[REDACTED_CARD]' },
    // SSN 模式
    { regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED_SSN]' },
    // Private key markers
    { regex: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA )?PRIVATE KEY-----/g, replacement: '[REDACTED_PRIVATE_KEY]' },
  ];

  return async (ctx, next) => {
    await next();

    if (ctx.response && typeof ctx.response === 'string') {
      let filtered = ctx.response;
      for (const { regex, replacement } of patterns) {
        filtered = filtered.replace(regex, replacement);
      }
      if (filtered !== ctx.response) {
        ctx.metadata.filteredPII = true;
        ctx.response = filtered;
      }
    }
  };
}
