/**
 * Middleware Pipeline Tests
 */

import { describe, it, expect, vi } from 'vitest';
import {
  MiddlewarePipeline,
  loggingMiddleware,
  sanitizeMiddleware,
  rateLimitMiddleware,
  structuredLoggingMiddleware,
  metricsMiddleware,
  authMiddleware,
  sensitiveDataFilterMiddleware,
  type MiddlewareContext,
} from '../orchestrator/middleware.js';

describe('MiddlewarePipeline', () => {
  it('should execute middleware in order', async () => {
    const pipeline = new MiddlewarePipeline();
    const order: number[] = [];

    pipeline.use(async (_ctx, next) => { order.push(1); await next(); order.push(4); });
    pipeline.use(async (_ctx, next) => { order.push(2); await next(); order.push(3); });

    const ctx: MiddlewareContext = { input: 'test', channel: 'cli', metadata: {}, startedAt: Date.now() };
    await pipeline.execute(ctx, async () => { order.push(5); });

    // 洋葱模型：1 → 2 → 5 → 3 → 4
    expect(order).toEqual([1, 2, 5, 3, 4]);
  });

  it('should call core handler last', async () => {
    const pipeline = new MiddlewarePipeline();
    let coreCalled = false;

    const ctx: MiddlewareContext = { input: 'hello', channel: 'cli', metadata: {}, startedAt: Date.now() };
    await pipeline.execute(ctx, async (c) => {
      coreCalled = true;
      c.response = 'world';
    });

    expect(coreCalled).toBe(true);
    expect(ctx.response).toBe('world');
  });

  it('should support short-circuiting (skip next)', async () => {
    const pipeline = new MiddlewarePipeline();
    let coreCalled = false;

    pipeline.use(async (ctx, _next) => {
      ctx.response = 'blocked';
      // 不调用 next()
    });

    const ctx: MiddlewareContext = { input: 'test', channel: 'cli', metadata: {}, startedAt: Date.now() };
    await pipeline.execute(ctx, async () => { coreCalled = true; });

    expect(coreCalled).toBe(false);
    expect(ctx.response).toBe('blocked');
  });

  it('should share context between middlewares', async () => {
    const pipeline = new MiddlewarePipeline();

    pipeline.use(async (ctx, next) => {
      ctx.metadata.step1 = true;
      await next();
    });
    pipeline.use(async (ctx, next) => {
      expect(ctx.metadata.step1).toBe(true);
      ctx.metadata.step2 = true;
      await next();
    });

    const ctx: MiddlewareContext = { input: 'test', channel: 'cli', metadata: {}, startedAt: Date.now() };
    await pipeline.execute(ctx, async () => {});

    expect(ctx.metadata.step2).toBe(true);
  });

  it('should report size', () => {
    const pipeline = new MiddlewarePipeline();
    expect(pipeline.size).toBe(0);

    pipeline.use(async (_ctx, next) => { await next(); });
    pipeline.use(async (_ctx, next) => { await next(); });

    expect(pipeline.size).toBe(2);
  });

  it('should clear middlewares', () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(async (_ctx, next) => { await next(); });
    pipeline.clear();
    expect(pipeline.size).toBe(0);
  });
});

describe('sanitizeMiddleware', () => {
  it('should trim whitespace', async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(sanitizeMiddleware());

    const ctx: MiddlewareContext = { input: '  hello  ', channel: 'cli', metadata: {}, startedAt: Date.now() };
    await pipeline.execute(ctx, async () => {});

    expect(ctx.input).toBe('hello');
  });

  it('should remove control characters', async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(sanitizeMiddleware());

    const ctx: MiddlewareContext = { input: 'hel\x00lo\x01', channel: 'cli', metadata: {}, startedAt: Date.now() };
    await pipeline.execute(ctx, async () => {});

    expect(ctx.input).toBe('hello');
  });

  it('should truncate long input', async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(sanitizeMiddleware());

    const longInput = 'a'.repeat(15000);
    const ctx: MiddlewareContext = { input: longInput, channel: 'cli', metadata: {}, startedAt: Date.now() };
    await pipeline.execute(ctx, async () => {});

    expect(ctx.input.length).toBe(10000);
    expect(ctx.metadata.truncated).toBe(true);
  });
});

describe('loggingMiddleware', () => {
  it('should log input and output', async () => {
    const logs: string[] = [];
    const pipeline = new MiddlewarePipeline();
    pipeline.use(loggingMiddleware((msg) => logs.push(msg)));

    const ctx: MiddlewareContext = { input: 'test', channel: 'cli', metadata: {}, startedAt: Date.now() };
    await pipeline.execute(ctx, async (c) => { c.response = 'ok'; });

    expect(logs).toHaveLength(2);
    expect(logs[0]).toContain('→');
    expect(logs[1]).toContain('←');
  });
});

