/**
 * Webhook Channel Tests
 *
 * 测试 HTTP Webhook 感官渠道的请求处理、认证、输入转换
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'http';
import { WebhookChannel, type WebhookPayload } from '../sensory/webhook/index.js';
import type { SensoryInput } from '../sensory/types.js';

/**
 * 发送 HTTP POST 请求
 */
function post(
  port: number,
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const responseBody = JSON.parse(Buffer.concat(chunks).toString());
          resolve({ statusCode: res.statusCode!, body: responseBody });
        });
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(
  port: number,
  path: string,
): Promise<{ statusCode: number }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: 'localhost', port, path, method: 'GET' },
      (res) => {
        res.resume();
        resolve({ statusCode: res.statusCode! });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('WebhookChannel', () => {
  const TEST_PORT = 18923;
  let channel: WebhookChannel;

  afterEach(async () => {
    if (channel) {
      await channel.stop();
    }
  });

  describe('Lifecycle', () => {
    it('should start and stop the HTTP server', async () => {
      channel = new WebhookChannel({ port: TEST_PORT });
      await channel.start();

      expect(channel.getStatus().connected).toBe(true);

      await channel.stop();
      expect(channel.getStatus().connected).toBe(false);
    });

    it('should not crash on double start', async () => {
      channel = new WebhookChannel({ port: TEST_PORT });
      await channel.start();
      await channel.start(); // idempotent

      expect(channel.getStatus().connected).toBe(true);
    });

    it('should not crash on double stop', async () => {
      channel = new WebhookChannel({ port: TEST_PORT });
      await channel.start();
      await channel.stop();
      await channel.stop(); // idempotent
    });

    it('should report correct channel type', () => {
      channel = new WebhookChannel({ port: TEST_PORT });
      expect(channel.getChannelType()).toBe('web');
    });
  });

  describe('Request Handling', () => {
    let receivedInputs: SensoryInput[];

    beforeEach(async () => {
      receivedInputs = [];
      channel = new WebhookChannel({ port: TEST_PORT });
      channel.onInput((input) => receivedInputs.push(input));
      await channel.start();
    });

    it('should accept valid POST requests', async () => {
      const res = await post(TEST_PORT, '/webhook', {
        content: 'Hello from external system',
        source: 'ci-pipeline',
        priority: 'high',
        metadata: { branch: 'main' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.inputId).toBeDefined();

      expect(receivedInputs.length).toBe(1);
      expect(receivedInputs[0].content).toBe('Hello from external system');
      expect(receivedInputs[0].source).toBe('ci-pipeline');
      expect(receivedInputs[0].priority).toBe('high');
      expect(receivedInputs[0].metadata).toEqual({ branch: 'main' });
    });

    it('should use defaults for optional fields', async () => {
      const res = await post(TEST_PORT, '/webhook', {
        content: 'Simple message',
      });

      expect(res.statusCode).toBe(200);
      expect(receivedInputs[0].priority).toBe('normal');
      expect(receivedInputs[0].source).toContain('webhook:');
      expect(receivedInputs[0].metadata).toEqual({});
    });

    it('should reject GET requests', async () => {
      const res = await get(TEST_PORT, '/webhook');
      expect(res.statusCode).toBe(405);
    });

    it('should reject requests to wrong paths', async () => {
      const res = await post(TEST_PORT, '/wrong-path', { content: 'test' });
      expect(res.statusCode).toBe(404);
    });

    it('should reject requests without content', async () => {
      const res = await post(TEST_PORT, '/webhook', { source: 'test' });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('content');
    });

    it('should reject invalid JSON', async () => {
      const res = await new Promise<{ statusCode: number; body: Record<string, unknown> }>(
        (resolve, reject) => {
          const req = http.request(
            {
              hostname: 'localhost',
              port: TEST_PORT,
              path: '/webhook',
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            },
            (res) => {
              const chunks: Buffer[] = [];
              res.on('data', (chunk) => chunks.push(chunk));
              res.on('end', () => {
                resolve({
                  statusCode: res.statusCode!,
                  body: JSON.parse(Buffer.concat(chunks).toString()),
                });
              });
            },
          );
          req.on('error', reject);
          req.write('not json');
          req.end();
        },
      );

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Authentication', () => {
    let authInputs: SensoryInput[];

    beforeEach(async () => {
      authInputs = [];
      channel = new WebhookChannel({ port: TEST_PORT, authToken: 'secret-token' });
      channel.onInput((input) => authInputs.push(input));
      await channel.start();
    });

    it('should accept requests with valid token', async () => {
      const res = await post(
        TEST_PORT,
        '/webhook',
        { content: 'Authenticated message' },
        { Authorization: 'Bearer secret-token' },
      );

      expect(res.statusCode).toBe(200);
      expect(authInputs.length).toBe(1);
    });

    it('should reject requests without token', async () => {
      const res = await post(TEST_PORT, '/webhook', { content: 'No token' });
      expect(res.statusCode).toBe(401);
      expect(authInputs.length).toBe(0);
    });

    it('should reject requests with wrong token', async () => {
      const res = await post(
        TEST_PORT,
        '/webhook',
        { content: 'Wrong token' },
        { Authorization: 'Bearer wrong-token' },
      );

      expect(res.statusCode).toBe(401);
      expect(authInputs.length).toBe(0);
    });
  });

  describe('Custom Path', () => {
    beforeEach(async () => {
      channel = new WebhookChannel({ port: TEST_PORT, path: '/api/events' });
      await channel.start();
    });

    it('should accept requests to custom path', async () => {
      const res = await post(TEST_PORT, '/api/events', { content: 'Custom path' });
      expect(res.statusCode).toBe(200);
    });

    it('should reject requests to default path', async () => {
      const res = await post(TEST_PORT, '/webhook', { content: 'Default path' });
      expect(res.statusCode).toBe(404);
    });

    it('should expose correct webhook URL', () => {
      expect(channel.getWebhookUrl()).toBe('http://localhost:18923/api/events');
    });
  });
});
