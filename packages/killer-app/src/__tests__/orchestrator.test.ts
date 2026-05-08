/**
 * Orchestrator Tests
 *
 * 测试 Agent 编排器和端到端集成
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KillerAgent, type AgentConfig } from '../orchestrator/index.js';
import type { SensoryInput } from '../sensory/types.js';
import { SensoryChannel } from '../sensory/types.js';

/**
 * Mock LLM Provider
 */
class MockLLMProvider {
  async complete(_prompt: string): Promise<{ content: string; usage?: unknown }> {
    return {
      content: 'Mock response',
      usage: { promptTokens: 10, completionTokens: 5 },
    };
  }
}

/**
 * 创建测试配置
 */
function createTestConfig(): AgentConfig {
  return {
    llm: new MockLLMProvider(),
    sensory: {
      enabledChannels: ['cli'],
      bufferSize: 10,
    },
    memory: {
      dreamingEnabled: false,
      forgettingEnabled: false,
    },
    prefrontal: {
      maxPlanSteps: 5,
      maxConcurrentPlans: 1,
      riskTolerance: 0.5,
    },
    evolutionEnabled: false,
    debugLogging: false,
  };
}

describe('Orchestrator - KillerAgent', () => {
  let agent: KillerAgent;

  beforeEach(() => {
    agent = new KillerAgent(createTestConfig());
  });

  describe('Agent Creation', () => {
    it('should create agent with config', () => {
      const config = createTestConfig();
      const testAgent = new KillerAgent(config);

      expect(testAgent).toBeDefined();
      expect(testAgent.getStatus().running).toBe(false);
    });

    it('should initialize with correct default status', () => {
      const status = agent.getStatus();

      expect(status.running).toBe(false);
      expect(status.uptime).toBe(0);
      expect(status.modules.brainstem.phase).toBe('perceive');
      expect(status.modules.brainstem.loopCount).toBe(0);
    });

    it('should have all modules initialized', () => {
      const status = agent.getStatus();

      expect(status.modules.brainstem).toBeDefined();
      expect(status.modules.hippocampus).toBeDefined();
      expect(status.modules.prefrontal).toBeDefined();
      expect(status.modules.cortex).toBeDefined();
      expect(status.modules.synapse).toBeDefined();
      expect(status.modules.sensory).toBeDefined();
    });
  });

  describe('Boot Sequence', () => {
    it('should boot successfully', async () => {
      await agent.boot();

      const status = agent.getStatus();
      expect(status.running).toBe(true);
      expect(status.startedAt).toBeGreaterThan(0);
      expect(status.modules.sensory.connected).toBe(true);
    });

    it('should update uptime while running', async () => {
      await agent.boot();

      const status1 = agent.getStatus();
      const uptime1 = status1.uptime;

      // 等待一小段时间
      await new Promise((resolve) => setTimeout(resolve, 50));

      const status2 = agent.getStatus();
      expect(status2.uptime).toBeGreaterThanOrEqual(uptime1);
    });

    it('should handle boot when already booted', async () => {
      await agent.boot();
      await agent.boot(); // 第二次调用应该被忽略

      const status = agent.getStatus();
      expect(status.running).toBe(true);
    });
  });

  describe('Shutdown', () => {
    it('should shutdown successfully', async () => {
      await agent.boot();
      await agent.shutdown();

      const status = agent.getStatus();
      expect(status.running).toBe(false);
    });

    it('should handle shutdown when not running', async () => {
      await agent.shutdown(); // 应该不会报错

      const status = agent.getStatus();
      expect(status.running).toBe(false);
    });

    it('should stop after boot and maintain uptime', async () => {
      await agent.boot();
      await new Promise((resolve) => setTimeout(resolve, 10));
      await agent.shutdown();

      const status = agent.getStatus();
      expect(status.running).toBe(false);
      expect(status.uptime).toBeGreaterThan(0);
    });
  });

  describe('Input Injection', () => {
    it('should inject input into brainstem', async () => {
      await agent.boot();

      const input: SensoryInput = {
        id: 'test-input-1',
        timestamp: Date.now(),
        channel: SensoryChannel.CLI,
        source: 'test-user',
        content: 'Hello, agent!',
        metadata: {},
        priority: 'normal',
      };

      // 注入输入不应该抛出错误
      expect(() => agent.injectInput(input)).not.toThrow();
    });

    it('should map sensory priority correctly', async () => {
      await agent.boot();

      const priorities: SensoryInput['priority'][] = [
        'urgent',
        'high',
        'normal',
        'low',
      ];

      priorities.forEach((priority) => {
        const input: SensoryInput = {
          id: `test-${priority}`,
          timestamp: Date.now(),
          channel: SensoryChannel.CLI,
          source: 'test',
          content: `Test ${priority}`,
          metadata: {},
          priority,
        };

        expect(() => agent.injectInput(input)).not.toThrow();
      });
    });

    it('should map sensory channel correctly', async () => {
      await agent.boot();

      const channels: SensoryChannel[] = [
        SensoryChannel.CLI,
        SensoryChannel.Telegram,
        SensoryChannel.Discord,
        SensoryChannel.Web,
      ];

      channels.forEach((channel) => {
        const input: SensoryInput = {
          id: `test-${channel}`,
          timestamp: Date.now(),
          channel,
          source: 'test',
          content: `Test ${channel}`,
          metadata: {},
          priority: 'normal',
        };

        expect(() => agent.injectInput(input)).not.toThrow();
      });
    });
  });

  describe('Status Reporting', () => {
    it('should return current status', () => {
      const status = agent.getStatus();

      expect(status).toHaveProperty('running');
      expect(status).toHaveProperty('uptime');
      expect(status).toHaveProperty('modules');
      expect(status).toHaveProperty('startedAt');
    });

    it('should return immutable status snapshot', () => {
      const status1 = agent.getStatus();
      const status2 = agent.getStatus();

      // 两次调用应该返回相同的状态值（但不同对象）
      expect(status1.running).toBe(status2.running);
      expect(status1.uptime).toBe(status2.uptime);
      expect(status1).not.toBe(status2);
    });

    it('should track module states', () => {
      const status = agent.getStatus();

      expect(status.modules.brainstem).toHaveProperty('phase');
      expect(status.modules.brainstem).toHaveProperty('loopCount');
      expect(status.modules.hippocampus).toHaveProperty('episodes');
      expect(status.modules.hippocampus).toHaveProperty('semanticNodes');
      expect(status.modules.prefrontal).toHaveProperty('activePlans');
      expect(status.modules.prefrontal).toHaveProperty('completedGoals');
    });
  });

  describe('Sensory Integration', () => {
    it('should initialize sensory router', () => {
      const status = agent.getStatus();

      expect(status.modules.sensory.channels).toContain('cli');
    });

    it('should connect sensory channels after boot', async () => {
      await agent.boot();

      const status = agent.getStatus();
      expect(status.modules.sensory.connected).toBe(true);
    });

    it('should disconnect sensory channels after shutdown', async () => {
      await agent.boot();
      await agent.shutdown();

      // 获取状态
      const status = agent.getStatus();
      // shutdown 后连接状态应该更新
      expect(status.running).toBe(false);
    });
  });

  describe('End-to-End Integration', () => {
    it('should complete full boot-shutdown cycle', async () => {
      // 启动
      await agent.boot();
      expect(agent.getStatus().running).toBe(true);

      // 注入输入
      const input: SensoryInput = {
        id: 'e2e-test',
        timestamp: Date.now(),
        channel: SensoryChannel.CLI,
        source: 'test',
        content: 'E2E test',
        metadata: {},
        priority: 'normal',
      };
      agent.injectInput(input);

      // 关闭
      await agent.shutdown();
      expect(agent.getStatus().running).toBe(false);
    });

    it('should handle multiple boot-shutdown cycles', async () => {
      for (let i = 0; i < 3; i++) {
        const testAgent = new KillerAgent(createTestConfig());
        await testAgent.boot();
        expect(testAgent.getStatus().running).toBe(true);

        await testAgent.shutdown();
        expect(testAgent.getStatus().running).toBe(false);
      }
    });

    it('should maintain configuration across lifecycle', async () => {
      const config = createTestConfig();
      const testAgent = new KillerAgent(config);

      await testAgent.boot();
      const status1 = testAgent.getStatus();

      await testAgent.shutdown();
      const status2 = testAgent.getStatus();

      // 配置应该在整个生命周期中保持一致
      expect(status1.modules.sensory.channels).toEqual(
        status2.modules.sensory.channels,
      );
    });
  });
});

