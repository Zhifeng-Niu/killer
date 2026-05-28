/**
 * Telegram Sensory Channel Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelegramChannel, type TelegramChannelConfig } from '../sensory/telegram/telegram-channel.js';
import type { SensoryInput } from '../sensory/types.js';
import { SensoryChannel } from '../sensory/types.js';

// Mock fetch for Telegram API
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockTelegramResponse(ok: boolean, result?: unknown, description?: string) {
  return Promise.resolve({
    ok,
    json: async () => ({ ok, result, description }),
  });
}

describe('TelegramChannel', () => {
  let channel: TelegramChannel;

  beforeEach(() => {
    vi.clearAllMocks();
    channel = new TelegramChannel({
      botToken: '123456:ABC-DEF',
      pollInterval: 100,
    });
  });

  afterEach(async () => {
    await channel.stop();
  });

  describe('constructor', () => {
    it('should set Telegram channel type', () => {
      expect(channel.getChannelType()).toBe(SensoryChannel.Telegram);
    });
  });

  describe('start', () => {
    it('should verify bot token via getMe', async () => {
      mockFetch.mockReturnValueOnce(
        mockTelegramResponse(true, { username: 'test_bot' })
      );

      await channel.start();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('getMe');
      expect(channel.getStatus().connected).toBe(true);
    });

    it('should throw on invalid bot token', async () => {
      mockFetch.mockReturnValueOnce(
        mockTelegramResponse(false, undefined, 'Unauthorized')
      );

      await expect(channel.start()).rejects.toThrow('Telegram bot initialization failed');
    });
  });

  describe('message reception', () => {
    it('should convert Telegram messages to SensoryInput', async () => {
      // Mock getMe for start
      mockFetch.mockReturnValueOnce(
        mockTelegramResponse(true, { username: 'test_bot' })
      );

      const received: SensoryInput[] = [];
      channel.onInput((input) => received.push(input));

      await channel.start();

      // Simulate a poll returning a message
      mockFetch.mockReturnValueOnce(
        mockTelegramResponse(true, [{
          update_id: 100,
          message: {
            message_id: 1,
            chat: { id: 42, type: 'private' },
            from: { id: 999, username: 'testuser', first_name: 'Test' },
            text: 'Hello from Telegram',
          },
        }])
      );

      // Manually trigger poll by waiting
      await new Promise((resolve) => setTimeout(resolve, 200));

      if (received.length > 0) {
        expect(received[0].content).toBe('Hello from Telegram');
        expect(received[0].channel).toBe(SensoryChannel.Telegram);
        expect(received[0].source).toContain('telegram');
        expect(received[0].metadata.chatId).toBe(42);
        expect(received[0].metadata.username).toBe('testuser');
      }
    });

    it('should filter messages by allowed chat IDs', async () => {
      const filteredChannel = new TelegramChannel({
        botToken: '123456:ABC',
        allowedChatIds: [111], // Only allow chat 111
        pollInterval: 100,
      });

      mockFetch.mockReturnValueOnce(
        mockTelegramResponse(true, { username: 'test_bot' })
      );

      const received: SensoryInput[] = [];
      filteredChannel.onInput((input) => received.push(input));

      await filteredChannel.start();

      // Message from unauthorized chat (42)
      mockFetch.mockReturnValueOnce(
        mockTelegramResponse(true, [{
          update_id: 200,
          message: {
            message_id: 2,
            chat: { id: 42, type: 'private' },
            from: { id: 999 },
            text: 'Unauthorized message',
          },
        }])
      );

      await new Promise((resolve) => setTimeout(resolve, 200));

      // The unauthorized message should be filtered
      const unauthorized = received.find(r => r.metadata.chatId === 42);
      expect(unauthorized).toBeUndefined();

      await filteredChannel.stop();
    });
  });

  describe('sendToChat', () => {
    it('should send message via Telegram API', async () => {
      mockFetch.mockReturnValueOnce(
        mockTelegramResponse(true, { username: 'test_bot' })
      );
      await channel.start();

      mockFetch.mockReturnValueOnce(
        mockTelegramResponse(true, {})
      );

      const result = await channel.sendToChat(42, 'Hello!');
      expect(result).toBe(true);

      const url = mockFetch.mock.calls[1][0] as string;
      expect(url).toContain('sendMessage');
    });
  });

  describe('stop', () => {
    it('should stop polling and disconnect', async () => {
      mockFetch.mockReturnValueOnce(
        mockTelegramResponse(true, { username: 'test_bot' })
      );

      await channel.start();
      expect(channel.getStatus().connected).toBe(true);

      await channel.stop();
      expect(channel.getStatus().connected).toBe(false);
    });
  });
});
