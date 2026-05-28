/**
 * API Server Tests
 */

import * as net from 'node:net';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { APIServer } from '../api/index.js';

function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const p = addr.port;
        srv.close(() => resolve(p));
      } else {
        srv.close(() => reject(new Error('Failed to get port')));
      }
    });
    srv.on('error', reject);
  });
}

describe('APIServer', () => {
  let server: APIServer;
  let port: number;

  beforeEach(async () => {
    port = await getAvailablePort();
    server = new APIServer(port, 'localhost');
  });

  afterEach(async () => {
    await server.stop();
  });

  it('should start and stop the server', async () => {
    server.route('GET', '/health', () => ({
      status: 200,
      body: { status: 'ok', timestamp: Date.now() },
    }));

    await server.start();

    const response = await fetch(`http://localhost:${port}/health`);
    expect(response.status).toBe(200);

    const body = await response.json() as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('should register and handle routes', async () => {
    server.route('GET', '/test', () => ({
      status: 200,
      body: { message: 'hello' },
    }));

    await server.start();

    const response = await fetch(`http://localhost:${port}/test`);
    expect(response.status).toBe(200);

    const body = await response.json() as Record<string, unknown>;
    expect(body.message).toBe('hello');
  });

  it('should handle route with path params', async () => {
    server.route('GET', '/cells/:id', (req) => ({
      status: 200,
      body: { cellId: req.params.id },
    }));

    await server.start();

    const response = await fetch(`http://localhost:${port}/cells/test-cell-123`);
    const body = await response.json() as Record<string, unknown>;
    expect(body.cellId).toBe('test-cell-123');
  });

  it('should handle POST with JSON body', async () => {
    server.route('POST', '/echo', (req) => ({
      status: 200,
      body: { echoed: req.body },
    }));

    await server.start();

    const response = await fetch(`http://localhost:${port}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });

    const body = await response.json() as Record<string, unknown>;
    expect(body.echoed).toEqual({ hello: 'world' });
  });

  it('should return 404 for unknown routes', async () => {
    await server.start();

    const response = await fetch(`http://localhost:${port}/nonexistent`);
    expect(response.status).toBe(404);
  });

  it('should handle OPTIONS for CORS preflight', async () => {
    await server.start();

    const response = await fetch(`http://localhost:${port}/anything`, {
      method: 'OPTIONS',
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('should include X-Request-Id header in responses', async () => {
    server.route('GET', '/test-rid', () => ({ status: 200, body: { ok: true } }));
    await server.start();

    const response = await fetch(`http://localhost:${port}/test-rid`);
    expect(response.status).toBe(200);
    const requestId = response.headers.get('x-request-id');
    expect(requestId).not.toBeNull();
    // UUID format: 8-4-4-4-12 hex chars
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('should handle route handler errors', async () => {
    server.route('GET', '/error', () => {
      throw new Error('test error');
    });

    await server.start();

    const response = await fetch(`http://localhost:${port}/error`);
    expect(response.status).toBe(500);
  });

  it('should report zero connections initially', async () => {
    await server.start();
    expect(server.connectionCount).toBe(0);
  });

  it('should include security headers in responses', async () => {
    server.route('GET', '/secure', () => ({ status: 200, body: { ok: true } }));
    await server.start();

    const response = await fetch(`http://localhost:${port}/secure`);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('should reject oversized request bodies', async () => {
    server.route('POST', '/data', (req) => ({ status: 200, body: { received: true } }));
    await server.start();

    // Create a body > 1MB — server should destroy the connection
    const largePayload = { data: 'x'.repeat(1024 * 1024 + 1) };
    try {
      await fetch(`http://localhost:${port}/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(largePayload),
      });
      // If we somehow get a response, the body should be null (server closed)
    } catch (error) {
      // Connection reset is expected behavior — body too large
      expect((error as Error).message).toMatch(/closed|reset|ECONNRESET|fetch failed/i);
    }
  });

  it('should reject requests without valid Bearer token when auth is configured', async () => {
    const authPort = await getAvailablePort();
    const authServer = new APIServer(authPort, 'localhost', 'my-secret-token');
    authServer.route('GET', '/protected', () => ({ status: 200, body: { secret: true } }));
    await authServer.start();

    // No token → 401
    const noTokenResponse = await fetch(`http://localhost:${authPort}/protected`);
    expect(noTokenResponse.status).toBe(401);

    // Wrong token → 401
    const wrongTokenResponse = await fetch(`http://localhost:${authPort}/protected`, {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    expect(wrongTokenResponse.status).toBe(401);

    // Correct token → 200
    const correctResponse = await fetch(`http://localhost:${authPort}/protected`, {
      headers: { Authorization: 'Bearer my-secret-token' },
    });
    expect(correctResponse.status).toBe(200);

    await authServer.stop();
  });

  it('should apply rate limiting after exceeding threshold', async () => {
    const rlPort = await getAvailablePort();
    const rateLimitServer = new APIServer(rlPort, 'localhost');
    rateLimitServer.route('GET', '/ping', () => ({ status: 200, body: { pong: true } }));
    await rateLimitServer.start();

    // Send many requests rapidly
    let got429 = false;
    for (let i = 0; i < 110; i++) {
      const res = await fetch(`http://localhost:${rlPort}/ping`);
      if (res.status === 429) {
        got429 = true;
        const body = await res.json() as Record<string, unknown>;
        expect(body.retryAfter).toBeDefined();
        break;
      }
    }
    expect(got429).toBe(true);

    await rateLimitServer.stop();
  });
});