describe('rateLimitMiddleware', () => {
  it('should allow requests under limit', async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(rateLimitMiddleware({ maxRequests: 3, windowMs: 1000 }));

    let response = '';
    const ctx: MiddlewareContext = { input: 'test', channel: 'cli', metadata: {}, startedAt: Date.now() };
    await pipeline.execute(ctx, async (c) => { c.response = 'ok'; response = 'ok'; });

    expect(response).toBe('ok');
    expect(ctx.response).toBe('ok');
  });

  it('should block requests over limit', async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(rateLimitMiddleware({ maxRequests: 2, windowMs: 1000 }));

    let coreCount = 0;
    const makeRequest = async () => {
      const ctx: MiddlewareContext = { input: 'test', channel: 'cli', metadata: {}, startedAt: Date.now() };
      await pipeline.execute(ctx, async () => { coreCount++; });
      return ctx;
    };

    await makeRequest();
    await makeRequest();
    const ctx3 = await makeRequest();

    expect(coreCount).toBe(2);
    expect(ctx3.metadata.rateLimited).toBe(true);
    expect(ctx3.response).toContain('Rate limit');
  });
});

describe('structuredLoggingMiddleware', () => {
  it('should log without throwing', async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(structuredLoggingMiddleware());

    const ctx: MiddlewareContext = { input: 'hello', channel: 'cli', metadata: {}, startedAt: Date.now() };
    await pipeline.execute(ctx, async (c) => { c.response = 'world'; });

    // Structured logging uses Logger — just verify it doesn't throw
    expect(ctx.response).toBe('world');
  });
});

describe('metricsMiddleware', () => {
  it('should record duration and response length in metadata', async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(metricsMiddleware());

    const ctx: MiddlewareContext = { input: 'test', channel: 'cli', metadata: {}, startedAt: Date.now() };
    const responseContent = 'A response that is exactly this long';
    await pipeline.execute(ctx, async (c) => { c.response = responseContent; });

    expect(typeof ctx.metadata.metricsDuration).toBe('number');
    expect(ctx.metadata.metricsDuration).toBeGreaterThanOrEqual(0);
    expect(ctx.metadata.metricsResponseLength).toBe(responseContent.length);
  });
});

describe('authMiddleware', () => {
  it('should skip auth for CLI channel', async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(authMiddleware('secret-token'));

    const ctx: MiddlewareContext = { input: 'test', channel: 'cli', metadata: {}, startedAt: Date.now() };
    await pipeline.execute(ctx, async (c) => { c.response = 'ok'; });

    expect(ctx.response).toBe('ok');
    expect(ctx.skipped).toBeFalsy();
  });

  it('should skip auth when no token configured', async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(authMiddleware(''));

    const ctx: MiddlewareContext = { input: 'test', channel: 'api', metadata: {}, startedAt: Date.now() };
    await pipeline.execute(ctx, async (c) => { c.response = 'ok'; });

    expect(ctx.response).toBe('ok');
    expect(ctx.metadata.authFailed).toBeFalsy();
  });

  it('should reject requests with wrong token', async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(authMiddleware('correct-token'));

    const ctx: MiddlewareContext = {
      input: 'test',
      channel: 'api',
      metadata: { authToken: 'wrong-token' },
      startedAt: Date.now(),
    };
    await pipeline.execute(ctx, async () => {});

    expect(ctx.skipped).toBe(true);
    expect(ctx.response).toContain('Unauthorized');
    expect(ctx.metadata.authFailed).toBe(true);
  });

  it('should reject requests with no token', async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(authMiddleware('my-token'));

    const ctx: MiddlewareContext = { input: 'test', channel: 'api', metadata: {}, startedAt: Date.now() };
    await pipeline.execute(ctx, async () => {});

    expect(ctx.skipped).toBe(true);
    expect(ctx.metadata.authFailed).toBe(true);
  });

  it('should accept requests with correct token', async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(authMiddleware('my-secret'));

    const ctx: MiddlewareContext = {
      input: 'test',
      channel: 'api',
      metadata: { authToken: 'my-secret' },
      startedAt: Date.now(),
    };
    await pipeline.execute(ctx, async (c) => { c.response = 'ok'; });

    expect(ctx.response).toBe('ok');
    expect(ctx.metadata.authenticated).toBe(true);
  });
});

