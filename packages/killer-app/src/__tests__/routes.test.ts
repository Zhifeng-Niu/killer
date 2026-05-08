/**
 * API Routes Tests
 *
 * Tests for route registration and endpoint validation.
 * Uses APIServer directly with a minimal mock agent.
 */

import * as net from 'node:net';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { APIServer } from '../api/types.js';
import { registerRoutes } from '../api/routes.js';

function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Failed to get port')));
      }
    });
    server.on('error', reject);
  });
}

function createMockAgent() {
  return {
    getStatus: vi.fn(() => ({ booted: true, cells: 0, goals: 0 })),
    processInput: vi.fn(async () => ({ content: 'mock response' })),
    getCells: vi.fn(() => []),
    spawnCellWithRole: vi.fn(async () => ({ id: 'test-cell', type: 'worker', instance: 0 })),
    getGoals: vi.fn(() => []),
    createGoal: vi.fn(() => ({ id: 'goal-1', description: 'test', priority: 0.5 })),
    getPersona: vi.fn(() => ({ name: 'Test' })),
    getSkills: vi.fn(() => []),
    getMemoryStats: vi.fn(() => ({ total: 0 })),
    dream: vi.fn(async () => ({ cycles: 0 })),
    think: vi.fn(async () => ({ thoughts: 'mock' })),
    evolve: vi.fn(async () => ({ mutations: 0 })),
    delegateTask: vi.fn(async () => ({ result: 'done' })),
    listSessions: vi.fn(() => []),
    saveSession: vi.fn(),
    loadSession: vi.fn(() => true),
    toolPermissions: {
      getRules: vi.fn(() => []),
      approve: vi.fn(),
      deny: vi.fn(),
    },
    healthMonitor: {
      check: vi.fn(() => ({ healthy: true })),
    },
    getLLMDiagnostics: vi.fn(() => null),
    hooks: {
      on: vi.fn(() => ({ event: '', handler: () => {} })),
    },
    persona: {
      emotionalState: {
        exportState: vi.fn(() => ({
          primaryEmotion: 'neutral',
          intensity: 0.5,
          current: { valence: 0, arousal: 0, dominance: 0 },
        })),
      },
      predictiveModel: {
        exportState: vi.fn(() => ({
          predictedNeeds: [],
          communicationPatterns: [],
        })),
      },
    },
    hippocampus: {
      getNarrative: vi.fn(() => ({
        chapters: [],
        activeThemes: [],
        identityStatement: 'I am an AI agent.',
      })),
    },
  } as any;
}

