/**
 * Cerebellum API Integration Tests
 *
 * Tests the full Cerebellum mission lifecycle through the HTTP API layer.
 * Note: sharedCerebellum is a module-level singleton in routes.ts,
 * so tests must manage state cleanup explicitly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Cerebellum } from '@odysseus/core';
import { registerRoutes } from '../api/routes.js';
import type { APIServer, RouteHandler } from '../api/types.js';

/**
 * In-memory mock APIServer that captures routes
 */
class MockAPIServer {
  private routes: Map<string, RouteHandler> = new Map();
  private sseEvents: { event: string; data: unknown }[] = [];

  route(method: string, path: string, handler: RouteHandler): void {
    this.routes.set(`${method} ${path}`, handler);
  }

  streamRoute(): void {}
  onWSMessage(): void {}
  registerSSEEndpoint(): void {}

  pushSSE(event: string, data: unknown): void {
    this.sseEvents.push({ event, data });
  }

  async request(method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }> {
    const key = `${method} ${path}`;
    const handler = this.routes.get(key);
    if (!handler) return { status: 404, body: { error: 'Not found' } };

    return handler({
      method,
      path,
      params: {},
      body: body ?? null,
      headers: {},
    });
  }

  getSSEEvents(): { event: string; data: unknown }[] {
    return this.sseEvents;
  }

  clearSSEEvents(): void {
    this.sseEvents = [];
  }
}

function createMockAgent(): unknown {
  return {
    getStatus: () => ({ running: true, uptime: 0, modules: {} }),
    getLLMDiagnostics: () => null,
    getCells: () => [],
    getGoals: () => [],
    createGoal: () => ({ id: 'g1', description: 'test', priority: 0.5 }),
    getPersona: () => ({ name: 'Test', traits: [], bio: '' }),
    getMemoryStats: () => ({ totalEpisodes: 0, shortTermCount: 0, longTermCount: 0, associationCount: 0 }),
    getSkills: () => [],
    getPlugins: () => [],
    getColumnStatus: () => [],
    listSessions: () => [],
    saveSession: () => {},
    loadSession: () => true,
    getLastTopic: () => null,
    processInput: async () => ({ content: 'test' }),
    spawnCellWithRole: async () => 'cell-1',
    dream: async () => ({ episodesConsolidated: 0, newAssociations: 0 }),
    think: async () => ({ conclusion: 'test', confidence: 0.5, suggestedActions: [] }),
    evolve: async () => ({ mutations: 0, successful: 0, fitnessDelta: 0, newBehaviors: [] }),
    delegateTask: async () => ({ totalCellsUsed: 1, durationMs: 100 }),
    unloadPlugin: async () => true,
    tools: { list: () => [], execute: async () => ({ success: false, error: 'not implemented' }) },
    toolPermissions: {
      getRules: () => [],
      approve: () => {},
      deny: () => {},
      addRule: () => {},
    },
    hippocampus: {
      getNarrative: () => ({ chapters: [], activeThemes: [], identityStatement: '', relationships: [] }),
      getStats: () => ({ episodes: 0 }),
    },
    persona: {
      emotionalState: {
        exportState: () => ({
          primaryEmotion: 'neutral',
          intensity: 0.5,
          current: { valence: 0, arousal: 0, dominance: 0 },
          emotionalMemory: [],
        }),
      },
      predictiveModel: { exportState: () => ({ predictedNeeds: [], communicationPatterns: [] }) },
      getExpression: () => ({ avatar: '🤖' }),
      getUserModel: () => ({ interactionSummary: { totalInteractions: 0 } }),
      getPredictions: () => ({
        psychologicalProfile: { decisionStyle: 'balanced', openness: 0.5, conscientiousness: 0.5, informationPreference: 'mixed', riskTolerance: 0.5 },
        predictedNeeds: [],
        communicationPatterns: [],
      }),
      getLastSeenAt: () => null,
    },
    synapse: {
      getAllCells: () => [],
      getTopology: () => ({ edges: [] }),
    },
    healthMonitor: {
      check: () => ({ status: 'healthy' }),
      formatReport: () => 'OK',
    },
    contextWindow: {
      getConfig: () => ({ maxFullTurns: 10 }),
      getFacts: () => [],
      getSummary: () => '',
    },
    consciousness: { on: () => {} },
    hooks: { on: () => {} },
  };
}

