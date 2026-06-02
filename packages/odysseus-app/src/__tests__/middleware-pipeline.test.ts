/**
 * Middleware Pipeline Tests
 *
 * 验证洋葱模型中间件系统：
 * - 管道执行顺序
 * - 上下文传递
 * - 内置中间件（sanitize, rateLimit, auth, metrics, logging, PII filter）
 * - 错误传播
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MiddlewarePipeline,
  type MiddlewareContext,
  type Middleware,
  sanitizeMiddleware,
  rateLimitMiddleware,
  authMiddleware,
  metricsMiddleware,
  sensitiveDataFilterMiddleware,
} from '../orchestrator/middleware.js';

function createContext(overrides?: Partial<MiddlewareContext>): MiddlewareContext {
  return {
    input: 'Hello world',
    channel: 'cli',
    metadata: {},
    startedAt: Date.now(),
    ...overrides,
  };
}

describe('MiddlewarePipeline', () => {
  describe('execution order', () => {
    it('should execute middlewares in registration order', async () => {
      const order: number[] = [];
      const pipeline = new MiddlewarePipeline();

      pipeline.use(async (_ctx, next) => { order.push(1); await next(); });
      pipeline.use(async (_ctx, next) => { order.push(2); await next(); });
      pipeline.use(async (_ctx, next) => { order.push(3); await next(); });

      const ctx = createContext();
      await pipeline.execute(ctx, async () => { order.push(4); });

      expect(order).toEqual([1, 2, 3, 4]);
    });

    it('should execute in onion model (post-order after next)', async () => {
      const order: string[] = [];
      const pipeline = new MiddlewarePipeline();

      pipeline.use(async (_ctx, next) => {
        order.push('A-pre');
        await next();
        order.push('A-post');
      });
      pipeline.use(async (_ctx, next) => {
        order.push('B-pre');
        await next();
        order.push('B-post');
      });

      const ctx = createContext();
      await pipeline.execute(ctx, async () => { order.push('core'); });

      expect(order).toEqual(['A-pre', 'B-pre', 'core', 'B-post', 'A-post']);
    });

    it('should work with empty pipeline (only core handler)', async () => {
      const pipeline = new MiddlewarePipeline();
      const ctx = createContext();

      await pipeline.execute(ctx, async (c) => { c.response = 'done'; });

      expect(ctx.response).toBe('done');
    });
  });

  describe('context passing', () => {
    it('should share context across middlewares', async () => {
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

      const ctx = createContext();
      await pipeline.execute(ctx, async (c) => {
        expect(c.metadata.step2).toBe(true);
        c.response = 'verified';
      });

      expect(ctx.response).toBe('verified');
    });

    it('should allow middleware to modify input', async () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use(async (ctx, next) => {
        ctx.input = ctx.input.toUpperCase();
        await next();
      });

      const ctx = createContext({ input: 'hello' });
      await pipeline.execute(ctx, async (c) => {
        c.response = c.input;
      });

      expect(ctx.response).toBe('HELLO');
    });
  });

  describe('core handler response', () => {
    it('should allow core handler to set response', async () => {
      const pipeline = new MiddlewarePipeline();
      const ctx = createContext();

      await pipeline.execute(ctx, async (c) => { c.response = 'core response'; });

      expect(ctx.response).toBe('core response');
    });

    it('should allow middleware to override response', async () => {
      const pipeline = new MiddlewarePipeline();

      pipeline.use(async (ctx, next) => {
        await next();
        ctx.response = 'overridden';
      });

      const ctx = createContext();
      await pipeline.execute(ctx, async (c) => { c.response = 'original'; });

      expect(ctx.response).toBe('overridden');
    });
  });

  describe('size and clear', () => {
    it('should report correct size', () => {
      const pipeline = new MiddlewarePipeline();
      expect(pipeline.size).toBe(0);

      pipeline.use(async (_ctx, next) => { await next(); });
      expect(pipeline.size).toBe(1);

      pipeline.use(async (_ctx, next) => { await next(); });
      expect(pipeline.size).toBe(2);
    });

    it('should clear all middlewares', () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use(async (_ctx, next) => { await next(); });
      pipeline.use(async (_ctx, next) => { await next(); });

      pipeline.clear();
      expect(pipeline.size).toBe(0);
    });
  });

  describe('sanitizeMiddleware', () => {
    it('should trim whitespace', async () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use(sanitizeMiddleware());

      const ctx = createContext({ input: '  hello world  ' });
      await pipeline.execute(ctx, async (c) => { c.response = c.input; });

      expect(ctx.response).toBe('hello world');
    });

    it('should remove control characters', async () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use(sanitizeMiddleware());

      const ctx = createContext({ input: 'hello\x00\x01world\x1F' });
      await pipeline.execute(ctx, async (c) => { c.response = c.input; });

      expect(ctx.response).toBe('helloworld');
    });

    it('should truncate very long input', async () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use(sanitizeMiddleware());

      const longInput = 'a'.repeat(15000);
      const ctx = createContext({ input: longInput });
      await pipeline.execute(ctx, async (c) => { c.response = c.input; });

      expect(ctx.response!.length).toBe(10000);
      expect(ctx.metadata.truncated).toBe(true);
    });

    it('should not modify normal input', async () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use(sanitizeMiddleware());

      const ctx = createContext({ input: 'Hello, how are you?' });
      await pipeline.execute(ctx, async (c) => { c.response = c.input; });

      expect(ctx.response).toBe('Hello, how are you?');
      expect(ctx.metadata.truncated).toBeUndefined();
    });
  });

  describe('rateLimitMiddleware', () => {
    it('should allow requests under limit', async () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use(rateLimitMiddleware({ maxRequests: 3, windowMs: 1000 }));

      const ctx = createContext();
      await pipeline.execute(ctx, async (c) => { c.response = 'ok'; });

      expect(ctx.response).toBe('ok');
      expect(ctx.skipped).toBeUndefined();
    });

    it('should block requests over limit', async () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use(rateLimitMiddleware({ maxRequests: 2, windowMs: 10000 }));

      // First 2 should pass
      for (let i = 0; i < 2; i++) {
        const ctx = createContext();
        await pipeline.execute(ctx, async (c) => { c.response = 'ok'; });
        expect(ctx.skipped).toBeUndefined();
      }

      // 3rd should be blocked
      const ctx3 = createContext();
      await pipeline.execute(ctx3, async () => { ctx3.response = 'should not reach'; });

      expect(ctx3.skipped).toBe(true);
      expect(ctx3.response).toContain('Rate limit');
      expect(ctx3.metadata.rateLimited).toBe(true);
    });

    it('should call onLimited callback', async () => {
      const onLimited = vi.fn();
      const pipeline = new MiddlewarePipeline();
      pipeline.use(rateLimitMiddleware({ maxRequests: 1, windowMs: 10000, onLimited }));

      // Exhaust limit
      await pipeline.execute(createContext(), async () => {});
      // Trigger limit
      await pipeline.execute(createContext(), async () => {});

      expect(onLimited).toHaveBeenCalledTimes(1);
    });
  });

  describe('authMiddleware', () => {
    it('should skip auth for CLI channel', async () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use(authMiddleware('secret-token'));

      const ctx = createContext({ channel: 'cli' });
      await pipeline.execute(ctx, async (c) => { c.response = 'ok'; });

      expect(ctx.response).toBe('ok');
      expect(ctx.metadata.authFailed).toBeUndefined();
    });

    it('should skip auth when no token configured', async () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use(authMiddleware(''));

      const ctx = createContext({ channel: 'api' });
      await pipeline.execute(ctx, async (c) => { c.response = 'ok'; });

      expect(ctx.response).toBe('ok');
    });

    it('should reject invalid token', async () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use(authMiddleware('secret-token'));

      const ctx = createContext({
        channel: 'api',
        metadata: { authToken: 'wrong-token' },
      });
      await pipeline.execute(ctx, async () => { ctx.response = 'should not reach'; });

      expect(ctx.skipped).toBe(true);
      expect(ctx.response).toContain('Unauthorized');
      expect(ctx.metadata.authFailed).toBe(true);
    });

    it('should accept valid token', async () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use(authMiddleware('secret-token'));

      const ctx = createContext({
        channel: 'api',
        metadata: { authToken: 'secret-token' },
      });
      await pipeline.execute(ctx, async (c) => { c.response = 'ok'; });

      expect(ctx.response).toBe('ok');
      expect(ctx.metadata.authenticated).toBe(true);
    });
  });

  describe('metricsMiddleware', () => {
    it('should record duration and response length', async () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use(metricsMiddleware());

      const ctx = createContext();
      await pipeline.execute(ctx, async (c) => { c.response = 'A response of some length'; });

      expect(ctx.metadata.metricsDuration).toBeDefined();
      expect(typeof ctx.metadata.metricsDuration).toBe('number');
      expect(ctx.metadata.metricsResponseLength).toBe('A response of some length'.length);
    });
  });

  describe('sensitiveDataFilterMiddleware', () => {
    it('should redact API keys', async () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use(sensitiveDataFilterMiddleware());

      const ctx = createContext();
      await pipeline.execute(ctx, async (c) => {
        c.response = 'Your key is sk-abc123def456ghi789jkl012mno345';
      });

      expect(ctx.response).toContain('[REDACTED_API_KEY]');
      expect(ctx.response).not.toContain('sk-abc123');
    });

    it('should redact credit card numbers', async () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use(sensitiveDataFilterMiddleware());

      const ctx = createContext();
      await pipeline.execute(ctx, async (c) => {
        c.response = 'Card: 4111-1111-1111-1111';
      });

      expect(ctx.response).toContain('[REDACTED_CARD]');
      expect(ctx.response).not.toContain('4111');
    });

    it('should redact SSN patterns', async () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use(sensitiveDataFilterMiddleware());

      const ctx = createContext();
      await pipeline.execute(ctx, async (c) => {
        c.response = 'SSN: 123-45-6789';
      });

      expect(ctx.response).toContain('[REDACTED_SSN]');
    });

    it('should not modify clean responses', async () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use(sensitiveDataFilterMiddleware());

      const ctx = createContext();
      await pipeline.execute(ctx, async (c) => {
        c.response = 'This is a normal response with no sensitive data';
      });

      expect(ctx.response).toBe('This is a normal response with no sensitive data');
      expect(ctx.metadata.filteredPII).toBeUndefined();
    });
  });

  describe('composed middleware pipeline', () => {
    it('should compose sanitize + metrics + core handler', async () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use(sanitizeMiddleware());
      pipeline.use(metricsMiddleware());

      const ctx = createContext({ input: '  hello  ' });
      await pipeline.execute(ctx, async (c) => { c.response = 'world'; });

      expect(ctx.response).toBe('world');
      expect(ctx.metadata.metricsDuration).toBeDefined();
      // Input was sanitized before reaching core
    });

    it('should compose auth + rate limit + core handler', async () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use(authMiddleware('my-token'));
      pipeline.use(rateLimitMiddleware({ maxRequests: 5, windowMs: 1000 }));

      const ctx = createContext({
        channel: 'api',
        metadata: { authToken: 'my-token' },
      });
      await pipeline.execute(ctx, async (c) => { c.response = 'success'; });

      expect(ctx.response).toBe('success');
      expect(ctx.metadata.authenticated).toBe(true);
    });
  });
});