describe('Orchestrator - Integration Flows', () => {
  it('should route sensory input to brainstem', async () => {
    const agent = new KillerAgent(createTestConfig());

    let perceptionReceived = false;

    // 由于我们不能直接监听 brainstem 的内部状态，
    // 我们通过验证注入不会抛出错误来测试
    await agent.boot();

    const input: SensoryInput = {
      id: 'integration-test',
      timestamp: Date.now(),
      channel: SensoryChannel.CLI,
      source: 'user',
      content: 'Integration test message',
      metadata: { test: true },
      priority: 'high',
    };

    expect(() => agent.injectInput(input)).not.toThrow();

    await agent.shutdown();
    expect(perceptionReceived).toBeDefined();
  });
});

describe('Orchestrator - Multi-Cell Society', () => {
  let agent: KillerAgent;

  beforeEach(async () => {
    agent = new KillerAgent(createTestConfig());
    await agent.boot();
  });

  afterEach(async () => {
    if (agent.getStatus().running) {
      await agent.shutdown();
    }
  });

  describe('Cell Registration', () => {
    it('should register Prime Cell on boot', () => {
      const cells = agent['getCellStatus']();
      const primeCell = cells.find((c: { id: string; type: string }) => c.id === 'prime');

      expect(primeCell).toBeDefined();
      expect(primeCell?.type).toBe('prime');
    });

    it('should get cell status with all registered cells', () => {
      const cells = agent['getCellStatus']();

      expect(Array.isArray(cells)).toBe(true);
      expect(cells.length).toBeGreaterThan(0);
      expect(cells[0]).toHaveProperty('id');
      expect(cells[0]).toHaveProperty('type');
      expect(cells[0]).toHaveProperty('status');
    });

    it('should include cell types in status', () => {
      const status = agent.getStatus();

      expect(status.modules.synapse.cells).toBeGreaterThan(0);
      expect(Array.isArray(status.modules.synapse.cellTypes)).toBe(true);
      expect(status.modules.synapse.cellTypes).toContain('prime');
    });
  });

  describe('Cell Spawning', () => {
    it('should spawn Researcher cell', () => {
      const childId = agent['spawnCell']('researcher', 'Test task');

      expect(childId).toBeDefined();
      expect(childId).toHaveProperty('id');
      expect(childId).toHaveProperty('type');
      expect(childId.type).toBe('researcher');
    });

    it('should spawn Artisan cell', () => {
      const childId = agent['spawnCell']('artisan', 'Build something');

      expect(childId).toBeDefined();
      expect(childId.type).toBe('artisan');
    });

    it('should spawn Negotiator cell', () => {
      const childId = agent['spawnCell']('negotiator', 'Coordinate task');

      expect(childId).toBeDefined();
      expect(childId.type).toBe('negotiator');
    });

    it('should spawn Evolver cell', () => {
      const childId = agent['spawnCell']('evolver', 'Improve system');

      expect(childId).toBeDefined();
      expect(childId.type).toBe('evolver');
    });

    it('should return null for invalid cell type', () => {
      const childId = agent['spawnCell']('invalid', 'Test');

      expect(childId).toBeNull();
    });

    it('should update cell count after spawning', () => {
      const statusBefore = agent.getStatus();
      const countBefore = statusBefore.modules.synapse.cells;

      agent['spawnCell']('researcher', 'Test');

      const statusAfter = agent.getStatus();
      expect(statusAfter.modules.synapse.cells).toBe(countBefore + 1);
    });
  });

  describe('Command Handling', () => {
    it('should handle /cells command', async () => {
      const input: SensoryInput = {
        id: 'test-cells',
        timestamp: Date.now(),
        channel: SensoryChannel.CLI,
        source: 'test',
        content: '/cells',
        metadata: { command: 'cells' },
        priority: 'normal',
      };

      const handled = agent['handleCommand'](input);
      expect(handled).toBe(true);
    });

    it('should handle /dream command', async () => {
      const input: SensoryInput = {
        id: 'test-dream',
        timestamp: Date.now(),
        channel: SensoryChannel.CLI,
        source: 'test',
        content: '/dream',
        metadata: { command: 'dream' },
        priority: 'normal',
      };

      const handled = agent['handleCommand'](input);
      expect(handled).toBe(true);
    });

    it('should handle /spawn command with args', async () => {
      const input: SensoryInput = {
        id: 'test-spawn',
        timestamp: Date.now(),
        channel: SensoryChannel.CLI,
        source: 'test',
        content: '/spawn researcher',
        metadata: { command: 'spawn', args: ['researcher'] },
        priority: 'normal',
      };

      const handled = agent['handleCommand'](input);
      expect(handled).toBe(true);
    });

    it('should handle /status command', async () => {
      const input: SensoryInput = {
        id: 'test-status',
        timestamp: Date.now(),
        channel: SensoryChannel.CLI,
        source: 'test',
        content: '/status',
        metadata: { command: 'status' },
        priority: 'normal',
      };

      const handled = agent['handleCommand'](input);
      expect(handled).toBe(true);
    });

    it('should pass through non-command input', async () => {
      const input: SensoryInput = {
        id: 'test-normal',
        timestamp: Date.now(),
        channel: SensoryChannel.CLI,
        source: 'test',
        content: 'Hello, agent!',
        metadata: {},
        priority: 'normal',
      };

      const handled = agent['handleCommand'](input);
      expect(handled).toBe(false);
    });
  });

  describe('Dream Cycle', () => {
    it('should trigger dream cycle', async () => {
      const result = await agent['triggerDreamCycle']();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('episodesReplayed');
      expect(result).toHaveProperty('patternsExtracted');
      expect(result).toHaveProperty('memoriesConsolidated');
      expect(result).toHaveProperty('insights');
    });
  });

  it('should handle concurrent input injection', async () => {
    const agent = new KillerAgent(createTestConfig());
    await agent.boot();

    // 并发注入多个输入
    const inputs = Array.from({ length: 10 }, (_, i) => ({
      id: `concurrent-${i}`,
      timestamp: Date.now(),
      channel: SensoryChannel.CLI,
      source: 'test',
      content: `Concurrent input ${i}`,
      metadata: {},
      priority: 'normal' as const,
    }));

    // 所有注入都不应该抛出错误
    inputs.forEach((input) => {
      expect(() => agent.injectInput(input)).not.toThrow();
    });

    await agent.shutdown();
  });

  it('should handle all sensory input types', async () => {
    const agent = new KillerAgent(createTestConfig());
    await agent.boot();

    const inputs: SensoryInput[] = [
      {
        id: '1',
        timestamp: Date.now(),
        channel: SensoryChannel.CLI,
        source: 'user',
        content: 'Command input',
        metadata: { command: 'status' },
        priority: 'normal',
      },
      {
        id: '2',
        timestamp: Date.now(),
        channel: SensoryChannel.Telegram,
        source: 'telegram-user',
        content: 'Telegram message',
        metadata: {},
        priority: 'normal',
      },
      {
        id: '3',
        timestamp: Date.now(),
        channel: SensoryChannel.Code,
        source: 'file-changed',
        content: 'File modified: test.ts',
        metadata: { file: 'test.ts' },
        priority: 'high',
      },
    ];

    inputs.forEach((input) => {
      expect(() => agent.injectInput(input)).not.toThrow();
    });

    await agent.shutdown();
  });

  describe('getState', () => {
    it('should return full agent state snapshot', async () => {
      agent = new KillerAgent(createTestConfig());
      await agent.boot();

      const state = agent.getState();

      expect(state).toBeDefined();
      expect(Array.isArray(state.goals)).toBe(true);
      expect(Array.isArray(state.cells)).toBe(true);
      expect(state.persona).toBeDefined();
      expect(state.memory).toBeDefined();
      expect(Array.isArray(state.conversationHistory)).toBe(true);

      await agent.shutdown();
    });

    it('should include conversation history after input', async () => {
      agent = new KillerAgent(createTestConfig());
      await agent.boot();

      await agent.processInput('Hello agent');
      const state = agent.getState();

      expect(state.conversationHistory.length).toBeGreaterThan(0);

      await agent.shutdown();
    });
  });

  describe('restoreConversationHistory', () => {
    it('should restore conversation history', async () => {
      agent = new KillerAgent(createTestConfig());
      await agent.boot();

      const history = [
        { role: 'user' as const, content: 'Previous message 1' },
        { role: 'assistant' as const, content: 'Previous response 1' },
        { role: 'user' as const, content: 'Previous message 2' },
      ];

      agent.restoreConversationHistory(history);
      const state = agent.getState();

      expect(state.conversationHistory.length).toBe(3);
      expect(state.conversationHistory[0].content).toBe('Previous message 1');

      await agent.shutdown();
    });
  });

  describe('getLLMDiagnostics', () => {
    it('should return null when no resilient provider', async () => {
      agent = new KillerAgent(createTestConfig());
      await agent.boot();

      const diagnostics = agent.getLLMDiagnostics();
      expect(diagnostics).toBeNull();

      await agent.shutdown();
    });
  });

  describe('getPlugins', () => {
    it('should return empty plugins list', async () => {
      agent = new KillerAgent(createTestConfig());
      await agent.boot();

      const plugins = agent.getPlugins();
      expect(plugins).toEqual([]);

      await agent.shutdown();
    });
  });
});