describe('Cerebellum API Integration', () => {
  let server: MockAPIServer;

  beforeEach(() => {
    server = new MockAPIServer();
    const agent = createMockAgent() as import('../orchestrator/agent.js').OdysseusAgent;
    registerRoutes(server as unknown as APIServer, agent);
  });

  afterEach(async () => {
    // Clean up: deactivate any active mission to prevent state leakage
    await server.request('DELETE', '/mission');
    server.clearSSEEvents();
  });

  describe('Mission CRUD', () => {
    it('should create a mission via POST /mission', async () => {
      const res = await server.request('POST', '/mission', { goal: 'optimize API latency' });

      expect(res.status).toBe(201);
      const body = res.body as { mission: { id: string; goal: string; orientation: string } };
      expect(body.mission.goal).toBe('optimize API latency');
      expect(body.mission.orientation).toBe('engineer');
      expect(body.mission.id).toContain('mission_');
    });

    it('should create a mission with custom orientation', async () => {
      const res = await server.request('POST', '/mission', { goal: 'explore', orientation: 'creative' });

      expect(res.status).toBe(201);
      const body = res.body as { mission: { orientation: string } };
      expect(body.mission.orientation).toBe('creative');
    });

    it('should reject mission without goal', async () => {
      const res = await server.request('POST', '/mission', {});

      expect(res.status).toBe(400);
      const body = res.body as { error: string; field: string };
      expect(body.field).toBe('goal');
    });

    it('should return mission status via GET /mission', async () => {
      await server.request('POST', '/mission', { goal: 'test mission' });
      const res = await server.request('GET', '/mission');

      expect(res.status).toBe(200);
      const body = res.body as { active: boolean; mission: { goal: string } };
      expect(body.active).toBe(true);
      expect(body.mission.goal).toBe('test mission');
    });

    it('should return inactive when no mission', async () => {
      const res = await server.request('GET', '/mission');

      expect(res.status).toBe(200);
      const body = res.body as { active: boolean };
      expect(body.active).toBe(false);
    });

    it('should deactivate mission via DELETE /mission', async () => {
      await server.request('POST', '/mission', { goal: 'test' });
      const res = await server.request('DELETE', '/mission');

      expect(res.status).toBe(200);
      const body = res.body as { deactivated: boolean };
      expect(body.deactivated).toBe(true);
    });

    it('should emit SSE events on mission creation and deletion', async () => {
      await server.request('POST', '/mission', { goal: 'sse test' });
      await server.request('DELETE', '/mission');

      const events = server.getSSEEvents();
      const types = events.map(e => e.event);
      expect(types).toContain('mission:created');
      expect(types).toContain('mission:stopped');
    });
  });

  describe('Experiment Lifecycle', () => {
    it('should begin experiment via POST /mission/experiment', async () => {
      await server.request('POST', '/mission', { goal: 'experiment test' });
      const res = await server.request('POST', '/mission/experiment', { hypothesis: 'refactor API layer' });

      expect(res.status).toBe(201);
      const body = res.body as { experiment: { id: string; waypoint: number; hypothesis: string; status: string } };
      expect(body.experiment.hypothesis).toBe('refactor API layer');
      expect(body.experiment.waypoint).toBe(1);
      expect(body.experiment.status).toBe('running');
    });

    it('should reject experiment without hypothesis', async () => {
      await server.request('POST', '/mission', { goal: 'test' });
      const res = await server.request('POST', '/mission/experiment', {});

      expect(res.status).toBe(400);
    });

    it('should reject experiment without active mission', async () => {
      // No mission created — state is clean from afterEach
      const res = await server.request('POST', '/mission/experiment', { hypothesis: 'test' });

      expect(res.status).toBe(400);
    });

    it('should verify active experiment', async () => {
      await server.request('POST', '/mission', { goal: 'verify test' });
      await server.request('POST', '/mission/experiment', { hypothesis: 'verify me' });
      const res = await server.request('POST', '/mission/experiment/verify');

      expect(res.status).toBe(200);
      const body = res.body as { experimentId: string; verification: { overall: string } };
      expect(body.verification.overall).toBeDefined();
    });

    it('should decide on active experiment', async () => {
      await server.request('POST', '/mission', { goal: 'decide test' });
      await server.request('POST', '/mission/experiment', { hypothesis: 'decide me' });
      const res = await server.request('POST', '/mission/experiment/decide');

      expect(res.status).toBe(200);
      const body = res.body as { decision: string; compass: { orientation: string } };
      expect(['keep', 'discard', 'surprise']).toContain(body.decision);
      expect(body.compass).toBeDefined();
    });

    it('should record outcome', async () => {
      await server.request('POST', '/mission', { goal: 'record test' });
      await server.request('POST', '/mission/experiment', { hypothesis: 'record me' });
      const res = await server.request('POST', '/mission/experiment/record', { decision: 'keep' });

      expect(res.status).toBe(200);
      const body = res.body as { recorded: boolean; decision: string };
      expect(body.recorded).toBe(true);
      expect(body.decision).toBe('keep');
    });

    it('should reject invalid decision', async () => {
      await server.request('POST', '/mission', { goal: 'test' });
      await server.request('POST', '/mission/experiment', { hypothesis: 'test' });
      const res = await server.request('POST', '/mission/experiment/record', { decision: 'invalid' });

      expect(res.status).toBe(400);
    });

    it('should reject verify without active experiment', async () => {
      await server.request('POST', '/mission', { goal: 'no exp test' });
      // No experiment begun
      const res = await server.request('POST', '/mission/experiment/verify');

      expect(res.status).toBe(400);
      const body = res.body as { error: string };
      expect(body.error).toContain('No active experiment');
    });

    it('should emit SSE events through experiment lifecycle', async () => {
      await server.request('POST', '/mission', { goal: 'sse experiment test' });
      await server.request('POST', '/mission/experiment', { hypothesis: 'lifecycle test' });
      await server.request('POST', '/mission/experiment/verify');
      await server.request('POST', '/mission/experiment/decide');
      await server.request('POST', '/mission/experiment/record', { decision: 'keep' });

      const events = server.getSSEEvents();
      const types = events.map(e => e.event);
      expect(types).toContain('experiment:begin');
      expect(types).toContain('experiment:verified');
      expect(types).toContain('experiment:decided');
      expect(types).toContain('experiment:recorded');
    });
  });

  describe('Compass Reading', () => {
    it('should return compass reading via GET /mission/compass', async () => {
      await server.request('POST', '/mission', { goal: 'compass test' });
      const res = await server.request('GET', '/mission/compass');

      expect(res.status).toBe(200);
      const body = res.body as {
        compass: {
          orientation: string;
          divergence: number;
          stuckLevel: number;
          noveltyScore: number;
          recommendedStrategy: { pattern: string };
        },
      };
      expect(body.compass.orientation).toBe('engineer');
      expect(body.compass.recommendedStrategy).toBeDefined();
    });

    it('should reject compass without active mission', async () => {
      // State is clean from afterEach — no active mission
      const res = await server.request('GET', '/mission/compass');

      expect(res.status).toBe(400);
    });
  });

  describe('Full Experiment Cycle', () => {
    it('should complete create → experiment → decide → record cycle', async () => {
      // 1. Create mission
      const createRes = await server.request('POST', '/mission', { goal: 'full cycle test' });
      expect(createRes.status).toBe(201);

      // 2. Begin experiment
      const expRes = await server.request('POST', '/mission/experiment', { hypothesis: 'refactor for speed' });
      expect(expRes.status).toBe(201);

      // 3. Decide
      const decideRes = await server.request('POST', '/mission/experiment/decide');
      expect(decideRes.status).toBe(200);
      const decideBody = decideRes.body as { decision: string };
      expect(['keep', 'discard', 'surprise']).toContain(decideBody.decision);

      // 4. Record
      const recordRes = await server.request('POST', '/mission/experiment/record', { decision: decideBody.decision });
      expect(recordRes.status).toBe(200);
      const recordBody = recordRes.body as { recorded: boolean };
      expect(recordBody.recorded).toBe(true);

      // 5. Check mission status
      const statusRes = await server.request('GET', '/mission');
      const statusBody = statusRes.body as { active: boolean };
      expect(statusBody.active).toBe(true);
    });
  });
});

