/**
 * CommandHandler 测试
 *
 * 测试 /plan, /goals, /persona 等命令的处理
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandHandler } from '../orchestrator/commands.js';
import type { PersonaEngine } from '../persona/engine.js';
import { SkillManager } from '../skills/manager.js';
import type { Goal } from '@odysseus/core';
import type { AgentStatus } from '../orchestrator/types.js';
import type { SensoryInput } from '../sensory/types.js';
import { PersonaEngine as PersonaEngineImpl, type PersonaEngineConfig, type PersonaDNAConfig } from '../persona/engine.js';

function createMockDeps() {
  const results: string[] = [];
  const errors: string[] = [];
  const actions: string[] = [];

  return {
    sensoryRouter: {
      routeOutput: vi.fn(async (msg: unknown) => {}),
    },
    outputManager: {
      sendResult: vi.fn((content: string) => results.push(content)),
      sendError: vi.fn((content: string) => errors.push(content)),
      sendAction: vi.fn((content: string) => actions.push(content)),
      formatDreamResult: vi.fn((result: unknown) => ({ id: 'msg_1', timestamp: Date.now(), channel: 'cli', type: 'dream', content: 'Dream result' })),
    },
    getStatus: vi.fn((): AgentStatus => ({
      running: true,
      uptime: 5000,
      startedAt: Date.now() - 5000,
      modules: {
        brainstem: { phase: 'perceive', loopCount: 10 },
        hippocampus: { episodes: 5, semanticNodes: 3 },
        prefrontal: { activePlans: 2, completedGoals: 1 },
        cortex: { skills: 4, mutations: 2 },
        synapse: { cells: 3, cellTypes: ['prime', 'researcher'] },
        sensory: { channels: ['cli'], connected: true },
      },
    })),
    getColumnStatus: vi.fn(() => [
      { id: 'cell_1', type: 'prime', status: 'active', task: 'main' },
      { id: 'cell_2', type: 'researcher', status: 'idle', task: '' },
    ]),
    triggerDreamCycle: vi.fn(async () => ({
      episodesReplayed: 3,
      patternsExtracted: 2,
      memoriesDecayed: 0,
      memoriesConsolidated: 4,
      insights: ['pattern-a'],
    })),
    spawnCell: vi.fn((type: string, task: string) => ({ id: `cell_${type}` })),
    createGoal: vi.fn(async (description: string, priority: number): Promise<Goal> => ({
      id: `goal_${Date.now()}`,
      description,
      priority,
      status: 'pending',
      createdAt: Date.now(),
    })),
    listGoals: vi.fn((): Goal[] => [
      { id: 'goal_1', description: 'Build API', priority: 0.7, status: 'in_progress', createdAt: Date.now() },
      { id: 'goal_2', description: 'Write tests', priority: 0.5, status: 'pending', createdAt: Date.now() },
    ]),
    getPlanStats: vi.fn(() => ({ activePlans: 2, completedGoals: 1 })),
    // 创建真实的 PersonaEngine
    getPersonaEngine: vi.fn((): PersonaEngine => {
      const dnaConfig: PersonaDNAConfig = {
        name: 'TestKiller',
        avatar: '🧠',
        tagline: 'Test Agent',
        voiceStyle: 'technical',
        quirks: ['curious'],
      };
      const engine = new PersonaEngineImpl({
        dnaConfig,
        enableMirrorNeuron: true,
        enableUserModeling: true,
        mirrorNeuronDecay: 0.1,
      });
      engine.recordInteraction(300, 0.8, ['coding']);
      engine.observeUserBehavior('uses-cli', []);
      return engine;
    }),
    getSkillManager: vi.fn((): SkillManager => {
      const mgr = new SkillManager();
      mgr.generate({
        targetDomain: 'coding',
        strategy: 'from_scratch',
        constraints: [{ type: 'max_tokens', value: 2000 }],
      });
      return mgr;
    }),
    _results: results,
    _errors: errors,
    _actions: actions,
  };
}

function makeInput(command: string, args?: string[]): SensoryInput {
  return {
    id: `input_${Date.now()}`,
    timestamp: Date.now(),
    channel: 'cli' as const,
    content: `/${command} ${args?.join(' ') ?? ''}`,
    metadata: { command, args },
    priority: 'normal' as const,
  };
}

describe('CommandHandler', () => {
  let handler: CommandHandler;
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    deps = createMockDeps();
    handler = new CommandHandler(deps);
  });

  describe('/status', () => {
    it('should display agent status', () => {
      const result = handler.handleCommand(makeInput('status'));
      expect(result).toBe(true);
      expect(deps.outputManager.sendResult).toHaveBeenCalled();
      const output = deps._results[0];
      expect(output).toContain('Running: true');
      expect(output).toContain('Brainstem: perceive');
      expect(output).toContain('Hippocampus');
    });
  });

  describe('/cells', () => {
    it('should display cell list', () => {
      const result = handler.handleCommand(makeInput('cells'));
      expect(result).toBe(true);
      const output = deps._results[0];
      expect(output).toContain('cell_1');
      expect(output).toContain('prime');
    });
  });

  describe('/plan', () => {
    it('should create a plan with description', async () => {
      const result = handler.handleCommand(makeInput('plan', ['Build a REST API', '0.8']));
      expect(result).toBe(true);
      // handlePlanCommand is async, wait for it to complete
      await new Promise(r => setTimeout(r, 10));
      expect(deps.createGoal).toHaveBeenCalledWith('Build a REST API', 0.8);
    });

    it('should default priority to 0.5', () => {
      handler.handleCommand(makeInput('plan', ['Simple task']));
      expect(deps.createGoal).toHaveBeenCalledWith('Simple task', 0.5);
    });

    it('should show usage when no args', () => {
      handler.handleCommand(makeInput('plan'));
      expect(deps.outputManager.sendError).toHaveBeenCalled();
    });

    it('should reject invalid priority', () => {
      handler.handleCommand(makeInput('plan', ['test', '2.0']));
      expect(deps.outputManager.sendError).toHaveBeenCalled();
      const errorOutput = deps._errors[0];
      expect(errorOutput).toContain('between 0 and 1');
    });
  });

  describe('/goals', () => {
    it('should list active goals', () => {
      handler.handleCommand(makeInput('goals'));
      const output = deps._results[0];
      expect(output).toContain('Active Goals');
      expect(output).toContain('Build API');
      expect(output).toContain('Write tests');
    });

    it('should show stats line', () => {
      handler.handleCommand(makeInput('goals'));
      const output = deps._results[0];
      expect(output).toContain('Active plans: 2');
      expect(output).toContain('Completed: 1');
    });
  });

  describe('/plans', () => {
    it('should alias to /goals', () => {
      handler.handleCommand(makeInput('plans'));
      expect(deps.listGoals).toHaveBeenCalled();
      const output = deps._results[0];
      expect(output).toContain('Active Goals');
    });
  });

  describe('/persona', () => {
    it('should display persona info', () => {
      handler.handleCommand(makeInput('persona'));
      const output = deps._results[0];
      expect(output).toContain('Persona Status');
      expect(output).toContain('TestKiller');
      expect(output).toContain('technical');
    });

    it('should show mirror neuron data', () => {
      handler.handleCommand(makeInput('persona'));
      const output = deps._results[0];
      expect(output).toContain('Mirror Neuron');
      expect(output).toContain('Sync Level');
      expect(output).toContain('Observed Patterns: 1');
    });

    it('should show user model data', () => {
      handler.handleCommand(makeInput('persona'));
      const output = deps._results[0];
      expect(output).toContain('User Model');
      expect(output).toContain('Trust Level');
      expect(output).toContain('Satisfaction');
    });
  });

  describe('/dream', () => {
    it('should trigger dream cycle', async () => {
      handler.handleCommand(makeInput('dream'));
      expect(deps.outputManager.sendAction).toHaveBeenCalledWith('Starting dream cycle...');
      // Wait for async
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(deps.triggerDreamCycle).toHaveBeenCalled();
    });
  });

  describe('/spawn', () => {
    it('should spawn a new cell', () => {
      handler.handleCommand(makeInput('spawn', ['researcher']));
      expect(deps.spawnCell).toHaveBeenCalledWith('researcher', 'Manual spawn via CLI');
      const output = deps._results[0];
      expect(output).toContain('Spawned');
    });

    it('should show usage when no args', () => {
      handler.handleCommand(makeInput('spawn'));
      expect(deps.outputManager.sendError).toHaveBeenCalled();
    });
  });

  describe('/skills', () => {
    it('should display skill ecosystem', () => {
      handler.handleCommand(makeInput('skills'));
      const output = deps._results[0];
      expect(output).toContain('Skill Ecosystem');
      expect(output).toContain('Total: 1');
      expect(output).toContain('coding');
    });
  });

  describe('unknown commands', () => {
    it('should return false for unknown commands', () => {
      const result = handler.handleCommand(makeInput('unknown'));
      expect(result).toBe(false);
    });

    it('should return false when no command metadata', () => {
      const input: SensoryInput = {
        id: 'test',
        timestamp: Date.now(),
        channel: 'cli',
        content: 'hello world',
        priority: 'normal',
      };
      const result = handler.handleCommand(input);
      expect(result).toBe(false);
    });
  });

  describe('extended commands', () => {
    function createExtendedDeps() {
      const base = createMockDeps();
      return {
        ...base,
        getMemoryStats: vi.fn(() => ({ totalEpisodes: 10, shortTermCount: 5, longTermCount: 5, associationCount: 3 })),
        triggerThink: vi.fn(async () => ({ conclusion: 'Test conclusion', confidence: 0.85, suggestedActions: [{ type: 'research', payload: { topic: 'test' } }] })),
        triggerEvolve: vi.fn(async () => ({ mutations: 3, successful: 2, fitnessDelta: 0.1, newBehaviors: ['adaptive-response'] })),
        delegateTask: vi.fn(async () => ({ totalCellsUsed: 2, durationMs: 150 })),
        saveSessionAction: vi.fn(),
        loadSessionAction: vi.fn(() => true),
        listSessionsAction: vi.fn(() => [{ name: 'test-session', turns: 5, savedAt: Date.now() }]),
        getPlugins: vi.fn(() => [{ name: 'test-plugin', version: '1.0.0', description: 'Test', source: 'local' }]),
        unloadPluginAction: vi.fn(async () => true),
        getPermissionRules: vi.fn(() => [{ tool: 'memory_store', permission: 'auto', reason: 'trusted' }]),
        approveToolAction: vi.fn(),
        denyToolAction: vi.fn(),
        confirmToolAction: vi.fn(),
        getHealthReport: vi.fn(() => ({ status: 'healthy', uptime: 120, llm: { calls: 10, errors: 0, errorRate: 0, avgLatency: 0.5 }, tools: { calls: 5, avgLatency: 0.2 } })),
        getMetricsSnapshot: vi.fn(() => ({ metrics: [{ name: 'llm_calls', type: 'counter', stats: { avg: 10 } }] })),
        getNarrative: vi.fn(() => ({ identityStatement: 'I am Killer', activeThemes: ['learning', 'coding'], chapters: [{ startTime: Date.now(), title: 'Chapter 1', summary: 'Beginning', emotionalTone: 'curious' }], relationships: [{ userId: 'user1', summary: 'Developer', trustLevel: 0.8 }] })),
        getPredictions: vi.fn(() => ({ psychologicalProfile: { decisionStyle: 'analytical', openness: 0.7, conscientiousness: 0.8, informationPreference: 'detailed', riskTolerance: 0.4 }, predictedNeeds: [{ description: 'API help', confidence: 0.75, timeHorizon: 'next-session' }], communicationPatterns: [{ name: 'code-heavy', frequency: 5 }] })),
        getEmotionalState: vi.fn(() => ({ primaryEmotion: 'curious', intensity: 0.6, current: { valence: 0.3, arousal: 0.5, dominance: 0.4 }, emotionalMemory: [{ emotion: 'happy', intensity: 0.7 }] })),
        getSynapseInfo: vi.fn(() => ({ cells: [{ id: 'cell_1', type: 'researcher', status: 'alive' }], edges: [['cell_1', 'cell_2'] as [string, string]] })),
        initConfigDir: vi.fn(() => '/tmp/.odysseus'),
        shutdown: vi.fn(async () => {}),
      };
    }

    let extHandler: CommandHandler;
    let extDeps: ReturnType<typeof createExtendedDeps>;

    beforeEach(() => {
      extDeps = createExtendedDeps();
      extHandler = new CommandHandler(extDeps);
    });

    describe('/help', () => {
      it('should list all available commands', () => {
        extHandler.handleCommand(makeInput('help'));
        const output = extDeps._results[0];
        expect(output).toContain('/status');
        expect(output).toContain('/dream');
        expect(output).toContain('/think');
        expect(output).toContain('/emotions');
        expect(output).toContain('/narrative');
      });
    });

    describe('/memory', () => {
      it('should display memory statistics', () => {
        extHandler.handleCommand(makeInput('memory'));
        expect(extDeps.getMemoryStats).toHaveBeenCalled();
        const output = extDeps._results[0];
        expect(output).toContain('Total episodes: 10');
        expect(output).toContain('Short-term: 5');
      });
    });

    describe('/think', () => {
      it('should trigger deep thinking', async () => {
        extHandler.handleCommand(makeInput('think', ['what is consciousness?']));
        await new Promise(r => setTimeout(r, 50));
        expect(extDeps.triggerThink).toHaveBeenCalledWith('what is consciousness?');
      });

      it('should require a topic', () => {
        extHandler.handleCommand(makeInput('think'));
        expect(extDeps._errors.length).toBeGreaterThan(0);
      });
    });

    describe('/evolve', () => {
      it('should trigger evolution', async () => {
        extHandler.handleCommand(makeInput('evolve'));
        await new Promise(r => setTimeout(r, 50));
        expect(extDeps.triggerEvolve).toHaveBeenCalled();
      });
    });

    describe('/delegate', () => {
      it('should delegate a task', async () => {
        extHandler.handleCommand(makeInput('delegate', ['research', 'AI']));
        await new Promise(r => setTimeout(r, 50));
        expect(extDeps.delegateTask).toHaveBeenCalledWith('research AI');
      });

      it('should require a task', () => {
        extHandler.handleCommand(makeInput('delegate'));
        expect(extDeps._errors.length).toBeGreaterThan(0);
      });
    });

    describe('/save', () => {
      it('should save a session', () => {
        extHandler.handleCommand(makeInput('save', ['my-session']));
        expect(extDeps.saveSessionAction).toHaveBeenCalledWith('my-session');
        const output = extDeps._results[0];
        expect(output).toContain('saved');
      });

      it('should default to "default" name', () => {
        extHandler.handleCommand(makeInput('save'));
        expect(extDeps.saveSessionAction).toHaveBeenCalledWith('default');
      });
    });

    describe('/load', () => {
      it('should load a session', () => {
        extHandler.handleCommand(makeInput('load', ['my-session']));
        expect(extDeps.loadSessionAction).toHaveBeenCalledWith('my-session');
        const output = extDeps._results[0];
        expect(output).toContain('restored');
      });
    });

    describe('/sessions', () => {
      it('should list sessions', () => {
        extHandler.handleCommand(makeInput('sessions'));
        const output = extDeps._results[0];
        expect(output).toContain('test-session');
      });
    });

    describe('/emotions', () => {
      it('should display emotional state', () => {
        extHandler.handleCommand(makeInput('emotions'));
        expect(extDeps.getEmotionalState).toHaveBeenCalled();
        const output = extDeps._results[0];
        expect(output).toContain('curious');
        expect(output).toContain('Valence');
      });
    });

    describe('/narrative', () => {
      it('should display life narrative', () => {
        extHandler.handleCommand(makeInput('narrative'));
        expect(extDeps.getNarrative).toHaveBeenCalled();
        const output = extDeps._results[0];
        expect(output).toContain('I am Killer');
        expect(output).toContain('Chapter 1');
      });
    });

    describe('/predictions', () => {
      it('should display predictive user model', () => {
        extHandler.handleCommand(makeInput('predictions'));
        expect(extDeps.getPredictions).toHaveBeenCalled();
        const output = extDeps._results[0];
        expect(output).toContain('analytical');
        expect(output).toContain('API help');
      });
    });

    describe('/health', () => {
      it('should display health report', () => {
        extHandler.handleCommand(makeInput('health'));
        expect(extDeps.getHealthReport).toHaveBeenCalled();
        const output = extDeps._results[0];
        expect(output).toContain('healthy');
      });
    });

    describe('/diagnostics', () => {
      it('should display comprehensive diagnostics', () => {
        extHandler.handleCommand(makeInput('diagnostics'));
        const output = extDeps._results[0];
        expect(output).toContain('System Diagnostics');
        expect(output).toContain('Brainstem');
        expect(output).toContain('Hippocampus');
      });
    });

    describe('/permissions', () => {
      it('should display permission rules', () => {
        extHandler.handleCommand(makeInput('permissions'));
        const output = extDeps._results[0];
        expect(output).toContain('memory_store');
      });
    });

    describe('/approve', () => {
      it('should approve a tool', () => {
        extHandler.handleCommand(makeInput('approve', ['memory_store']));
        expect(extDeps.approveToolAction).toHaveBeenCalledWith('memory_store');
      });

      it('should require a tool name', () => {
        extHandler.handleCommand(makeInput('approve'));
        expect(extDeps._errors.length).toBeGreaterThan(0);
      });
    });

    describe('/deny', () => {
      it('should deny a tool', () => {
        extHandler.handleCommand(makeInput('deny', ['trigger_dream']));
        expect(extDeps.denyToolAction).toHaveBeenCalledWith('trigger_dream');
      });
    });

    describe('/confirm', () => {
      it('should confirm a tool', () => {
        extHandler.handleCommand(makeInput('confirm', ['shell_exec']));
        expect(extDeps.confirmToolAction).toHaveBeenCalledWith('shell_exec');
      });
    });

    describe('/plugins', () => {
      it('should display plugins', () => {
        extHandler.handleCommand(makeInput('plugins'));
        const output = extDeps._results[0];
        expect(output).toContain('test-plugin');
      });
    });

    describe('/broadcast', () => {
      it('should display cell network', () => {
        extHandler.handleCommand(makeInput('broadcast'));
        const output = extDeps._results[0];
        expect(output).toContain('cell_1');
        expect(output).toContain('researcher');
      });
    });

    describe('/report', () => {
      it('should generate comprehensive report', () => {
        extHandler.handleCommand(makeInput('report'));
        const output = extDeps._results[0];
        expect(output).toContain('Agent Report');
        expect(output).toContain('curious');
      });
    });

    describe('/init', () => {
      it('should initialize config dir', () => {
        extHandler.handleCommand(makeInput('init'));
        const output = extDeps._results[0];
        expect(output).toContain('/tmp/.odysseus');
      });
    });

    describe('/stop and /exit', () => {
      it('should handle /stop command', () => {
        extHandler.handleCommand(makeInput('stop'));
        const output = extDeps._results[0];
        expect(output).toContain('Stopping');
      });

      it('should handle /exit command', () => {
        extHandler.handleCommand(makeInput('exit'));
        const output = extDeps._results[0];
        expect(output).toContain('Stopping');
      });
    });
  });
});
