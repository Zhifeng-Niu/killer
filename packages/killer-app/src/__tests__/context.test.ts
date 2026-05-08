/**
 * Context Window Manager Tests
 */

import { describe, it, expect } from 'vitest';
import { ContextWindowManager, type ContextMessage } from '../orchestrator/context.js';

describe('ContextWindowManager', () => {
  it('should pass through short conversations unchanged', () => {
    const cwm = new ContextWindowManager({ maxFullTurns: 5 });
    const messages: ContextMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];

    const result = cwm.manage(messages);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('Hello');
  });

  it('should summarize old messages when exceeding maxFullTurns', () => {
    const cwm = new ContextWindowManager({ maxFullTurns: 2, maxSummaryChars: 1000 });

    // Create 6 turns (12 messages)
    const messages: ContextMessage[] = [];
    for (let i = 0; i < 6; i++) {
      messages.push({ role: 'user', content: `Question ${i}` });
      messages.push({ role: 'assistant', content: `Answer ${i}` });
    }

    const result = cwm.manage(messages);

    // Should have: summary system msg + recent 4 messages = 5
    const systemMsgs = result.filter(m => m.role === 'system');
    expect(systemMsgs.length).toBeGreaterThan(0);
    expect(systemMsgs[0]!.content).toContain('Earlier conversation');
  });

  it('should truncate long messages', () => {
    const cwm = new ContextWindowManager({ maxMessageChars: 50 });
    const messages: ContextMessage[] = [
      { role: 'user', content: 'a'.repeat(200) },
    ];

    const result = cwm.manage(messages);
    expect(result[0].content.length).toBeLessThan(200);
    expect(result[0].content).toContain('truncated');
  });

  it('should preserve system messages', () => {
    const cwm = new ContextWindowManager({ maxFullTurns: 2 });
    const messages: ContextMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hi' },
    ];

    const result = cwm.manage(messages);
    expect(result[0]).toEqual({ role: 'system', content: 'You are a helpful assistant.' });
  });

  it('should manage facts', () => {
    const cwm = new ContextWindowManager({ maxFacts: 3 });

    cwm.addFact('User likes Python');
    cwm.addFact('User is a developer');
    cwm.addFact('User prefers dark mode');
    cwm.addFact('User lives in Tokyo'); // Should push out oldest

    expect(cwm.getFacts()).toHaveLength(3);
    expect(cwm.getFacts()).not.toContain('User likes Python');
    expect(cwm.getFacts()).toContain('User lives in Tokyo');
  });

  it('should deduplicate facts', () => {
    const cwm = new ContextWindowManager();

    cwm.addFact('Hello World');
    cwm.addFact('hello world'); // Same fact, different case

    expect(cwm.getFacts()).toHaveLength(1);
  });

  it('should truncate tool results', () => {
    const cwm = new ContextWindowManager({ maxToolResultChars: 20 });
    const messages: ContextMessage[] = [
      {
        role: 'assistant',
        content: `Here's the result:\n[Tool Result: read_file]\n${'x'.repeat(100)}\n`,
      },
    ];

    const result = cwm.manage(messages);
    expect(result[0].content).toContain('truncated');
    expect(result[0].content.length).toBeLessThan(200);
  });

  it('should reset state', () => {
    const cwm = new ContextWindowManager();

    cwm.addFact('test fact');
    cwm.reset();

    expect(cwm.getFacts()).toHaveLength(0);
    expect(cwm.getSummary()).toBe('');
  });

  it('should return config', () => {
    const cwm = new ContextWindowManager({ maxFullTurns: 5 });
    const config = cwm.getConfig();
    expect(config.maxFullTurns).toBe(5);
  });

  it('should include facts as system message when present', () => {
    const cwm = new ContextWindowManager({ maxFullTurns: 1, maxFacts: 10 });

    // Add facts
    cwm.addFact('User prefers dark mode');
    cwm.addFact('User codes in Rust');

    // Create enough messages to trigger summarization
    const messages: ContextMessage[] = [];
    for (let i = 0; i < 5; i++) {
      messages.push({ role: 'user', content: `Question ${i}` });
      messages.push({ role: 'assistant', content: `Answer ${i}` });
    }

    const result = cwm.manage(messages);

    const factMsg = result.find(m => m.role === 'system' && m.content.includes('Key facts'));
    expect(factMsg).toBeDefined();
    expect(factMsg!.content).toContain('User prefers dark mode');
    expect(factMsg!.content).toContain('User codes in Rust');
  });

  it('should preserve most recent turns in full', () => {
    const cwm = new ContextWindowManager({ maxFullTurns: 2, maxSummaryChars: 1000 });

    const messages: ContextMessage[] = [];
    for (let i = 0; i < 6; i++) {
      messages.push({ role: 'user', content: `Question ${i}` });
      messages.push({ role: 'assistant', content: `Answer ${i}` });
    }

    const result = cwm.manage(messages);
    const nonSystem = result.filter(m => m.role !== 'system');

    // Should keep last 2 turns (4 messages)
    expect(nonSystem).toHaveLength(4);
    expect(nonSystem[0].content).toBe('Question 4');
    expect(nonSystem[3].content).toBe('Answer 5');
  });

  it('should not mutate input messages', () => {
    const cwm = new ContextWindowManager({ maxMessageChars: 10 });

    const messages: ContextMessage[] = [
      { role: 'user', content: 'A'.repeat(100) },
    ];

    const originalContent = messages[0].content;
    cwm.manage(messages);

    expect(messages[0].content).toBe(originalContent);
    expect(messages[0].content.length).toBe(100);
  });

  it('should use default config values when partially specified', () => {
    const cwm = new ContextWindowManager({ maxFullTurns: 3 });

    const config = cwm.getConfig();
    expect(config.maxFullTurns).toBe(3);
    expect(config.maxMessageChars).toBe(2000);
    expect(config.maxSummaryChars).toBe(1500);
    expect(config.maxFacts).toBe(30);
    expect(config.maxToolResultChars).toBe(800);
  });

  it('getConfig should return a copy', () => {
    const cwm = new ContextWindowManager();
    const config = cwm.getConfig();
    config.maxFullTurns = 999;

    expect(cwm.getConfig().maxFullTurns).toBe(10);
  });

  it('should handle empty message list', () => {
    const cwm = new ContextWindowManager();
    const result = cwm.manage([]);

    expect(result).toEqual([]);
  });

  it('should handle system-only messages', () => {
    const cwm = new ContextWindowManager();
    const messages: ContextMessage[] = [
      { role: 'system', content: 'System prompt' },
    ];

    const result = cwm.manage(messages);

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('System prompt');
  });

  it('should generate fallback summary from user messages', () => {
    const cwm = new ContextWindowManager({ maxFullTurns: 1, maxSummaryChars: 1000 });

    const messages: ContextMessage[] = [];
    for (let i = 0; i < 5; i++) {
      messages.push({ role: 'user', content: `User asked about topic ${i}` });
      messages.push({ role: 'assistant', content: `Answer about topic ${i}` });
    }

    cwm.manage(messages);

    const summary = cwm.getSummary();
    expect(summary.length).toBeGreaterThan(0);
    // Fallback should include last few user messages
    expect(summary).toContain('topic');
  });

  it('should trim facts whitespace', () => {
    const cwm = new ContextWindowManager();

    cwm.addFact('  Valid fact  ');

    expect(cwm.getFacts()).toEqual(['Valid fact']);
  });

  it('getFacts should return a copy', () => {
    const cwm = new ContextWindowManager();
    cwm.addFact('Test');

    const facts = cwm.getFacts();
    facts.push('Injected');

    expect(cwm.getFacts()).toHaveLength(1);
  });
});
