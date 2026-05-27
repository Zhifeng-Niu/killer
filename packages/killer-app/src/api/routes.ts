/**
 * API Routes - Agent HTTP/WebSocket API 路由
 *
 * 将 HTTP 请求连接到 KillerAgent 方法
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { APIServer, RouteHandler, WSConnection } from './types.js';
import type { KillerAgent } from '../orchestrator/agent.js';
import { MetricsCollector } from '../metrics/index.js';
import { ValidationError, Cerebellum } from '@killer/core';

/** Lazy-initialized cerebellum instance shared across routes */
let sharedCerebellum: Cerebellum | null = null;

function getCerebellum(): Cerebellum {
  if (!sharedCerebellum) {
    sharedCerebellum = new Cerebellum();
  }
  return sharedCerebellum;
}

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

  // === Cerebellum: Mission Management ===

  server.route('POST', '/mission', (req) => {
    const body = req.body as {
      goal?: string;
      orientation?: 'engineer' | 'creative' | 'production';
      metrics?: unknown[];
      guard?: string;
      maxWaypoints?: number;
    };

    if (!body.goal || typeof body.goal !== 'string') {
      return validationError('goal', 'goal is required');
    }

    const cerebellum = getCerebellum();

    const mission = cerebellum.createMission({
      goal: body.goal,
      ...(body.orientation && { orientation: body.orientation }),
      ...(body.guard && { guard: body.guard }),
      ...(body.maxWaypoints && { maxWaypoints: body.maxWaypoints }),
    });

    cerebellum.activateMission(mission);
    server.pushSSE('mission:created', { mission });

    return { status: 201, body: { mission } };
  });

  server.route('GET', '/mission', () => {
    if (!sharedCerebellum) {
      return { status: 200, body: { active: false } };
    }
    const mission = sharedCerebellum.getActiveMission();
    if (!mission) {
      return { status: 200, body: { active: false } };
    }
    const history = sharedCerebellum.getHistory();
    const termination = sharedCerebellum.checkTermination();
    return {
      status: 200,
      body: {
        active: true,
        mission,
        history: {
          totalWaypoints: history.totalWaypoints,
          wins: history.wins.length,
          deadEnds: history.deadEnds.length,
          surprises: history.surprises.length,
          consecutiveDiscards: history.consecutiveDiscards,
          currentBest: history.currentBest,
        },
        terminated: termination.terminated,
        terminationReason: termination.reason,
      },
    };
  });

  server.route('GET', '/mission/history', () => {
    if (!sharedCerebellum) {
      return { status: 200, body: { experiments: [] } };
    }
    const history = sharedCerebellum.getHistory();
    return {
      status: 200,
      body: {
        wins: history.wins,
        deadEnds: history.deadEnds,
        surprises: history.surprises,
      },
    };
  });

  server.route('DELETE', '/mission', () => {
    if (!sharedCerebellum) {
      return { status: 200, body: { deactivated: false } };
    }
    sharedCerebellum.activateMission(null as unknown as Parameters<typeof sharedCerebellum.activateMission>[0]);
    sharedCerebellum = null;
    server.pushSSE('mission:stopped', {});
    return { status: 200, body: { deactivated: true } };
  });

  // === Cerebellum: Experiment Lifecycle ===

  server.route('POST', '/mission/experiment', (req) => {
    const cerebellum = getCerebellum();
    if (!cerebellum.hasActiveMission()) {
      return { status: 400, body: { error: 'No active mission' } };
    }
    const body = req.body as { hypothesis?: string };
    if (!body.hypothesis || typeof body.hypothesis !== 'string') {
      return { status: 400, body: { error: 'hypothesis is required' } };
    }
    return cerebellum.beginExperiment(body.hypothesis)
      .then(experiment => {
        server.pushSSE('experiment:begin', { experiment });
        return { status: 201, body: { experiment } };
      })
      .catch(err => ({ status: 500, body: { error: err instanceof Error ? err.message : String(err) } }));
  });

  server.route('GET', '/mission/experiment', () => {
    const cerebellum = getCerebellum();
    const experiment = cerebellum.getActiveExperiment();
    if (!experiment) {
      return { status: 200, body: { active: false } };
    }
    return { status: 200, body: { active: true, experiment } };
  });

  server.route('GET', '/mission/compass', () => {
    const cerebellum = getCerebellum();
    if (!cerebellum.hasActiveMission()) {
      return { status: 400, body: { error: 'No active mission' } };
    }
    const history = cerebellum.getHistory();
    const reading = cerebellum.readCompass(history);
    return { status: 200, body: { compass: reading } };
  });

  server.route('POST', '/mission/experiment/verify', async () => {
    const cerebellum = getCerebellum();
    const experiment = cerebellum.getActiveExperiment();
    if (!experiment) {
      return { status: 400, body: { error: 'No active experiment' } };
    }
    try {
      const verification = await cerebellum.verify(experiment);
      server.pushSSE('experiment:verified', { experimentId: experiment.id, verification });
      return { status: 200, body: { experimentId: experiment.id, verification } };
    } catch (err) {
      return { status: 500, body: { error: err instanceof Error ? err.message : String(err) } };
    }
  });

  server.route('POST', '/mission/experiment/decide', () => {
    const cerebellum = getCerebellum();
    const experiment = cerebellum.getActiveExperiment();
    if (!experiment) {
      return { status: 400, body: { error: 'No active experiment' } };
    }
    const history = cerebellum.getHistory();
    const compassReading = cerebellum.readCompassForHypothesis(history, experiment.hypothesis);
    return cerebellum.verify(experiment)
      .then(verification => {
        const decision = cerebellum.decide(experiment, verification, history);
        server.pushSSE('experiment:decided', { experimentId: experiment.id, decision, verification });
        return { status: 200, body: { decision, verification, compass: compassReading } };
      })
      .catch(err => ({ status: 500, body: { error: err instanceof Error ? err.message : String(err) } }));
  });

  server.route('POST', '/mission/experiment/record', (req) => {
    const cerebellum = getCerebellum();
    const experiment = cerebellum.getActiveExperiment();
    if (!experiment) {
      return { status: 400, body: { error: 'No active experiment' } };
    }
    const body = req.body as { decision?: string };
    if (!body.decision || !['keep', 'discard', 'surprise'].includes(body.decision)) {
      return { status: 400, body: { error: 'decision must be keep, discard, or surprise' } };
    }
    return cerebellum.verify(experiment)
      .then(verification => {
        cerebellum.recordOutcome(experiment, body.decision as 'keep' | 'discard' | 'surprise', verification);
        server.pushSSE('experiment:recorded', { experimentId: experiment.id, decision: body.decision });
        return { status: 200, body: { recorded: true, experimentId: experiment.id, decision: body.decision } };
      })
      .catch(err => ({ status: 500, body: { error: err instanceof Error ? err.message : String(err) } }));
  });

  // === Dashboard: static file serving ===

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const dashboardDir = path.resolve(__dirname, '../../dashboard');

  const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
  };

  server.streamRoute('GET', '/dashboard', async (_req, res) => {
    const filePath = path.join(dashboardDir, 'index.html');
    try {
      const content = await fs.promises.readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES['.html']! });
      res.end(content);
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Dashboard not found' }));
    }
  });

  server.streamRoute('GET', '/dashboard/:file', async (_req, res, params) => {
    const fileName = params['file'];
    if (!fileName || fileName.includes('..')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid file name' }));
      return;
    }
    const ext = path.extname(fileName).toLowerCase();
    const contentType = MIME_TYPES[ext];
    if (!contentType) {
      res.writeHead(415, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unsupported file type' }));
      return;
    }
    const filePath = path.join(dashboardDir, fileName);
    try {
      const content = await fs.promises.readFile(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'File not found' }));
    }
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
    case 'mission': {
      if (!sharedCerebellum) {
        reply({ active: false });
        break;
      }
      const m = sharedCerebellum.getActiveMission();
      if (!m) {
        reply({ active: false });
        break;
      }
      const h = sharedCerebellum.getHistory();
      reply({ active: true, mission: m, waypoints: h.totalWaypoints, wins: h.wins.length, deadEnds: h.deadEnds.length });
      break;
    }
    default:
      replyError(`Unknown command: ${command}`);
  }
}