describe('MiddlewarePipeline edge cases', () => {
  it('should work with empty pipeline (no middleware)', async () => {
    const pipeline = new MiddlewarePipeline();

    const ctx: MiddlewareContext = { input: 'test', channel: 'cli', metadata: {}, startedAt: Date.now() };
    await pipeline.execute(ctx, async (c) => { c.response = 'direct'; });

    expect(ctx.response).toBe('direct');
  });

  it('should support post-processing after next()', async () => {
    const pipeline = new MiddlewarePipeline();

    pipeline.use(async (ctx, next) => {
      await next();
      ctx.response = `[wrapped] ${ctx.response}`;
    });

    const ctx: MiddlewareContext = { input: 'test', channel: 'cli', metadata: {}, startedAt: Date.now() };
    await pipeline.execute(ctx, async (c) => { c.response = 'original'; });

    expect(ctx.response).toBe('[wrapped] original');
  });

  it('use() should return this for chaining', () => {
    const pipeline = new MiddlewarePipeline();
    const result = pipeline.use(async (_ctx, next) => { await next(); });

    expect(result).toBe(pipeline);
  });

  it('should propagate errors to caller', async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(async (_ctx, next) => { await next(); });

    const ctx: MiddlewareContext = { input: 'test', channel: 'cli', metadata: {}, startedAt: Date.now() };
    await expect(
      pipeline.execute(ctx, async () => { throw new Error('core error'); }),
    ).rejects.toThrow('core error');
  });

  it('should propagate middleware errors', async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(async () => { throw new Error('middleware error'); });

    const ctx: MiddlewareContext = { input: 'test', channel: 'cli', metadata: {}, startedAt: Date.now() };
    await expect(
      pipeline.execute(ctx, async () => {}),
    ).rejects.toThrow('middleware error');
  });

  it('should handle multiple short-circuits correctly', async () => {
    const pipeline = new MiddlewarePipeline();
    const order: number[] = [];

    pipeline.use(async (ctx, next) => {
      order.push(1);
      await next();
      order.push(6);
    });
    pipeline.use(async (ctx, _next) => {
      order.push(2);
      ctx.response = 'blocked at 2';
      // Short-circuit — don't call next()
    });
    pipeline.use(async (_ctx, next) => {
      order.push(99); // Should never execute
      await next();
    });

    const ctx: MiddlewareContext = { input: 'test', channel: 'cli', metadata: {}, startedAt: Date.now() };
    await pipeline.execute(ctx, async () => { order.push(100); });

    expect(order).toEqual([1, 2, 6]);
    expect(ctx.response).toBe('blocked at 2');
  });
});

describe('sensitiveDataFilterMiddleware', () => {
  it('should redact API keys in responses', async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(sensitiveDataFilterMiddleware());

    const ctx: MiddlewareContext = { input: 'test', channel: 'cli', metadata: {}, startedAt: Date.now() };
    await pipeline.execute(ctx, async (c) => {
      c.response = 'Your key is sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890';
    });

    expect(ctx.response).not.toContain('sk-ant-api03');
    expect(ctx.response).toContain('[REDACTED_API_KEY]');
    expect(ctx.metadata.filteredPII).toBe(true);
  });

  it('should redact private keys', async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(sensitiveDataFilterMiddleware());

    const ctx: MiddlewareContext = { input: 'test', channel: 'cli', metadata: {}, startedAt: Date.now() };
    await pipeline.execute(ctx, async (c) => {
      c.response = 'key:\n-----BEGIN RSA PRIVATE KEY-----\nMIIEowI\n-----END RSA PRIVATE KEY-----';
    });

    expect(ctx.response).not.toContain('MIIEowI');
    expect(ctx.response).toContain('[REDACTED_PRIVATE_KEY]');
  });

  it('should redact SSN patterns', async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(sensitiveDataFilterMiddleware());

    const ctx: MiddlewareContext = { input: 'test', channel: 'cli', metadata: {}, startedAt: Date.now() };
    await pipeline.execute(ctx, async (c) => {
      c.response = 'SSN: 123-45-6789';
    });

    expect(ctx.response).toContain('[REDACTED_SSN]');
    expect(ctx.response).not.toContain('123-45-6789');
  });

  it('should not modify clean responses', async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(sensitiveDataFilterMiddleware());

    const ctx: MiddlewareContext = { input: 'test', channel: 'cli', metadata: {}, startedAt: Date.now() };
    await pipeline.execute(ctx, async (c) => {
      c.response = 'Hello! The weather is nice today.';
    });

    expect(ctx.response).toBe('Hello! The weather is nice today.');
    expect(ctx.metadata.filteredPII).toBeUndefined();
  });

  it('should handle undefined response', async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(sensitiveDataFilterMiddleware());

    const ctx: MiddlewareContext = { input: 'test', channel: 'cli', metadata: {}, startedAt: Date.now() };
    await pipeline.execute(ctx, async () => {
      // No response set
    });

    expect(ctx.response).toBeUndefined();
  });
});
