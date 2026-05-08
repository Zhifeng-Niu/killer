/**
 * SensoryRouter Tests
 *
 * Tests for the sensory input router:
 * - Channel registration/unregistration
 * - Priority queue ordering
 * - Input subscription/unsubscription
 * - Output routing
 * - Queue management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SensoryRouter } from '../sensory/router.js';
import { SensoryChannel } from '../sensory/types.js';
import type { SensoryInput, ChannelMessage, ChannelStatus } from '../sensory/types.js';
import type { ISensoryChannel } from '../sensory/channel.js';

function createMockChannel(channelType: SensoryChannel): ISensoryChannel & { inputs: SensoryInput[]; sentMessages: ChannelMessage[] } {
  const inputs: SensoryInput[] = [];
  const sentMessages: ChannelMessage[] = [];
  let inputCallback: ((input: SensoryInput) => void) | null = null;
  let status: ChannelStatus = { channel: channelType, connected: false, lastActivity: 0, errorCount: 0 };

  return {
    inputs,
    sentMessages,
    getChannelType: () => channelType,
    getStatus: () => ({ ...status }),
    start: vi.fn(async () => { status = { ...status, connected: true }; }),
    stop: vi.fn(async () => { status = { ...status, connected: false }; }),
    send: vi.fn(async (msg: ChannelMessage) => { sentMessages.push(msg); }),
    onInput: vi.fn((cb: (input: SensoryInput) => void) => { inputCallback = cb; }),
    offInput: vi.fn(() => { inputCallback = null; }),
    // Helper to simulate input from outside
    simulateInput(input: SensoryInput) {
      inputs.push(input);
      if (inputCallback) inputCallback(input);
    },
  };
}

function createInput(overrides: Partial<SensoryInput> & { priority?: SensoryInput['priority'] }): SensoryInput {
  return {
    id: `input_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    channel: SensoryChannel.CLI,
    source: 'test',
    content: 'test input',
    metadata: {},
    priority: 'normal',
    ...overrides,
  };
}

describe('SensoryRouter', () => {
  let router: SensoryRouter;

  beforeEach(() => {
    router = new SensoryRouter();
  });

  describe('Channel Registration', () => {
    it('should register a channel', () => {
      const channel = createMockChannel(SensoryChannel.CLI);
      router.register(channel);

      expect(router.getChannels()).toHaveLength(1);
      expect(router.getChannels()[0].getChannelType()).toBe(SensoryChannel.CLI);
    });

    it('should register multiple channels', () => {
      router.register(createMockChannel(SensoryChannel.CLI));
      router.register(createMockChannel(SensoryChannel.Telegram));
      router.register(createMockChannel(SensoryChannel.Web));

      expect(router.getChannels()).toHaveLength(3);
    });

    it('should start all registered channels', async () => {
      const ch1 = createMockChannel(SensoryChannel.CLI);
      const ch2 = createMockChannel(SensoryChannel.Telegram);
      router.register(ch1);
      router.register(ch2);

      await router.startAll();

      expect(ch1.start).toHaveBeenCalled();
      expect(ch2.start).toHaveBeenCalled();
    });

    it('should stop all registered channels', async () => {
      const ch1 = createMockChannel(SensoryChannel.CLI);
      const ch2 = createMockChannel(SensoryChannel.Telegram);
      router.register(ch1);
      router.register(ch2);

      await router.stopAll();

      expect(ch1.stop).toHaveBeenCalled();
      expect(ch2.stop).toHaveBeenCalled();
    });

    it('should unregister a channel and stop it', async () => {
      const channel = createMockChannel(SensoryChannel.CLI);
      router.register(channel);

      await router.unregister(SensoryChannel.CLI);

      expect(channel.stop).toHaveBeenCalled();
      expect(router.getChannels()).toHaveLength(0);
    });

    it('should return null status for unregistered channel', () => {
      expect(router.getChannelStatus(SensoryChannel.CLI)).toBeNull();
    });

    it('should return status for registered channel', () => {
      const channel = createMockChannel(SensoryChannel.CLI);
      router.register(channel);

      const status = router.getChannelStatus(SensoryChannel.CLI);
      expect(status).not.toBeNull();
      expect(status!.channel).toBe(SensoryChannel.CLI);
    });
  });

  describe('Priority Queue', () => {
    it('should return null when queue is empty', () => {
      expect(router.next()).toBeNull();
    });

    it('should dequeue inputs in priority order', () => {
      const channel = createMockChannel(SensoryChannel.CLI);
      router.register(channel);

      // Simulate inputs in non-priority order
      channel.simulateInput(createInput({ priority: 'low', content: 'low' }));
      channel.simulateInput(createInput({ priority: 'urgent', content: 'urgent' }));
      channel.simulateInput(createInput({ priority: 'normal', content: 'normal' }));
      channel.simulateInput(createInput({ priority: 'high', content: 'high' }));

      expect(router.next()!.priority).toBe('urgent');
      expect(router.next()!.priority).toBe('high');
      expect(router.next()!.priority).toBe('normal');
      expect(router.next()!.priority).toBe('low');
    });

    it('should maintain FIFO for same priority', () => {
      const channel = createMockChannel(SensoryChannel.CLI);
      router.register(channel);

      channel.simulateInput(createInput({ priority: 'normal', content: 'first', timestamp: 100 }));
      channel.simulateInput(createInput({ priority: 'normal', content: 'second', timestamp: 200 }));

      expect(router.next()!.content).toBe('first');
      expect(router.next()!.content).toBe('second');
    });

    it('should track queue size correctly', () => {
      const channel = createMockChannel(SensoryChannel.CLI);
      router.register(channel);

      expect(router.getQueueSize()).toBe(0);

      channel.simulateInput(createInput({ priority: 'normal' }));
      channel.simulateInput(createInput({ priority: 'high' }));

      expect(router.getQueueSize()).toBe(2);

      router.next();
      expect(router.getQueueSize()).toBe(1);
    });

    it('should clear the queue', () => {
      const channel = createMockChannel(SensoryChannel.CLI);
      router.register(channel);

      channel.simulateInput(createInput({ priority: 'normal' }));
      channel.simulateInput(createInput({ priority: 'high' }));

      expect(router.getQueueSize()).toBe(2);
      router.clearQueue();
      expect(router.getQueueSize()).toBe(0);
    });
  });

  describe('Input Subscription', () => {
    it('should notify input subscribers', () => {
      const channel = createMockChannel(SensoryChannel.CLI);
      router.register(channel);

      const received: SensoryInput[] = [];
      router.onInput((input) => received.push(input));

      channel.simulateInput(createInput({ content: 'hello' }));

      expect(received).toHaveLength(1);
      expect(received[0].content).toBe('hello');
    });

    it('should support multiple subscribers', () => {
      const channel = createMockChannel(SensoryChannel.CLI);
      router.register(channel);

      const received1: SensoryInput[] = [];
      const received2: SensoryInput[] = [];
      router.onInput((input) => received1.push(input));
      router.onInput((input) => received2.push(input));

      channel.simulateInput(createInput({ content: 'test' }));

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
    });

    it('should support unsubscription', () => {
      const channel = createMockChannel(SensoryChannel.CLI);
      router.register(channel);

      const received: SensoryInput[] = [];
      const callback = (input: SensoryInput) => received.push(input);
      router.onInput(callback);
      router.offInput(callback);

      channel.simulateInput(createInput({ content: 'test' }));

      expect(received).toHaveLength(0);
    });

    it('should continue notifying other subscribers after one throws', () => {
      const channel = createMockChannel(SensoryChannel.CLI);
      router.register(channel);

      const originalError = console.error;
      console.error = () => {};

      const received: SensoryInput[] = [];
      router.onInput(() => { throw new Error('boom'); });
      router.onInput((input) => received.push(input));

      channel.simulateInput(createInput({ content: 'test' }));

      console.error = originalError;
      expect(received).toHaveLength(1);
    });
  });

  describe('Output Routing', () => {
    it('should route output to the correct channel', async () => {
      const cliChannel = createMockChannel(SensoryChannel.CLI);
      const telegramChannel = createMockChannel(SensoryChannel.Telegram);
      router.register(cliChannel);
      router.register(telegramChannel);

      const message: ChannelMessage = {
        id: 'msg_1',
        timestamp: Date.now(),
        channel: SensoryChannel.CLI,
        type: 'text',
        content: 'Hello',
      };

      await router.routeOutput(message);

      expect(cliChannel.send).toHaveBeenCalledWith(message);
      expect(telegramChannel.send).not.toHaveBeenCalled();
    });

    it('should handle missing channel gracefully', async () => {
      const originalError = console.error;
      const errors: string[] = [];
      console.error = (...args: unknown[]) => errors.push(String(args[0]));

      const message: ChannelMessage = {
        id: 'msg_1',
        timestamp: Date.now(),
        channel: SensoryChannel.Discord,
        type: 'text',
        content: 'Hello',
      };

      // Should not throw
      await router.routeOutput(message);

      console.error = originalError;
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