describe('Cerebellum getActiveExperiment', () => {
  it('should return null when no experiment is active', () => {
    const cerebellum = new Cerebellum();
    expect(cerebellum.getActiveExperiment()).toBeNull();
  });

  it('should return the active experiment after beginExperiment', async () => {
    const cerebellum = new Cerebellum();
    const mission = cerebellum.createMission({ goal: 'test active exp' });
    cerebellum.activateMission(mission);

    const experiment = await cerebellum.beginExperiment('test hypothesis');
    const active = cerebellum.getActiveExperiment();
    expect(active).not.toBeNull();
    expect(active!.id).toBe(experiment.id);
    expect(active!.hypothesis).toBe('test hypothesis');
  });

  it('should return null after recordOutcome', async () => {
    const cerebellum = new Cerebellum();
    const mission = cerebellum.createMission({ goal: 'test clear' });
    cerebellum.activateMission(mission);

    const experiment = await cerebellum.beginExperiment('test');
    cerebellum.recordOutcome(experiment, 'keep', {
      syntax: { passed: true, duration: 0 },
      guard: { passed: true, duration: 0 },
      metric: { passed: true, duration: 0, values: {}, improved: {} },
      quality: { passed: true, duration: 0, warnings: [] },
      overall: 'pass',
      totalDuration: 0,
    });

    expect(cerebellum.getActiveExperiment()).toBeNull();
  });
});
