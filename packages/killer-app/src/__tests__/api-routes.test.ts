/**
 * API Routes Integration Tests
 *
 * 启动真实 HTTP 服务器测试 API 端点：
 * - Health & Status 端点
 * - Chat 端点
 * - Memory/Persona/Emotions/Narrative/Predictions 端点
 * - Goals/Sessions/Permissions 端点
 * - 认证和速率限制
 * - SSE 事件流
 * - WebSocket 通信
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { APIServer } from '../api/types.js';
import { registerRoutes } from '../api/routes.js';
import { KillerAgent, type AgentConfig } from '../orchestrator/index.js';
import { MockLLMProvider } from '@killer/core';
import type { LLMProvider, LLMCompletion } from '@killer/core';

const TEST_PORT = 13087;

class StreamingMockLLM implements LLMProvider {
  async complete(prompt: string): Promise<LLMCompletion> {
    return { content: 'Mock response', model: 'stream-mock', finishReason: 'stop' };
  }

  async *stream(prompt: string): AsyncIterable<string> {
    yield 'Mock ';
    yield 'streaming ';
    yield 'response';
  }

  getModel(): string {
    return 'stream-mock';
  }
}

describe('API Routes Integration', () => {
  let agent: KillerAgent;
  let server: APIServer;
  const baseUrl = `http://localhost:${TEST_PORT}`;

  beforeAll(async () => {
    const config: AgentConfig = {
      llm: new StreamingMockLLM(),
      sensory: { enabledChannels: [], bufferSize: 100 },
      memory: { dreamingEnabled: false, forgettingEnabled: false },
      prefrontal: { maxPlanSteps: 3, maxConcurrentPlans: 2, riskTolerance: 0.5 },
      evolutionEnabled: false,
      debugLogging: false,
    };

    agent = new KillerAgent(config);
    await agent.boot();

    server = new APIServer(TEST_PORT, 'localhost');
    registerRoutes(server, agent);
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
    await agent.shutdown();
  });

  async function fetchAPI(path: string, options?: RequestInit): Promise<{ status: number; body: any }> {
    const res = await fetch(`${baseUrl}${path}`, options);
    const body = await res.json();
    return { status: res.status, body };
  }

  // === Health & Status ===

  describe('GET /health', () => {
    it('should return health status', async () => {
      const { status, body } = await fetchAPI('/health');
      expect(status).toBe(200);
      expect(body).toBeDefined();
    });
  });

  describe('GET /status', () => {
    it('should return agent status with cognitive state', async () => {
      const { status, body } = await fetchAPI('/status');
      expect(status).toBe(200);
      expect(body.running).toBe(true);
      expect(body.modules).toBeDefined();
      expect(body.cognitive).toBeDefined();
      expect(body.cognitive.emotion).toBeDefined();
      expect(body.cognitive.narrative).toBeDefined();
      expect(body.cognitive.predictions).toBeDefined();
    });
  });

  describe('GET /health/report', () => {
    it('should return detailed health report', async () => {
      const { status, body } = await fetchAPI('/health/report');
      expect(status).toBe(200);
      expect(body).toBeDefined();
    });
  });

  // === Chat ===

  describe('POST /chat', () => {
    it('should process chat message', async () => {
      const { status, body } = await fetchAPI('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello agent' }),
      });
      expect(status).toBe(200);
      expect(body.response).toBeTruthy();
    });

    it('should return 400 when message is missing', async () => {
      const { status, body } = await fetchAPI('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(status).toBe(400);
      expect(body.error).toContain('required');
    });

    it('should return 400 when message is not string', async () => {
      const { status, body } = await fetchAPI('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 123 }),
      });
      expect(status).toBe(400);
    });
  });

  // === Memory & Cognitive ===

  describe('GET /memory', () => {
    it('should return memory stats', async () => {
      const { status, body } = await fetchAPI('/memory');
      expect(status).toBe(200);
      expect(body.totalEpisodes).toBeDefined();
    });
  });

  describe('GET /persona', () => {
    it('should return persona info', async () => {
      const { status, body } = await fetchAPI('/persona');
      expect(status).toBe(200);
      expect(body).toBeDefined();
    });
  });

  describe('GET /emotions', () => {
    it('should return emotional state', async () => {
      const { status, body } = await fetchAPI('/emotions');
      expect(status).toBe(200);
      expect(body.primaryEmotion).toBeDefined();
      expect(body.intensity).toBeDefined();
    });
  });

  describe('GET /narrative', () => {
    it('should return narrative state', async () => {
      const { status, body } = await fetchAPI('/narrative');
      expect(status).toBe(200);
      expect(body.chapters).toBeDefined();
    });
  });

  describe('GET /predictions', () => {
    it('should return prediction state', async () => {
      const { status, body } = await fetchAPI('/predictions');
      expect(status).toBe(200);
      expect(body.predictedNeeds).toBeDefined();
      expect(body.communicationPatterns).toBeDefined();
    });
  });

  describe('GET /skills', () => {
    it('should return skills list', async () => {
      const { status, body } = await fetchAPI('/skills');
      expect(status).toBe(200);
      expect(Array.isArray(body.skills)).toBe(true);
    });
  });

  // === Cells ===

  describe('GET /cells', () => {
    it('should return cells list', async () => {
      const { status, body } = await fetchAPI('/cells');
      expect(status).toBe(200);
      expect(body.cells).toBeDefined();
    });
  });

  describe('POST /cells', () => {
    it('should return 400 when role is missing', async () => {
      const { status, body } = await fetchAPI('/cells', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(status).toBe(400);
    });
  });

  // === Goals ===

  describe('GET /goals', () => {
    it('should return goals list', async () => {
      const { status, body } = await fetchAPI('/goals');
      expect(status).toBe(200);
      expect(body.goals).toBeDefined();
    });
  });

  describe('POST /goals', () => {
    it('should create a goal', async () => {
      const { status, body } = await fetchAPI('/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Test goal' }),
      });
      expect(status).toBe(201);
      expect(body.goal).toBeDefined();
      expect(body.goal.description).toBe('Test goal');
    });

    it('should return 400 when description is missing', async () => {
      const { status, body } = await fetchAPI('/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(status).toBe(400);
    });

    it('should clamp priority to [0, 1]', async () => {
      const { status, body } = await fetchAPI('/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Priority test', priority: 5 }),
      });
      expect(status).toBe(201);
      expect(body.goal.priority).toBeLessThanOrEqual(1);
    });
  });

  // === Sessions ===

  describe('GET /sessions', () => {
    it('should return sessions list', async () => {
      const { status, body } = await fetchAPI('/sessions');
      expect(status).toBe(200);
      expect(body.sessions).toBeDefined();
    });
  });

  describe('POST /sessions/save', () => {
    it('should save session', async () => {
      const { status, body } = await fetchAPI('/sessions/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(status).toBe(200);
      expect(body.saved).toBe(true);
    });
  });

  // === Permissions ===

  describe('GET /permissions', () => {
    it('should return permission rules', async () => {
      const { status, body } = await fetchAPI('/permissions');
      expect(status).toBe(200);
      expect(body.rules).toBeDefined();
    });
  });

  describe('POST /permissions/approve', () => {
    it('should approve a tool', async () => {
      const { status, body } = await fetchAPI('/permissions/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'test_tool' }),
      });
      expect(status).toBe(200);
      expect(body.approved).toBe('test_tool');
    });

    it('should return 400 when tool is missing', async () => {
      const { status, body } = await fetchAPI('/permissions/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(status).toBe(400);
    });
  });

  describe('POST /permissions/deny', () => {
    it('should deny a tool', async () => {
      const { status, body } = await fetchAPI('/permissions/deny', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'dangerous_tool' }),
      });
      expect(status).toBe(200);
      expect(body.denied).toBe('dangerous_tool');
    });
  });

  // === Actions ===

  describe('POST /dream', () => {
    it('should execute dream cycle', async () => {
      const { status, body } = await fetchAPI('/dream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(status).toBe(200);
      expect(body).toBeDefined();
    });
  });

  describe('POST /think', () => {
    it('should return 400 when topic is missing', async () => {
      const { status, body } = await fetchAPI('/think', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(status).toBe(400);
    });
  });

  describe('POST /delegate', () => {
    it('should return 400 when task is missing', async () => {
      const { status, body } = await fetchAPI('/delegate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(status).toBe(400);
    });
  });

  // === Metrics ===

  describe('GET /metrics', () => {
    it('should return metrics snapshot', async () => {
      const { status, body } = await fetchAPI('/metrics');
      expect(status).toBe(200);
      expect(body).toBeDefined();
    });
  });

  // === SSE Streaming ===

  describe('POST /chat/stream (SSE)', () => {
    it('should stream tokens via SSE', async () => {
      const res = await fetch(`${baseUrl}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Stream this' }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      const text = await res.text();
      expect(text).toContain('event: token');
      expect(text).toContain('event: done');
    });

    it('should return 400 when message is missing in stream', async () => {
      const res = await fetch(`${baseUrl}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /events (SSE consciousness stream)', () => {
    it('should connect to SSE event stream', async () => {
      const res = await fetch(`${baseUrl}/events`, {
        headers: { 'Accept': 'text/event-stream' },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      // Read initial data
      const reader = res.body?.getReader();
      expect(reader).toBeDefined();

      // Read a small chunk — should at least have the connected event
      const { value } = await reader!.read();
      const text = new TextDecoder().decode(value);
      expect(text).toContain('connected');

      reader!.cancel();
    });
  });

  // === 404 ===

  describe('unknown routes', () => {
    it('should return 404 for unknown paths', async () => {
      const { status, body } = await fetchAPI('/nonexistent/route');
      expect(status).toBe(404);
      expect(body.error).toContain('Not found');
    });
  });

  // === Auth ===

  describe('auth-protected API server', () => {
    let authAgent: KillerAgent;
    let authServer: APIServer;
    const authPort = TEST_PORT + 1;

    beforeAll(async () => {
      const config: AgentConfig = {
        llm: new MockLLMProvider('auth test response'),
        sensory: { enabledChannels: [], bufferSize: 100 },
        memory: { dreamingEnabled: false, forgettingEnabled: false },
        prefrontal: { maxPlanSteps: 3, maxConcurrentPlans: 2, riskTolerance: 0.5 },
        evolutionEnabled: false,
        debugLogging: false,
      };

      authAgent = new KillerAgent(config);
      await authAgent.boot();

      authServer = new APIServer(authPort, 'localhost', 'test-secret-token');
      registerRoutes(authServer, authAgent);
      await authServer.start();
    });

    afterAll(async () => {
      await authServer.stop();
      await authAgent.shutdown();
    });

    it('should allow /health without auth', async () => {
      const res = await fetch(`http://localhost:${authPort}/health`);
      expect(res.status).toBe(200);
    });

    it('should reject unauthenticated requests', async () => {
      const res = await fetch(`http://localhost:${authPort}/status`);
      expect(res.status).toBe(401);
    });

    it('should accept valid Bearer token', async () => {
      const res = await fetch(`http://localhost:${authPort}/status`, {
        headers: { Authorization: 'Bearer test-secret-token' },
      });
      expect(res.status).toBe(200);
    });

    it('should reject invalid Bearer token', async () => {
      const res = await fetch(`http://localhost:${authPort}/status`, {
        headers: { Authorization: 'Bearer wrong-token' },
      });
      expect(res.status).toBe(401);
    });
  });

  // === WebSocket Structured Commands ===

  describe('WebSocket structured commands', () => {
    const wsPort = TEST_PORT + 2;
    let wsAgent: KillerAgent;
    let wsServer: APIServer;

    beforeAll(async () => {
      const config: AgentConfig = {
        llm: new StreamingMockLLM(),
        sensory: { enabledChannels: [], bufferSize: 100 },
        memory: { dreamingEnabled: false, forgettingEnabled: false },
        prefrontal: { maxPlanSteps: 3, maxConcurrentPlans: 2, riskTolerance: 0.5 },
        evolutionEnabled: false,
        debugLogging: false,
      };

      wsAgent = new KillerAgent(config);
      await wsAgent.boot();

      wsServer = new APIServer(wsPort, 'localhost');
      registerRoutes(wsServer, wsAgent);
      await wsServer.start();
    });

    afterAll(async () => {
      await wsServer.stop();
      await wsAgent.shutdown();
    });

    function wsConnect(): Promise<WebSocket> {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${wsPort}`);
        ws.onopen = () => resolve(ws);
        ws.onerror = reject;
      });
    }

    function wsSendAndWait(ws: WebSocket, message: object): Promise<any> {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WS timeout')), 5000);
        ws.onmessage = (event) => {
          clearTimeout(timeout);
          resolve(JSON.parse(event.data as string));
        };
        ws.onerror = () => { clearTimeout(timeout); reject(new Error('WS error')); };
        ws.send(JSON.stringify(message));
      });
    }

    it('should execute status command via WS', async () => {
      const ws = await wsConnect();
      const response = await wsSendAndWait(ws, { type: 'command', command: 'status' });
      ws.close();

      expect(response.type).toBe('command:result');
      expect(response.command).toBe('status');
      expect(response.result.running).toBe(true);
    });

    it('should execute health command via WS', async () => {
      const ws = await wsConnect();
      const response = await wsSendAndWait(ws, { type: 'command', command: 'health' });
      ws.close();

      expect(response.type).toBe('command:result');
      expect(response.result).toBeDefined();
    });

    it('should execute goals command via WS', async () => {
      const ws = await wsConnect();
      const response = await wsSendAndWait(ws, { type: 'command', command: 'goals' });
      ws.close();

      expect(response.type).toBe('command:result');
      expect(response.result.goals).toBeDefined();
    });

    it('should execute memory command via WS', async () => {
      const ws = await wsConnect();
      const response = await wsSendAndWait(ws, { type: 'command', command: 'memory' });
      ws.close();

      expect(response.type).toBe('command:result');
      expect(response.result.totalEpisodes).toBeDefined();
    });

    it('should execute emotions command via WS', async () => {
      const ws = await wsConnect();
      const response = await wsSendAndWait(ws, { type: 'command', command: 'emotions' });
      ws.close();

      expect(response.type).toBe('command:result');
      expect(response.result).toBeDefined();
    });

    it('should execute skills command via WS', async () => {
      const ws = await wsConnect();
      const response = await wsSendAndWait(ws, { type: 'command', command: 'skills' });
      ws.close();

      expect(response.type).toBe('command:result');
      expect(Array.isArray(response.result.skills)).toBe(true);
    });

    it('should execute cells command via WS', async () => {
      const ws = await wsConnect();
      const response = await wsSendAndWait(ws, { type: 'command', command: 'cells' });
      ws.close();

      expect(response.type).toBe('command:result');
      expect(response.result.cells).toBeDefined();
    });

    it('should return error for unknown command', async () => {
      const ws = await wsConnect();
      const response = await wsSendAndWait(ws, { type: 'command', command: 'nonexistent' });
      ws.close();

      expect(response.type).toBe('command:error');
      expect(response.error).toContain('Unknown command');
    });

    it('should execute think command with topic arg', async () => {
      const ws = await wsConnect();
      const response = await wsSendAndWait(ws, {
        type: 'command',
        command: 'think',
        args: { topic: 'testing WebSocket integration' },
      });
      ws.close();

      expect(response.type).toBe('command:result');
      expect(response.result).toBeDefined();
    });

    it('should return error when think is missing topic', async () => {
      const ws = await wsConnect();
      const response = await wsSendAndWait(ws, { type: 'command', command: 'think' });
      ws.close();

      expect(response.type).toBe('command:error');
      expect(response.error).toContain('topic');
    });

    it('should still support chat messages via WS', async () => {
      const ws = await wsConnect();
      // Chat sends token events then done — wait for done
      const response = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WS timeout')), 5000);
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data as string);
          if (data.type === 'done' || data.type === 'error') {
            clearTimeout(timeout);
            resolve(data);
          }
        };
        ws.onerror = () => { clearTimeout(timeout); reject(new Error('WS error')); };
        ws.send(JSON.stringify({ type: 'chat', message: 'Hello WS' }));
      });
      ws.close();

      expect(response.type).toBe('done');
      expect(response.content).toBeTruthy();
    });

    it('should still support ping/pong via WS', async () => {
      const ws = await wsConnect();
      const response = await wsSendAndWait(ws, { type: 'ping' });
      ws.close();

      expect(response.type).toBe('pong');
      expect(response.timestamp).toBeGreaterThan(0);
    });
  });
});
