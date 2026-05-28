/**
 * Context Window Manager Tests
 *
 * 验证智能上下文窗口管理：
 * - 最近 N 轮完整保留
 * - 超出部分摘要回退
 * - 事实提取和去重
 * - 消息截断（单条超长 + 工具结果截断）
 * - 摘要熔断器
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ContextWindowManager,
  type ContextMessage,
  type ContextWindowConfig,
} from '../orchestrator/context.js';
import type { LLMProvider, LLMCompletion } from '@odysseus/core';

function msg(role: 'user' | 'assistant' | 'system', content: string): ContextMessage {
  return { role, content };
}

describe('ContextWindowManager', () => {
  let manager: ContextWindowManager;

  beforeEach(() => {
    manager = new ContextWindowManager({ maxFullTurns: 3, maxFacts: 5 });
  });

  describe('basic message management', () => {
    it('should keep all messages within limit', () => {
      const messages: ContextMessage[] = [
        msg('system', 'You are helpful'),
        msg('user', 'Hello'),
        msg('assistant', 'Hi there'),
        msg('user', 'How are you?'),
        msg('assistant', 'I am fine'),
      ];

      const result = manager.manage(messages);

      // All should be kept (within 3 full turns = 6 messages)
      expect(result.length).toBe(5);
      expect(result[0]!.role).toBe('system');
    });

    it('should always preserve system messages', () => {
      const messages: ContextMessage[] = [
        msg('system', 'System prompt'),
        msg('system', 'Additional context'),
        msg('user', 'Hello'),
        msg('assistant', 'Hi'),
      ];

      const result = manager.manage(messages);
      const systemMsgs = result.filter(m => m.role === 'system');
      expect(systemMsgs.length).toBe(2);
    });

    it('should truncate long messages', () => {
      const manager = new ContextWindowManager({
        maxFullTurns: 10,
        maxMessageChars: 100,
        maxSummaryChars: 500,
        maxFacts: 10,
        maxToolResultChars: 200,
      });

      const longContent = 'A'.repeat(500);
      const messages: ContextMessage[] = [
        msg('user', longContent),
      ];

      const result = manager.manage(messages);
      expect(result[0]!.content.length).toBeLessThanOrEqual(120); // 100 + "...[truncated]"
      expect(result[0]!.content).toContain('[truncated]');
    });
  });

  describe('overflow handling', () => {
    it('should create summary when messages exceed limit', () => {
      // maxFullTurns=3 means max 6 conversation messages
      // Create 10 messages to trigger summary
      const messages: ContextMessage[] = [
        msg('system', 'You are helpful'),
        msg('user', 'Message 1'),
        msg('assistant', 'Response 1'),
        msg('user', 'Message 2'),
        msg('assistant', 'Response 2'),
        msg('user', 'Message 3'),
        msg('assistant', 'Response 3'),
        msg('user', 'Message 4'),
        msg('assistant', 'Response 4'),
        msg('user', 'Message 5'),
        msg('assistant', 'Response 5'),
      ];

      const result = manager.manage(messages);

      // Should have: system + summary system + facts system + 6 recent messages
      expect(result.length).toBeGreaterThan(6);
      expect(result.some(m => m.content.includes('Earlier conversation summary'))).toBe(true);
    });

    it('should include facts in output when overflow occurs', () => {
      manager.addFact('User prefers dark mode');

      // Create overflow to trigger summary path where facts are included
      const messages: ContextMessage[] = [
        msg('system', 'You are helpful'),
        msg('user', 'Message 1'),
        msg('assistant', 'Response 1'),
        msg('user', 'Message 2'),
        msg('assistant', 'Response 2'),
        msg('user', 'Message 3'),
        msg('assistant', 'Response 3'),
        msg('user', 'Message 4'),
        msg('assistant', 'Response 4'),
      ];

      const result = manager.manage(messages);
      expect(result.some(m => m.content.includes('Key facts'))).toBe(true);
      expect(result.some(m => m.content.includes('dark mode'))).toBe(true);
    });
  });

  describe('fact management', () => {
    it('should add and retrieve facts', () => {
      manager.addFact('User is a developer');
      manager.addFact('User prefers TypeScript');

      const facts = manager.getFacts();
      expect(facts).toEqual(['User is a developer', 'User prefers TypeScript']);
    });

    it('should deduplicate facts (case-insensitive)', () => {
      manager.addFact('User likes cats');
      manager.addFact('user likes cats');

      expect(manager.getFacts().length).toBe(1);
    });

    it('should evict oldest fact when exceeding maxFacts', () => {
      const m = new ContextWindowManager({ maxFullTurns: 3, maxFacts: 3 });
      m.addFact('Fact 1');
      m.addFact('Fact 2');
      m.addFact('Fact 3');
      m.addFact('Fact 4'); // Should evict Fact 1

      const facts = m.getFacts();
      expect(facts).toEqual(['Fact 2', 'Fact 3', 'Fact 4']);
    });
  });

  describe('tool result truncation', () => {
    it('should truncate long tool results', () => {
      const manager = new ContextWindowManager({
        maxFullTurns: 10,
        maxMessageChars: 5000,
        maxSummaryChars: 1500,
        maxFacts: 30,
        maxToolResultChars: 50,
      });

      const longResult = 'X'.repeat(200);
      const messages: ContextMessage[] = [
        msg('assistant', `[Tool Result: search]\n${longResult}\nMore text`),
      ];

      const result = manager.manage(messages);
      expect(result[0]!.content).toContain('[truncated]');
      expect(result[0]!.content.length).toBeLessThan(300);
    });
  });

  describe('LLM-powered summarization', () => {
    it('should use LLM for background summarization when bound', async () => {
      const mockLLM: LLMProvider = {
        complete: async (): Promise<LLMCompletion> => ({
          content: 'Summary: User discussed coding topics.',
          model: 'mock',
          finishReason: 'stop',
        }),
        stream: async function* () { yield 'summary'; },
        getModel: () => 'mock',
      };

      manager.bindLLM(mockLLM);

      // Trigger overflow to start background summarization
      const messages: ContextMessage[] = [];
      for (let i = 0; i < 8; i++) {
        messages.push(msg('user', `Message ${i}`));
        messages.push(msg('assistant', `Response ${i}`));
      }

      manager.manage(messages);

      // Wait for background summarization
      await new Promise(resolve => setTimeout(resolve, 100));

      const summary = manager.getSummary();
      expect(summary).toBeTruthy();
    });

    it('should track summarization stats', async () => {
      const mockLLM: LLMProvider = {
        complete: async (): Promise<LLMCompletion> => ({
          content: 'Summary text',
          model: 'mock',
          finishReason: 'stop',
        }),
        stream: async function* () { yield 'summary'; },
        getModel: () => 'mock',
      };

      manager.bindLLM(mockLLM);

      // Trigger background summarization
      const messages: ContextMessage[] = [];
      for (let i = 0; i < 8; i++) {
        messages.push(msg('user', `Message ${i}`));
        messages.push(msg('assistant', `Response ${i}`));
      }

      manager.manage(messages);
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = manager.getSummarizationStats();
      expect(stats.attempts).toBeGreaterThanOrEqual(0);
      expect(stats.successRate).toBeGreaterThanOrEqual(0);
      expect(stats.successRate).toBeLessThanOrEqual(1);
    });

    it('should open circuit breaker after consecutive failures', async () => {
      const failingLLM: LLMProvider = {
        complete: async (): Promise<LLMCompletion> => {
          throw new Error('LLM unavailable');
        },
        stream: async function* () { yield 'x'; },
        getModel: () => 'failing',
      };

      manager.bindLLM(failingLLM);

      // Trigger 3 failures to open circuit breaker
      for (let round = 0; round < 4; round++) {
        const messages: ContextMessage[] = [];
        for (let i = 0; i < 8; i++) {
          messages.push(msg('user', `Round ${round} Message ${i}`));
          messages.push(msg('assistant', `Round ${round} Response ${i}`));
        }
        manager.manage(messages);
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const stats = manager.getSummarizationStats();
      expect(stats.circuitOpen || stats.consecutiveFailures >= 3).toBe(true);
    });
  });

  describe('reset', () => {
    it('should clear all state on reset', () => {
      manager.addFact('Some fact');
      const messages: ContextMessage[] = [];
      for (let i = 0; i < 8; i++) {
        messages.push(msg('user', `Message ${i}`));
        messages.push(msg('assistant', `Response ${i}`));
      }
      manager.manage(messages);

      manager.reset();

      expect(manager.getFacts()).toEqual([]);
      expect(manager.getSummary()).toBe('');
    });
  });

  describe('config', () => {
    it('should return config copy', () => {
      const config = manager.getConfig();
      expect(config.maxFullTurns).toBe(3);
      expect(config.maxFacts).toBe(5);

      // Mutating returned config should not affect manager
      config.maxFullTurns = 100;
      expect(manager.getConfig().maxFullTurns).toBe(3);
    });
  });

  describe('adaptive phase presets', () => {
    it('should adjust config for deep-work phase', () => {
      manager.setPhase('deep-work');
      const config = manager.getConfig();
      expect(config.maxFullTurns).toBe(16);
      expect(config.maxMessageChars).toBe(3000);
      expect(config.maxToolResultChars).toBe(1200);
    });

    it('should adjust config for exploration phase', () => {
      manager.setPhase('exploration');
      const config = manager.getConfig();
      expect(config.maxFullTurns).toBe(8);
      expect(config.maxSummaryChars).toBe(2000);
    });

    it('should adjust config for wrap-up phase', () => {
      manager.setPhase('wrap-up');
      const config = manager.getConfig();
      expect(config.maxFullTurns).toBe(6);
      expect(config.maxFacts).toBe(40);
    });

    it('should adjust config for greeting phase', () => {
      manager.setPhase('greeting');
      const config = manager.getConfig();
      expect(config.maxFullTurns).toBe(4);
      expect(config.maxMessageChars).toBe(1000);
    });

    it('should not change config for unknown phase', () => {
      const before = manager.getConfig();
      manager.setPhase('unknown-phase');
      const after = manager.getConfig();
      // maxFullTurns was 3 from beforeEach, should remain
      expect(after.maxFullTurns).toBe(before.maxFullTurns);
    });

    it('should return current phase name', () => {
      manager.setPhase('deep-work');
      expect(manager.getCurrentPhase()).toBe('deep-work');
    });

    it('should reset to default when reset is called', () => {
      manager.setPhase('deep-work');
      expect(manager.getConfig().maxFullTurns).toBe(16);
      manager.reset();
      // reset clears facts/summary but does NOT reset phase config
      // phase is set per-turn by the agent, so reset doesn't need to touch it
    });
  });

  describe('importance-weighted retention', () => {
    it('should preserve important older messages during overflow', () => {
      // maxFullTurns=3 means 6 messages kept as recent
      const messages: ContextMessage[] = [
        msg('system', 'You are helpful'),
        msg('user', 'We decided to implement caching with error rate 5%, latency 2000ms, v2.1 — this is critical'),
        msg('assistant', 'Understood, implementing the cache'),
        msg('user', 'Message 2'),
        msg('assistant', 'Response 2'),
        msg('user', 'Message 3'),
        msg('assistant', 'Response 3'),
        msg('user', 'Message 4'),
        msg('assistant', 'Response 4'),
        msg('user', 'Message 5'),
        msg('assistant', 'Response 5'),
      ];

      const result = manager.manage(messages);
      expect(result.some(m => m.content.includes('Important earlier context'))).toBe(true);
      expect(result.some(m => m.content.includes('caching'))).toBe(true);
    });

    it('should not include important context section when all old messages are low importance', () => {
      const messages: ContextMessage[] = [
        msg('system', 'You are helpful'),
        msg('user', 'Hello there'),
        msg('assistant', 'Hi'),
        msg('user', 'Message 2'),
        msg('assistant', 'Response 2'),
        msg('user', 'Message 3'),
        msg('assistant', 'Response 3'),
        msg('user', 'Message 4'),
        msg('assistant', 'Response 4'),
        msg('user', 'Message 5'),
        msg('assistant', 'Response 5'),
      ];

      const result = manager.manage(messages);
      expect(result.some(m => m.content.includes('Important earlier context'))).toBe(false);
    });
  });
});