describe('API Routes', () => {
  let server: APIServer;
  let agent: ReturnType<typeof createMockAgent>;
  let port: number;

  beforeEach(async () => {
    port = await getAvailablePort();
    server = new APIServer(port, 'localhost');
    agent = createMockAgent();
    registerRoutes(server, agent);
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('Health endpoints', () => {
    it('GET /health should return 200', async () => {
      const res = await fetch(`http://localhost:${port}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toBeDefined();
    });

    it('GET /health/report should return health check', async () => {
      const res = await fetch(`http://localhost:${port}/health/report`);
      expect(res.status).toBe(200);
      expect(agent.healthMonitor.check).toHaveBeenCalled();
    });
  });

  describe('Status endpoint', () => {
    it('GET /status should return agent status with cognitive data', async () => {
      const res = await fetch(`http://localhost:${port}/status`);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.booted).toBe(true);
      expect(body.cognitive).toBeDefined();
      expect(body.cognitive.emotion).toBeDefined();
      expect(body.cognitive.narrative).toBeDefined();
      expect(body.cognitive.predictions).toBeDefined();
    });
  });

  describe('Chat endpoint', () => {
    it('POST /chat should require message', async () => {
      const res = await fetch(`http://localhost:${port}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json() as any;
      expect(body.error).toContain('required');
    });

    it('POST /chat should process message', async () => {
      const res = await fetch(`http://localhost:${port}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello' }),
      });
      expect(res.status).toBe(200);
      expect(agent.processInput).toHaveBeenCalledWith('Hello');
      const body = await res.json() as any;
      expect(body.response).toBe('mock response');
    });
  });

  describe('Cells endpoint', () => {
    it('GET /cells should return cells list', async () => {
      const res = await fetch(`http://localhost:${port}/cells`);
      expect(res.status).toBe(200);
      expect(agent.getCells).toHaveBeenCalled();
    });

    it('POST /cells should require role', async () => {
      const res = await fetch(`http://localhost:${port}/cells`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('POST /cells should spawn cell with role', async () => {
      const res = await fetch(`http://localhost:${port}/cells`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'researcher' }),
      });
      expect(res.status).toBe(201);
      expect(agent.spawnCellWithRole).toHaveBeenCalledWith('researcher');
    });
  });

  describe('Goals endpoint', () => {
    it('GET /goals should return goals', async () => {
      const res = await fetch(`http://localhost:${port}/goals`);
      expect(res.status).toBe(200);
    });

    it('POST /goals should require description', async () => {
      const res = await fetch(`http://localhost:${port}/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('POST /goals should create goal', async () => {
      const res = await fetch(`http://localhost:${port}/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Build API', priority: 0.8 }),
      });
      expect(res.status).toBe(201);
      expect(agent.createGoal).toHaveBeenCalledWith('Build API', 0.8);
    });
  });

  describe('Action endpoints', () => {
    it('POST /dream should trigger dream cycle', async () => {
      const res = await fetch(`http://localhost:${port}/dream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      expect(agent.dream).toHaveBeenCalled();
    });

    it('POST /think should require topic', async () => {
      const res = await fetch(`http://localhost:${port}/think`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('POST /think should process topic', async () => {
      const res = await fetch(`http://localhost:${port}/think`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'AI safety' }),
      });
      expect(res.status).toBe(200);
      expect(agent.think).toHaveBeenCalledWith('AI safety');
    });

    it('POST /evolve should trigger evolution', async () => {
      const res = await fetch(`http://localhost:${port}/evolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      expect(agent.evolve).toHaveBeenCalled();
    });

    it('POST /delegate should require task', async () => {
      const res = await fetch(`http://localhost:${port}/delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('POST /delegate should process task', async () => {
      const res = await fetch(`http://localhost:${port}/delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'Research topic X' }),
      });
      expect(res.status).toBe(200);
      expect(agent.delegateTask).toHaveBeenCalledWith('Research topic X');
    });
  });

  describe('Permission endpoints', () => {
    it('GET /permissions should return rules', async () => {
      const res = await fetch(`http://localhost:${port}/permissions`);
      expect(res.status).toBe(200);
    });

    it('POST /permissions/approve should require tool', async () => {
      const res = await fetch(`http://localhost:${port}/permissions/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('POST /permissions/approve should approve tool', async () => {
      const res = await fetch(`http://localhost:${port}/permissions/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'memory_store' }),
      });
      expect(res.status).toBe(200);
      expect(agent.toolPermissions.approve).toHaveBeenCalledWith('memory_store');
    });

    it('POST /permissions/deny should require tool', async () => {
      const res = await fetch(`http://localhost:${port}/permissions/deny`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('POST /permissions/deny should deny tool', async () => {
      const res = await fetch(`http://localhost:${port}/permissions/deny`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'dangerous_tool' }),
      });
      expect(res.status).toBe(200);
      expect(agent.toolPermissions.deny).toHaveBeenCalledWith('dangerous_tool');
    });
  });

  describe('Info endpoints', () => {
    it('GET /persona should return persona', async () => {
      const res = await fetch(`http://localhost:${port}/persona`);
      expect(res.status).toBe(200);
    });

    it('GET /emotions should return emotional state', async () => {
      const res = await fetch(`http://localhost:${port}/emotions`);
      expect(res.status).toBe(200);
    });

    it('GET /narrative should return narrative', async () => {
      const res = await fetch(`http://localhost:${port}/narrative`);
      expect(res.status).toBe(200);
    });

    it('GET /predictions should return predictions', async () => {
      const res = await fetch(`http://localhost:${port}/predictions`);
      expect(res.status).toBe(200);
    });

    it('GET /skills should return skills', async () => {
      const res = await fetch(`http://localhost:${port}/skills`);
      expect(res.status).toBe(200);
    });

    it('GET /memory should return memory stats', async () => {
      const res = await fetch(`http://localhost:${port}/memory`);
      expect(res.status).toBe(200);
    });

    it('GET /sessions should return sessions', async () => {
      const res = await fetch(`http://localhost:${port}/sessions`);
      expect(res.status).toBe(200);
    });

    it('GET /metrics should return metrics snapshot', async () => {
      const res = await fetch(`http://localhost:${port}/metrics`);
      expect(res.status).toBe(200);
    });
  });

  describe('Session endpoints', () => {
    it('POST /sessions/save should save session', async () => {
      const res = await fetch(`http://localhost:${port}/sessions/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test-session' }),
      });
      expect(res.status).toBe(200);
      expect(agent.saveSession).toHaveBeenCalledWith('test-session');
    });

    it('POST /sessions/load should load session', async () => {
      const res = await fetch(`http://localhost:${port}/sessions/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test-session' }),
      });
      expect(res.status).toBe(200);
      expect(agent.loadSession).toHaveBeenCalledWith('test-session');
    });
  });

  describe('Unknown routes', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await fetch(`http://localhost:${port}/unknown`);
      expect(res.status).toBe(404);
    });
  });

  describe('SSE /events endpoint', () => {
    it('should establish SSE connection and receive connected event', async () => {
      const response = await fetch(`http://localhost:${port}/events`, {
        headers: { 'Accept': 'text/event-stream' },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/event-stream');

      // Read the initial connected event
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      const { value } = await reader.read();
      const text = decoder.decode(value);
      expect(text).toContain('event: connected');

      reader.cancel();
    });
  });

  describe('SSE /chat/stream endpoint', () => {
    it('should reject requests without message', async () => {
      const res = await fetch(`http://localhost:${port}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('should stream tokens via SSE', async () => {
      const response = await fetch(`http://localhost:${port}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello stream' }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/event-stream');

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      const chunks: string[] = [];
      for (let i = 0; i < 5; i++) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(decoder.decode(value));
      }
      const fullText = chunks.join('');
      expect(fullText).toContain('event: done');
      reader.cancel();
    });
  });

  describe('WebSocket handler', () => {
    it('should register WS message handler', () => {
      // Access private wsHandlers to verify registration
      const handlers = (server as any).wsHandlers as Array<(conn: any, msg: string) => void>;
      expect(handlers.length).toBeGreaterThan(0);
    });

    it('should handle ping messages', () => {
      const handlers = (server as any).wsHandlers as Array<(conn: any, msg: string) => void>;
      const handler = handlers[0];

      const sent: string[] = [];
      const mockConn = { id: 'test', send: (data: string) => sent.push(data), close: vi.fn(), isAlive: true };

      handler(mockConn, JSON.stringify({ type: 'ping' }));

      expect(sent).toHaveLength(1);
      const response = JSON.parse(sent[0]!);
      expect(response.type).toBe('pong');
      expect(response.timestamp).toBeDefined();
    });

    it('should handle chat messages via WebSocket', async () => {
      const handlers = (server as any).wsHandlers as Array<(conn: any, msg: string) => void>;
      const handler = handlers[0];

      const sent: string[] = [];
      const mockConn = { id: 'test', send: (data: string) => sent.push(data), close: vi.fn(), isAlive: true };

      handler(mockConn, JSON.stringify({ type: 'chat', message: 'Hello WS' }));

      // Wait for async processInput to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(agent.processInput).toHaveBeenCalledWith('Hello WS', 'api', expect.any(Function));
      // Should receive token events and done event
      const doneMsg = sent.find(s => s.includes('"type":"done"'));
      expect(doneMsg).toBeDefined();
    });

    it('should handle invalid JSON gracefully', () => {
      const handlers = (server as any).wsHandlers as Array<(conn: any, msg: string) => void>;
      const handler = handlers[0];

      const sent: string[] = [];
      const mockConn = { id: 'test', send: (data: string) => sent.push(data), close: vi.fn(), isAlive: true };

      handler(mockConn, 'not valid json');

      expect(sent).toHaveLength(1);
      const response = JSON.parse(sent[0]!);
      expect(response.type).toBe('error');
      expect(response.error).toContain('Invalid JSON');
    });

    it('should handle unknown message types silently', () => {
      const handlers = (server as any).wsHandlers as Array<(conn: any, msg: string) => void>;
      const handler = handlers[0];

      const sent: string[] = [];
      const mockConn = { id: 'test', send: (data: string) => sent.push(data), close: vi.fn(), isAlive: true };

      handler(mockConn, JSON.stringify({ type: 'unknown_action' }));

      // Unknown types should be silently ignored (no response sent)
      expect(sent).toHaveLength(0);
    });
  });

  describe('Bearer token authentication', () => {
    it('should reject requests without token when auth is configured', async () => {
      // Create server with auth token
      const authPort = await getAvailablePort();
      const authServer = new APIServer(authPort, 'localhost', 'secret-token-123');
      registerRoutes(authServer, createMockAgent());
      await authServer.start();

      try {
        const res = await fetch(`http://localhost:${authPort}/status`);
        expect(res.status).toBe(401);
        const body = await res.json() as any;
        expect(body.error).toBe('Unauthorized');
      } finally {
        await authServer.stop();
      }
    });

    it('should allow requests with correct Bearer token', async () => {
      const authPort = await getAvailablePort();
      const authServer = new APIServer(authPort, 'localhost', 'secret-token-123');
      registerRoutes(authServer, createMockAgent());
      await authServer.start();

      try {
        const res = await fetch(`http://localhost:${authPort}/status`, {
          headers: { Authorization: 'Bearer secret-token-123' },
        });
        expect(res.status).toBe(200);
      } finally {
        await authServer.stop();
      }
    });

    it('should reject requests with wrong Bearer token', async () => {
      const authPort = await getAvailablePort();
      const authServer = new APIServer(authPort, 'localhost', 'secret-token-123');
      registerRoutes(authServer, createMockAgent());
      await authServer.start();

      try {
        const res = await fetch(`http://localhost:${authPort}/status`, {
          headers: { Authorization: 'Bearer wrong-token' },
        });
        expect(res.status).toBe(401);
      } finally {
        await authServer.stop();
      }
    });

    it('should allow /health without authentication', async () => {
      const authPort = await getAvailablePort();
      const authServer = new APIServer(authPort, 'localhost', 'secret-token-123');
      registerRoutes(authServer, createMockAgent());
      await authServer.start();

      try {
        const res = await fetch(`http://localhost:${authPort}/health`);
        expect(res.status).toBe(200);
      } finally {
        await authServer.stop();
      }
    });

    it('should reject POST endpoints without token', async () => {
      const authPort = await getAvailablePort();
      const authServer = new APIServer(authPort, 'localhost', 'secret-token-123');
      registerRoutes(authServer, createMockAgent());
      await authServer.start();

      try {
        const res = await fetch(`http://localhost:${authPort}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Hello' }),
        });
        expect(res.status).toBe(401);
      } finally {
        await authServer.stop();
      }
    });
  });

  describe('Rate limiting', () => {
    it('should allow requests within rate limit', async () => {
      // 5 rapid requests should all succeed (well under 100/min limit)
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          fetch(`http://localhost:${port}/health`).then(r => r.status)
        )
      );
      expect(results.every(s => s === 200)).toBe(true);
    });

    it('should not rate limit /health endpoint', async () => {
      // /health is excluded from rate limiting
      for (let i = 0; i < 5; i++) {
        const res = await fetch(`http://localhost:${port}/health`);
        expect(res.status).toBe(200);
      }
    });
  });
});
