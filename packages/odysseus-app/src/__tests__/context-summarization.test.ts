/**
 * Context Summarization Tests
 *
 * Tests for the LLM-based context window management:
 * - Background summarization with LLM
 * - Fallback summarization without LLM
 * - Fact extraction
 * - Message truncation
 * - Tool result truncation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextWindowManager, type ContextMessage } from '../orchestrator/context.js';
import type { LLMProvider, LLMCompletion } from '@odysseus/core';

function createMockLLM(responses: string[]): LLMProvider {
  let callIndex = 0;
  return {
    complete: vi.fn(async (): Promise<LLMCompletion> => {
      const content = responses[callIndex % responses.length] ?? '';
      callIndex++;
      return { content, model: 'mock', finishReason: 'stop' };
    }),
    stream: vi.fn(async function* () { yield 'mock'; }),
    getModel: () => 'mock',
  };
}

function createMessages(count: number, role: 'user' | 'assistant' = 'user'): ContextMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role,
    content: `Message ${i + 1}: This is test message number ${i + 1}`,
  }));
}

describe('ContextWindowManager', () => {
  describe('Without LLM', () => {
    let manager: ContextWindowManager;

    beforeEach(() => {
      manager = new ContextWindowManager({ maxFullTurns: 3, maxSummaryChars: 500 });
    });

    it('should keep all messages under limit', () => {
      const messages = createMessages(4);
      const result = manager.manage(messages);
      expect(result.length).toBe(4);
    });

    it('should trigger fallback summary when over limit', () => {
      const messages = createMessages(10);
      const result = manager.manage(messages);

      // Should have: user messages → summary + recent turns
      const systemMsgs = result.filter(m => m.role === 'system');
      expect(systemMsgs.length).toBeGreaterThanOrEqual(1);
      expect(systemMsgs[0]!.content).toContain('Earlier conversation summary');
    });

    it('should truncate long messages', () => {
      const messages: ContextMessage[] = [{
        role: 'user',
        content: 'a'.repeat(3000),
      }];
      const result = manager.manage(messages);
      expect(result[0]!.content.length).toBeLessThan(3000);
      expect(result[0]!.content).toContain('truncated');
    });

    it('should truncate tool results', () => {
      const manager = new ContextWindowManager({ maxToolResultChars: 50, maxFullTurns: 10, maxMessageChars: 5000, maxSummaryChars: 500, maxFacts: 20 });
      const messages: ContextMessage[] = [{
        role: 'assistant',
        content: '[Tool Result: search]\n' + 'x'.repeat(200) + '\n',
      }];
      const result = manager.manage(messages);
      expect(result[0]!.content).toContain('truncated');
      expect(result[0]!.content.length).toBeLessThan(200);
    });

    it('should add facts', () => {
      manager.addFact('User prefers TypeScript');
      manager.addFact('User prefers TypeScript'); // duplicate
      manager.addFact('User is building an agent framework');

      expect(manager.getFacts()).toEqual([
        'User prefers TypeScript',
        'User is building an agent framework',
      ]);
    });

    it('should respect max facts limit', () => {
      const manager = new ContextWindowManager({ maxFacts: 3, maxFullTurns: 10, maxMessageChars: 2000, maxSummaryChars: 500, maxToolResultChars: 300 });
      for (let i = 0; i < 5; i++) {
        manager.addFact(`Fact ${i}`);
      }
      expect(manager.getFacts().length).toBe(3);
    });

    it('should reset state', () => {
      manager.addFact('test fact');
      const messages = createMessages(20);
      manager.manage(messages);

      manager.reset();
      expect(manager.getFacts()).toEqual([]);
      expect(manager.getSummary()).toBe('');
    });
  });

  describe('With LLM (background summarization)', () => {
    it('should call LLM for summarization and update summary', async () => {
      const mockLLM = createMockLLM([
        'Summary: User discussed testing and TypeScript preferences.',
        '- User prefers TypeScript\n- User is building an agent',
      ]);

      const manager = new ContextWindowManager({ maxFullTurns: 2, maxSummaryChars: 500 });
      manager.bindLLM(mockLLM);

      const messages = createMessages(8);
      manager.manage(messages);

      // Give background summarize a tick to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      const summary = manager.getSummary();
      expect(summary).toContain('testing');
    });

    it('should fallback if LLM throws', async () => {
      const failingLLM: LLMProvider = {
        complete: vi.fn(async () => { throw new Error('LLM unavailable'); }),
        stream: vi.fn(async function* () {}),
        getModel: () => 'fail-mock',
      };

      const manager = new ContextWindowManager({ maxFullTurns: 2, maxSummaryChars: 500 });
      manager.bindLLM(failingLLM);

      const messages = createMessages(8);
      const result = manager.manage(messages);

      // Should still produce a result (fallback summary)
      expect(result.length).toBeGreaterThan(0);
      const systemMsgs = result.filter(m => m.role === 'system');
      expect(systemMsgs.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract facts from conversation', async () => {
      const mockLLM = createMockLLM([
        'Summary of the conversation.',
        '- User name is Alice\n- User prefers dark mode\n- User is a senior engineer',
      ]);

      const manager = new ContextWindowManager({ maxFullTurns: 2, maxSummaryChars: 500 });
      manager.bindLLM(mockLLM);

      const messages = createMessages(8);
      manager.manage(messages);

      await new Promise(resolve => setTimeout(resolve, 50));

      const facts = manager.getFacts();
      expect(facts.length).toBeGreaterThan(0);
    });
  });

  describe('bindLLM', () => {
    it('should accept LLM provider', () => {
      const manager = new ContextWindowManager();
      const mockLLM = createMockLLM(['response']);
      expect(() => manager.bindLLM(mockLLM)).not.toThrow();
    });
  });

  describe('Summarization Circuit Breaker', () => {
    it('should open circuit after consecutive failures', async () => {
      const failingLLM: LLMProvider = {
        complete: vi.fn(async () => { throw new Error('Service unavailable'); }),
        stream: vi.fn(async function* () {}),
        getModel: () => 'fail-mock',
      };

      const manager = new ContextWindowManager({ maxFullTurns: 2, maxSummaryChars: 500 });
      manager.bindLLM(failingLLM);

      // Trigger multiple summarizations to exceed MAX_CONSECUTIVE_FAILURES (3)
      const messages = createMessages(8);
      for (let i = 0; i < 4; i++) {
        manager.manage(messages);
        await new Promise(resolve => setTimeout(resolve, 20));
      }

      const stats = manager.getSummarizationStats();
      expect(stats.circuitOpen).toBe(true);
      expect(stats.consecutiveFailures).toBeGreaterThanOrEqual(3);
    });

    it('should reset circuit on successful LLM response', async () => {
      let callCount = 0;
      const flakyLLM: LLMProvider = {
        complete: vi.fn(async () => {
          callCount++;
          if (callCount <= 2) throw new Error('Temporary failure');
          return { content: 'Summary after recovery', model: 'mock', finishReason: 'stop' };
        }),
        stream: vi.fn(async function* () {}),
        getModel: () => 'flaky-mock',
      };

      const manager = new ContextWindowManager({ maxFullTurns: 2, maxSummaryChars: 500 });
      manager.bindLLM(flakyLLM);

      // Trigger failures then recovery
      const messages = createMessages(8);
      manager.manage(messages);
      await new Promise(resolve => setTimeout(resolve, 20));

      manager.manage(messages);
      await new Promise(resolve => setTimeout(resolve, 20));

      // More calls to allow recovery
      manager.manage(messages);
      await new Promise(resolve => setTimeout(resolve, 20));

      manager.manage(messages);
      await new Promise(resolve => setTimeout(resolve, 50));

      const stats = manager.getSummarizationStats();
      expect(stats.consecutiveFailures).toBe(0);
      expect(stats.successes).toBeGreaterThan(0);
    });

    it('should report summarization stats accurately', async () => {
      const mockLLM = createMockLLM(['Test summary']);
      const manager = new ContextWindowManager({ maxFullTurns: 2, maxSummaryChars: 500 });
      manager.bindLLM(mockLLM);

      const messages = createMessages(8);
      manager.manage(messages);
      await new Promise(resolve => setTimeout(resolve, 50));

      const stats = manager.getSummarizationStats();
      expect(stats.attempts).toBeGreaterThan(0);
      expect(stats.successes).toBeGreaterThan(0);
      expect(stats.successRate).toBeGreaterThan(0);
      expect(stats.circuitOpen).toBe(false);
    });

    it('should reset circuit breaker state on reset()', async () => {
      const failingLLM: LLMProvider = {
        complete: vi.fn(async () => { throw new Error('Down'); }),
        stream: vi.fn(async function* () {}),
        getModel: () => 'fail-mock',
      };

      const manager = new ContextWindowManager({ maxFullTurns: 2, maxSummaryChars: 500 });
      manager.bindLLM(failingLLM);

      // Trigger failures
      const messages = createMessages(8);
      for (let i = 0; i < 4; i++) {
        manager.manage(messages);
        await new Promise(resolve => setTimeout(resolve, 20));
      }

      manager.reset();

      const stats = manager.getSummarizationStats();
      expect(stats.consecutiveFailures).toBe(0);
      expect(stats.circuitOpen).toBe(false);
    });
  });
});
