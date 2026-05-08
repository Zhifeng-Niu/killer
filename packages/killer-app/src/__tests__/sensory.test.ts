/**
 * Sensory Module Tests
 *
 * 测试感官层：渠道、路由器、CLI 渠道、输出管理器
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import {
  BaseSensoryChannel,
  type ISensoryChannel,
} from '../sensory/channel.js';
import { SensoryRouter } from '../sensory/router.js';
import { CLIChannel } from '../sensory/cli/cli-channel.js';
import { OutputManager } from '../sensory/output.js';
import {
  SensoryChannel,
  type SensoryInput,
  type ChannelMessage,
  type MessageType,
} from '../sensory/types.js';

describe('Sensory - BaseSensoryChannel', () => {
  class TestChannel extends BaseSensoryChannel {
    constructor() {
      super(SensoryChannel.CLI);
    }

    async start(): Promise<void> {
      this.updateStatus({ connected: true });
    }

    async stop(): Promise<void> {
      this.updateStatus({ connected: false });
    }

    async send(message: ChannelMessage): Promise<void> {
      this.lastSentMessage = message;
    }
  }

  it('should initialize with correct channel type', () => {
    const channel = new TestChannel();
    expect(channel.getChannelType()).toBe(SensoryChannel.CLI);
  });

  it('should track status correctly', () => {
    const channel = new TestChannel();
    const status = channel.getStatus();

    expect(status.channel).toBe(SensoryChannel.CLI);
    expect(status.connected).toBe(false);
    expect(status.errorCount).toBe(0);
  });

  it('should manage input subscribers', () => {
    const channel = new TestChannel();
    const mockCallback = vi.fn();

    channel.onInput(mockCallback);
    expect(channel['inputSubscribers'].has(mockCallback)).toBe(true);

    channel.offInput(mockCallback);
    expect(channel['inputSubscribers'].has(mockCallback)).toBe(false);
  });

  it('should notify subscribers of input', () => {
    const channel = new TestChannel();
    const mockCallback = vi.fn();

    channel.onInput(mockCallback);
    const testInput = channel['createInput']('test', 'hello', 'normal');
    channel['notifyInput'](testInput);

    expect(mockCallback).toHaveBeenCalledWith(testInput);
  });

  it('should record activity', () => {
    const channel = new TestChannel();
    channel['recordActivity']();

    expect(channel.getStatus().lastActivity).toBeGreaterThan(0);
  });

  it('should record errors', () => {
    const channel = new TestChannel();
    channel['recordError']();

    expect(channel.getStatus().errorCount).toBe(1);
  });
});

describe('Sensory - SensoryRouter', () => {
  let router: SensoryRouter;
  let mockChannel: ISensoryChannel;

  const mockStatus = {
    channel: SensoryChannel.CLI,
    connected: true,
    lastActivity: Date.now(),
    errorCount: 0,
  };

  beforeEach(() => {
    router = new SensoryRouter();

    mockChannel = {
      getChannelType: vi.fn().mockReturnValue(SensoryChannel.CLI),
      getStatus: vi.fn().mockReturnValue(mockStatus),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
      onInput: vi.fn(),
      offInput: vi.fn(),
    };
  });

  it('should register channels', () => {
    router.register(mockChannel);
    expect(router.getChannels()).toHaveLength(1);
  });

  it('should start all channels', async () => {
    router.register(mockChannel);
    await router.startAll();

    expect(mockChannel.start).toHaveBeenCalled();
  });

  it('should stop all channels', async () => {
    router.register(mockChannel);
    await router.stopAll();

    expect(mockChannel.stop).toHaveBeenCalled();
  });

  it('should queue inputs by priority', () => {
    router.register(mockChannel);

    // Simulate input callback being called
    const onInputCallback = mockChannel.onInput as unknown as (
      callback: (input: SensoryInput) => void,
    ) => void;
    onInputCallback((input) => {
      router['enqueueInput'](input);
    });

    const lowPriorityInput: SensoryInput = {
      id: '1',
      timestamp: Date.now(),
      channel: SensoryChannel.CLI,
      source: 'test',
      content: 'low',
      metadata: {},
      priority: 'low',
    };

    const urgentInput: SensoryInput = {
      id: '2',
      timestamp: Date.now(),
      channel: SensoryChannel.CLI,
      source: 'test',
      content: 'urgent',
      metadata: {},
      priority: 'urgent',
    };

    router['enqueueInput'](lowPriorityInput);
    router['enqueueInput'](urgentInput);

    expect(router.next()).toBe(urgentInput);
    expect(router.next()).toBe(lowPriorityInput);
  });

  it('should route output to correct channel', async () => {
    router.register(mockChannel);

    const message: ChannelMessage = {
      id: 'msg1',
      timestamp: Date.now(),
      channel: SensoryChannel.CLI,
      type: 'text',
      content: 'test',
    };

    await router.routeOutput(message);

    expect(mockChannel.send).toHaveBeenCalledWith(message);
  });

  it('should return null when queue is empty', () => {
    expect(router.next()).toBeNull();
  });

  it('should report queue size', () => {
    const testInput: SensoryInput = {
      id: '1',
      timestamp: Date.now(),
      channel: SensoryChannel.CLI,
      source: 'test',
      content: 'test',
      metadata: {},
      priority: 'normal',
    };

    router['enqueueInput'](testInput);
    expect(router.getQueueSize()).toBe(1);
  });

  it('should clear queue', () => {
    const testInput: SensoryInput = {
      id: '1',
      timestamp: Date.now(),
      channel: SensoryChannel.CLI,
      source: 'test',
      content: 'test',
      metadata: {},
      priority: 'normal',
    };

    router['enqueueInput'](testInput);
    router.clearQueue();

    expect(router.getQueueSize()).toBe(0);
  });

  it('should get channel status', () => {
    router.register(mockChannel);
    const status = router.getChannelStatus(SensoryChannel.CLI);

    expect(status).toEqual(mockStatus);
    expect(mockChannel.getStatus).toHaveBeenCalled();
  });

  it('should manage input subscriptions', () => {
    const mockCallback = vi.fn();
    router.onInput(mockCallback);

    expect(router['inputCallbacks'].has(mockCallback)).toBe(true);

    router.offInput(mockCallback);
    expect(router['inputCallbacks'].has(mockCallback)).toBe(false);
  });
});

describe('Sensory - CLIChannel', () => {
  it('should format thinking messages correctly', () => {
    const channel = new CLIChannel();
    const message: ChannelMessage = {
      id: '1',
      timestamp: Date.now(),
      channel: SensoryChannel.CLI,
      type: 'thinking',
      content: 'Processing...',
    };

    const formatted = channel['formatMessage'](message);
    expect(formatted).toContain('💭');
    expect(formatted).toContain('Processing...');
  });

  it('should format action messages correctly', () => {
    const channel = new CLIChannel();
    const message: ChannelMessage = {
      id: '1',
      timestamp: Date.now(),
      channel: SensoryChannel.CLI,
      type: 'action',
      content: 'Executing tool',
    };

    const formatted = channel['formatMessage'](message);
    expect(formatted).toContain('⚡');
    expect(formatted).toContain('Executing tool');
  });

  it('should format result messages correctly', () => {
    const channel = new CLIChannel();
    const message: ChannelMessage = {
      id: '1',
      timestamp: Date.now(),
      channel: SensoryChannel.CLI,
      type: 'result',
      content: 'Success!',
    };

    const formatted = channel['formatMessage'](message);
    expect(formatted).toContain('✓');
    expect(formatted).toContain('Success!');
  });

  it('should format error messages correctly', () => {
    const channel = new CLIChannel();
    const message: ChannelMessage = {
      id: '1',
      timestamp: Date.now(),
      channel: SensoryChannel.CLI,
      type: 'error',
      content: 'Failed!',
    };

    const formatted = channel['formatMessage'](message);
    expect(formatted).toContain('✗');
    expect(formatted).toContain('Failed!');
  });

  it('should format dream messages correctly', () => {
    const channel = new CLIChannel();
    const message: ChannelMessage = {
      id: '1',
      timestamp: Date.now(),
      channel: SensoryChannel.CLI,
      type: 'dream',
      content: 'Dreaming...',
    };

    const formatted = channel['formatMessage'](message);
    expect(formatted).toContain('🌙');
    expect(formatted).toContain('Dreaming...');
  });

  it('should format evolution messages correctly', () => {
    const channel = new CLIChannel();
    const message: ChannelMessage = {
      id: '1',
      timestamp: Date.now(),
      channel: SensoryChannel.CLI,
      type: 'evolution',
      content: 'Evolving...',
    };

    const formatted = channel['formatMessage'](message);
    expect(formatted).toContain('🧬');
    expect(formatted).toContain('Evolving...');
  });

  it('should start without creating readline', async () => {
    const channel = new CLIChannel();
    await channel.start();
    // No readline instance — just marks as connected
    const status = channel.getStatus();
    expect(status.connected).toBe(true);
  });

  it('should stop cleanly', async () => {
    const channel = new CLIChannel();
    await channel.start();
    await channel.stop();
    const status = channel.getStatus();
    expect(status.connected).toBe(false);
  });
});

describe('Sensory - OutputManager', () => {
  let router: SensoryRouter;
  let outputManager: OutputManager;
  let mockChannel: ISensoryChannel;

  const mockStatus = {
    channel: SensoryChannel.CLI,
    connected: true,
    lastActivity: Date.now(),
    errorCount: 0,
  };

  beforeEach(() => {
    router = new SensoryRouter();
    outputManager = new OutputManager(router);

    mockChannel = {
      getChannelType: vi.fn().mockReturnValue(SensoryChannel.CLI),
      getStatus: vi.fn().mockReturnValue(mockStatus),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
      onInput: vi.fn(),
      offInput: vi.fn(),
    };

    router.register(mockChannel);
  });

  it('should format message correctly', () => {
    const message = outputManager.formatMessage('text', 'Hello');

    expect(message.type).toBe('text');
    expect(message.content).toBe('Hello');
    expect(message.channel).toBe(SensoryChannel.CLI);
    expect(message.id).toBeDefined();
    expect(message.timestamp).toBeDefined();
  });

  it('should format all message types', () => {
    const types: MessageType[] = [
      'text',
      'thinking',
      'action',
      'result',
      'error',
      'dream',
      'evolution',
    ];

    types.forEach((type) => {
      const message = outputManager.formatMessage(type, `Test ${type}`);
      expect(message.type).toBe(type);
      expect(message.content).toBe(`Test ${type}`);
    });
  });

  it('should send result message', async () => {
    await outputManager.sendResult('Operation successful');

    expect(mockChannel.send).toHaveBeenCalled();
    const sentMessage = mockChannel.send.mock.calls[0][0] as ChannelMessage;
    expect(sentMessage.type).toBe('result');
    expect(sentMessage.content).toBe('Operation successful');
  });

  it('should send error message', async () => {
    await outputManager.sendError('Operation failed');

    expect(mockChannel.send).toHaveBeenCalled();
    const sentMessage = mockChannel.send.mock.calls[0][0] as ChannelMessage;
    expect(sentMessage.type).toBe('error');
    expect(sentMessage.content).toBe('Operation failed');
  });

  it('should send action message', async () => {
    await outputManager.sendAction('Executing tool');

    expect(mockChannel.send).toHaveBeenCalled();
    const sentMessage = mockChannel.send.mock.calls[0][0] as ChannelMessage;
    expect(sentMessage.type).toBe('action');
    expect(sentMessage.content).toBe('Executing tool');
  });

  it('should send dream message', async () => {
    await outputManager.sendDream('Dreaming...');

    expect(mockChannel.send).toHaveBeenCalled();
    const sentMessage = mockChannel.send.mock.calls[0][0] as ChannelMessage;
    expect(sentMessage.type).toBe('dream');
    expect(sentMessage.content).toBe('Dreaming...');
  });

  it('should send evolution message', async () => {
    await outputManager.sendEvolution('Evolving...');

    expect(mockChannel.send).toHaveBeenCalled();
    const sentMessage = mockChannel.send.mock.calls[0][0] as ChannelMessage;
    expect(sentMessage.type).toBe('evolution');
    expect(sentMessage.content).toBe('Evolving...');
  });

  it('should handle action result with success status', async () => {
    const action = { type: 'test_action', status: 'completed' };
    const result = 'Success output';

    await outputManager.handleActionResult(action, result);

    expect(mockChannel.send).toHaveBeenCalled();
    const sentMessage = mockChannel.send.mock.calls[0][0] as ChannelMessage;
    expect(sentMessage.type).toBe('result');
    expect(sentMessage.content).toContain('[test_action:completed]');
    expect(sentMessage.content).toContain('Success output');
  });

  it('should handle action result with error status', async () => {
    const action = { type: 'test_action', status: 'failed' };
    const result = 'Error output';

    await outputManager.handleActionResult(action, result);

    expect(mockChannel.send).toHaveBeenCalled();
    const sentMessage = mockChannel.send.mock.calls[0][0] as ChannelMessage;
    expect(sentMessage.type).toBe('error');
    expect(sentMessage.content).toContain('[test_action:failed]');
  });

  it('should broadcast thinking to all channels', async () => {
    const mockChannel2: ISensoryChannel = {
      getChannelType: vi.fn().mockReturnValue(SensoryChannel.Telegram),
      getStatus: vi.fn().mockReturnValue({
        channel: SensoryChannel.Telegram,
        connected: true,
        lastActivity: Date.now(),
        errorCount: 0,
      }),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
      onInput: vi.fn(),
      offInput: vi.fn(),
    };

    router.register(mockChannel2);
    await outputManager.broadcastThinking('Thinking...');

    expect(mockChannel.send).toHaveBeenCalled();
    expect(mockChannel2.send).toHaveBeenCalled();

    const msg1 = mockChannel.send.mock.calls[0][0] as ChannelMessage;
    const msg2 = mockChannel2.send.mock.calls[0][0] as ChannelMessage;
    expect(msg1.type).toBe('thinking');
    expect(msg2.type).toBe('thinking');
  });

  it('should format action result with object result', async () => {
    const action = { type: 'test_action', status: 'completed' };
    const result = { key: 'value', nested: { data: 123 } };

    await outputManager.handleActionResult(action, result);

    expect(mockChannel.send).toHaveBeenCalled();
    const sentMessage = mockChannel.send.mock.calls[0][0] as ChannelMessage;
    expect(sentMessage.content).toContain('key');
    expect(sentMessage.content).toContain('value');
  });

  it('should format dream result correctly', () => {
    const dreamResult = {
      episodesReplayed: 5,
      patternsExtracted: 3,
      memoriesDecayed: 0,
      memoriesConsolidated: 10,
      insights: ['insight1', 'insight2'],
    };

    const message = outputManager.formatDreamResult(dreamResult);

    expect(message.type).toBe('dream');
    expect(message.content).toContain('🌙 Dream cycle completed');
    expect(message.content).toContain('📖 Episodes replayed: 5');
    expect(message.content).toContain('🔍 Patterns extracted: 3');
    expect(message.content).toContain('💡 Insights: insight1, insight2');
    expect(message.content).toContain('🧠 Memories consolidated: 10');
  });

  it('should format dream result with no insights', () => {
    const dreamResult = {
      episodesReplayed: 0,
      patternsExtracted: 0,
      memoriesDecayed: 0,
      memoriesConsolidated: 0,
      insights: [],
    };

    const message = outputManager.formatDreamResult(dreamResult);

    expect(message.type).toBe('dream');
    expect(message.content).toContain('Insights: None');
  });
});

describe('Sensory - Integration Tests', () => {
  it('should complete full input-queue-output flow', async () => {
    const router = new SensoryRouter();
    const outputManager = new OutputManager(router);

    const receivedInputs: SensoryInput[] = [];

    // Subscribe to router inputs
    router.onInput((input) => {
      receivedInputs.push(input);
    });

    // Create and register a test channel
    class TestChannel extends BaseSensoryChannel {
      constructor() {
        super(SensoryChannel.CLI);
      }

      async start(): Promise<void> {
        this.updateStatus({ connected: true });
      }

      async stop(): Promise<void> {
        this.updateStatus({ connected: false });
      }

      async send(message: ChannelMessage): Promise<void> {
        this.lastSentMessage = message;
      }

      simulateInput(content: string): void {
        const input = this.createInput('test', content, 'normal');
        this.notifyInput(input);
      }
    }

    const channel = new TestChannel();
    router.register(channel);

    // Simulate input
    channel.simulateInput('Hello, world!');

    // Verify input was queued
    expect(receivedInputs).toHaveLength(1);
    expect(receivedInputs[0]!.content).toBe('Hello, world!');

    // Get input from queue
    const nextInput = router.next();
    expect(nextInput).not.toBeNull();
    expect(nextInput!.content).toBe('Hello, world!');

    // Send output
    await outputManager.sendResult('Done!');
  });

  it('should prioritize urgent inputs over normal inputs', async () => {
    const router = new SensoryRouter();

    class TestChannel extends BaseSensoryChannel {
      constructor() {
        super(SensoryChannel.CLI);
      }

      async start(): Promise<void> {}
      async stop(): Promise<void> {}
      async send(message: ChannelMessage): Promise<void> {}

      addInput(priority: SensoryInput['priority']): void {
        const input = this.createInput('test', `test ${priority}`, priority);
        this.notifyInput(input);
      }
    }

    const channel = new TestChannel();
    router.register(channel);

    // Add inputs in reverse priority order
    channel.addInput('low');
    channel.addInput('normal');
    channel.addInput('high');
    channel.addInput('urgent');

    // Verify order is urgent > high > normal > low
    expect(router.next()!.priority).toBe('urgent');
    expect(router.next()!.priority).toBe('high');
    expect(router.next()!.priority).toBe('normal');
    expect(router.next()!.priority).toBe('low');
    expect(router.next()).toBeNull();
  });

  it('should handle multiple channels independently', async () => {
    const router = new SensoryRouter();

    class TestChannel extends BaseSensoryChannel {
      constructor(type: SensoryChannel) {
        super(type);
      }

      async start(): Promise<void> {}
      async stop(): Promise<void> {}
      async send(message: ChannelMessage): Promise<void> {
        this.lastSentMessage = message;
      }
    }

    const cliChannel = new TestChannel(SensoryChannel.CLI);
    const telegramChannel = new TestChannel(SensoryChannel.Telegram);

    router.register(cliChannel);
    router.register(telegramChannel);

    // Route messages to different channels
    const cliMsg: ChannelMessage = {
      id: '1',
      timestamp: Date.now(),
      channel: SensoryChannel.CLI,
      type: 'text',
      content: 'CLI message',
    };

    const telegramMsg: ChannelMessage = {
      id: '2',
      timestamp: Date.now(),
      channel: SensoryChannel.Telegram,
      type: 'text',
      content: 'Telegram message',
    };

    await router.routeOutput(cliMsg);
    await router.routeOutput(telegramMsg);

    // Verify each channel got its message
    expect(cliChannel['lastSentMessage']?.content).toBe('CLI message');
    expect(telegramChannel['lastSentMessage']?.content).toBe('Telegram message');
  });
});
