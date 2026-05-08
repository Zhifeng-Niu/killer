/**
 * API Routes - Agent HTTP/WebSocket API 路由
 *
 * 将 HTTP 请求连接到 KillerAgent 方法
 */

import type { APIServer, RouteHandler, WSConnection } from './types.js';
import type { KillerAgent } from '../orchestrator/agent.js';
import { MetricsCollector } from '../metrics/index.js';
import { ValidationError } from '@killer/core';

const ERROR = {
  MESSAGE_REQUIRED: 'message is required',
  ROLE_REQUIRED: 'role is required',
  DESCRIPTION_REQUIRED: 'description is required',
  TOPIC_REQUIRED: 'topic is required',
  TASK_REQUIRED: 'task is required',
  TOOL_REQUIRED: 'tool is required',
} as const;

/**
 * Helper: create a 400 validation error response
 */
function validationError(field: string, message: string): { status: 400; body: { error: string; field: string } } {
  return { status: 400, body: { error: message, field } };
}

/**
 * 读取请求体（供 streamRoute 使用）
 */
function readBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8');
      if (!body) { resolve(null); return; }
      try { resolve(JSON.parse(body)); } catch { resolve(body); }
    });
  });
}

/**
 * 注册所有 API 路由到服务器
 */
export function registerRoutes(server: APIServer, agent: KillerAgent): void {
  // === Health & Status ===

  server.route('GET', '/health', () => {
    const metrics = MetricsCollector.getInstance();
    const health = metrics.healthCheck();
    const llmDiagnostics = agent.getLLMDiagnostics();

    return {
      status: 200,
      body: {
        ...health,
        ...(llmDiagnostics ? { llmResilience: llmDiagnostics } : {}),
      },
    };
  });

  server.route('GET', '/status', () => {
    const baseStatus = agent.getStatus();
    const emotionalState = agent.persona.emotionalState.exportState();
    const narrative = agent.hippocampus.getNarrative();
    const predictions = agent.persona.predictiveModel.exportState();

    return {
      status: 200,
      body: {
        ...baseStatus,
        cognitive: {
          emotion: {
            primary: emotionalState.primaryEmotion,
            intensity: emotionalState.intensity,
            valence: emotionalState.current.valence,
          },
          narrative: {
            chaptersCount: narrative.chapters.length,
            activeThemes: narrative.activeThemes,
            identity: narrative.identityStatement,
          },
          predictions: {
            needsCount: predictions.predictedNeeds.length,
            topPatterns: predictions.communicationPatterns.slice(0, 3),
          },
        },
      },
    };
  });

  server.route('GET', '/metrics', () => {
    const metrics = MetricsCollector.getInstance();
    return {
      status: 200,
      body: metrics.snapshot(),
    };
  });

  // === Chat ===

  server.route('POST', '/chat', async (req) => {
    const { message } = req.body as { message?: string; stream?: boolean };

    if (!message || typeof message !== 'string') {
      return validationError('message', ERROR.MESSAGE_REQUIRED);
    }

    const result = await agent.processInput(message);
    return { status: 200, body: { response: result.content } };
  });

  // 流式 Chat（SSE）
  const activeSSEConnections = new Set<import('node:http').ServerResponse>();
  const MAX_SSE_CONNECTIONS = 50;

  server.streamRoute('POST', '/chat/stream', async (req, res) => {
    // 连接数限制
    if (activeSSEConnections.size >= MAX_SSE_CONNECTIONS) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many concurrent connections. Try again later.' }));
      return;
    }

    const body = await readBody(req);
    const { message } = body as { message?: string };

    if (!message || typeof message !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: ERROR.MESSAGE_REQUIRED }));
      return;
    }

    // 客户端断开追踪
    let clientDisconnected = false;
    const cleanup = () => {
      clientDisconnected = true;
      activeSSEConnections.delete(res);
    };
    res.on('close', cleanup);

    // SSE 响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    activeSSEConnections.add(res);

    try {
      await agent.processInput(message, 'api', (token) => {
        if (clientDisconnected) return; // 客户端已断开，停止发送
        res.write(`event: token\ndata: ${JSON.stringify({ token })}\n\n`);
      });
      if (!clientDisconnected) {
        res.write(`event: done\ndata: {"status":"complete"}\n\n`);
      }
    } catch (error) {
      if (!clientDisconnected) {
        const msg = error instanceof Error ? error.message : String(error);
        res.write(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`);
      }
    }

    activeSSEConnections.delete(res);
    res.end();
  });

  // === Cells ===

  server.route('GET', '/cells', () => ({
    status: 200,
    body: { cells: agent.getCells() },
  }));

  server.route('POST', '/cells', async (req) => {
    const { role } = req.body as { role?: string };
    if (!role || typeof role !== 'string') {
      return validationError('role', ERROR.ROLE_REQUIRED);
    }
    try {
      const cellId = await agent.spawnCellWithRole(role);
      return { status: 201, body: { cellId, role } };
    } catch (error) {
      return { status: 500, body: { error: 'Failed to spawn cell. Check agent status.' } };
    }
  });

  // === Goals ===

  server.route('GET', '/goals', () => ({
    status: 200,
    body: { goals: agent.getGoals() },
  }));

  server.route('POST', '/goals', (req) => {
    const { description, priority } = req.body as { description?: string; priority?: number };
    if (!description || typeof description !== 'string') {
      return validationError('description', ERROR.DESCRIPTION_REQUIRED);
    }
    if (priority !== undefined && typeof priority !== 'number') {
      return validationError('priority', 'priority must be a number');
    }
    const clampedPriority = priority !== undefined ? Math.max(0, Math.min(1, priority)) : 0.5;
    const goal = agent.createGoal(description, clampedPriority);
    if (!goal) {
      return { status: 500, body: { error: 'Failed to create goal' } };
    }
    return { status: 201, body: { goal } };
  });

  // === Health Report ===

  server.route('GET', '/health/report', () => {
    const report = agent.healthMonitor.check();
    return { status: 200, body: report };
  });

  // === Persona ===

  server.route('GET', '/persona', () => ({
    status: 200,
    body: agent.getPersona(),
  }));

  // === Emotions ===

  server.route('GET', '/emotions', () => ({
    status: 200,
    body: agent.persona.emotionalState.exportState(),
  }));

  // === Narrative ===

  server.route('GET', '/narrative', () => ({
    status: 200,
    body: agent.hippocampus.getNarrative(),
  }));

  // === Predictions ===

  server.route('GET', '/predictions', () => ({
    status: 200,
    body: agent.persona.predictiveModel.exportState(),
  }));

  // === Skills ===

  server.route('GET', '/skills', () => ({
    status: 200,
    body: { skills: agent.getSkills() },
  }));

  // === Memory ===

  server.route('GET', '/memory', () => ({
    status: 200,
    body: agent.getMemoryStats(),
  }));

  // === Dream ===

  server.route('POST', '/dream', async () => {
    try {
      const result = await agent.dream();
      return { status: 200, body: result };
    } catch {
      return { status: 500, body: { error: 'Dream cycle failed. Check agent memory state.' } };
    }
  });

  // === Think ===

  server.route('POST', '/think', async (req) => {
    const { topic } = req.body as { topic?: string };
    if (!topic || typeof topic !== 'string') {
      return validationError('topic', ERROR.TOPIC_REQUIRED);
    }
    try {
      const result = await agent.think(topic);
      return { status: 200, body: result };
    } catch {
      return { status: 500, body: { error: 'Think failed. Check LLM connectivity and agent state.' } };
    }
  });

  // === Evolve ===

  server.route('POST', '/evolve', async () => {
    try {
      const result = await agent.evolve();
      return { status: 200, body: result };
    } catch {
      return { status: 500, body: { error: 'Evolution failed. Check cortex and skill state.' } };
    }
  });

  // === Delegate ===

  server.route('POST', '/delegate', async (req) => {
    const { task } = req.body as { task?: string };
    if (!task || typeof task !== 'string') {
      return validationError('task', ERROR.TASK_REQUIRED);
    }
    try {
      const result = await agent.delegateTask(task);
      return { status: 200, body: result };
    } catch {
      return { status: 500, body: { error: 'Task delegation failed. Check cell availability.' } };
    }
  });

  // === Sessions ===

  server.route('GET', '/sessions', () => ({
    status: 200,
    body: { sessions: agent.listSessions() },
  }));

  server.route('POST', '/sessions/save', (req) => {
    const { name } = req.body as { name?: string };
    try {
      agent.saveSession(name);
      return { status: 200, body: { saved: true } };
    } catch (error) {
      return { status: 500, body: { error: 'Failed to save session.' } };
    }
  });

  server.route('POST', '/sessions/load', (req) => {
    const { name } = req.body as { name?: string };
    const loaded = agent.loadSession(name);
    return { status: 200, body: { loaded } };
  });

  // === Tool Permissions ===

  server.route('GET', '/permissions', () => ({
    status: 200,
    body: { rules: agent.toolPermissions.getRules() },
  }));

  server.route('POST', '/permissions/approve', (req) => {
    const { tool } = req.body as { tool?: string };
    if (!tool || typeof tool !== 'string') return validationError('tool', ERROR.TOOL_REQUIRED);
    agent.toolPermissions.approve(tool);
    return { status: 200, body: { approved: tool } };
  });

  server.route('POST', '/permissions/deny', (req) => {
    const { tool } = req.body as { tool?: string };
    if (!tool || typeof tool !== 'string') return validationError('tool', ERROR.TOOL_REQUIRED);
    agent.toolPermissions.deny(tool);
    return { status: 200, body: { denied: tool } };
  });

  server.route('POST', '/permissions/confirm', (req) => {
    const { tool } = req.body as { tool?: string };
    if (!tool || typeof tool !== 'string') return validationError('tool', ERROR.TOOL_REQUIRED);
    agent.toolPermissions.addRule({ tool, permission: 'confirm', reason: 'Set via API' });
    return { status: 200, body: { confirmed: tool } };
  });

  // === SSE: consciousness event stream ===

  server.registerSSEEndpoint('/events');

  // Bridge lifecycle hooks → SSE
  const hookEvents = [
    'cycle:start', 'cycle:end',
    'llm:call', 'llm:response',
    'tool:execute', 'tool:result',
    'memory:store',
    'cell:spawn',
    'goal:created',
    'delegate:start', 'delegate:complete',
    'plugin:loaded', 'plugin:unloaded',
    'input:received', 'input:processed',
    'error:pipeline',
  ] as const;

  for (const event of hookEvents) {
    agent.hooks.on(event, (payload: unknown) => {
      server.pushSSE(event, payload ?? {});
    });
  }

  // === WebSocket: streaming chat + structured commands ===

  server.onWSMessage((conn: WSConnection, message: string) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'chat' && data.message) {
        agent.processInput(data.message, 'api', (token) => {
          conn.send(JSON.stringify({ type: 'token', token }));
        }).then((result) => {
          conn.send(JSON.stringify({ type: 'done', content: result.content }));
        }).catch((error) => {
          const msg = error instanceof Error ? error.message : 'Processing failed';
          conn.send(JSON.stringify({ type: 'error', error: msg }));
        });
      } else if (data.type === 'command') {
        // Structured command execution via WebSocket
        handleWSCommand(conn, data, agent);
      } else if (data.type === 'ping') {
        conn.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
    } catch {
      conn.send(JSON.stringify({ type: 'error', error: 'Invalid JSON format' }));
    }
  });
}

/**
 * Handle structured WebSocket commands
 *
 * Enables programmatic agent control via WS for dashboard integrations.
 * Supported commands: status, goals, memory, persona, emotions, narrative,
 * predictions, skills, dream, think, evolve, cells, health
 */
function handleWSCommand(conn: WSConnection, data: { command: string; args?: Record<string, unknown> }, agent: KillerAgent): void {
  const { command, args = {} } = data;
  const reply = (result: unknown) => {
    conn.send(JSON.stringify({ type: 'command:result', command, result }));
  };
  const replyError = (error: string) => {
    conn.send(JSON.stringify({ type: 'command:error', command, error }));
  };

  switch (command) {
    case 'status':
      reply(agent.getStatus());
      break;
    case 'health':
      reply(agent.healthMonitor.check());
      break;
    case 'goals':
      reply({ goals: agent.getGoals() });
      break;
    case 'memory':
      reply(agent.getMemoryStats());
      break;
    case 'persona':
      reply(agent.getPersona());
      break;
    case 'emotions':
      reply(agent.persona.emotionalState.exportState());
      break;
    case 'narrative':
      reply(agent.hippocampus.getNarrative());
      break;
    case 'predictions':
      reply(agent.persona.predictiveModel.exportState());
      break;
    case 'skills':
      reply({ skills: agent.getSkills() });
      break;
    case 'cells':
      reply({ cells: agent.getCellStatus() });
      break;
    case 'metrics': {
      const metrics = MetricsCollector.getInstance();
      reply(metrics.snapshot());
      break;
    }
    case 'dream':
      agent.dream().then(reply).catch((e) => replyError(e instanceof Error ? e.message : 'Dream cycle failed'));
      break;
    case 'think':
      if (typeof args.topic === 'string') {
        agent.think(args.topic).then(reply).catch((e) => replyError(e instanceof Error ? e.message : 'Think failed'));
      } else {
        replyError('Missing required arg: topic');
      }
      break;
    case 'evolve':
      agent.evolve().then(reply).catch((e) => replyError(e instanceof Error ? e.message : 'Evolve failed'));
      break;
    default:
      replyError(`Unknown command: ${command}`);
  }
}
