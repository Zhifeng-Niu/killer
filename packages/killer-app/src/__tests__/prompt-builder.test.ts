/**
 * Prompt Builder Tests
 *
 * Tests for the extracted system prompt builder — E5 (Conversation Personality Integration)
 */

import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, type PromptBuilderDeps } from '../orchestrator/prompt-builder.js';

function createMockDeps(overrides: Partial<PromptBuilderDeps> = {}): PromptBuilderDeps {
  return {
    persona: {
      getSystemPrompt: () => 'You are Killer, an AI agent.',
      emotionalState: {
        getEmotionalPromptFragment: () => 'Current emotion: curious (60%)',
      },
      getUserContextPrompt: () => 'User prefers concise responses.',
      predictiveModel: {
        getPredictionPromptFragment: () => 'Anticipated: code assistance (85%)',
      },
    } as never,
    hippocampus: {
      getNarrativeContextForPrompt: () => 'Life Context: I am an AI learning about the world.',
      getStats: () => ({ episodes: 5, semanticNodes: 3 }),
      getEpisodesByTag: () => [],
      associativeRecall: () => ({ nodes: [], episodes: [], relevanceScore: 0 }),
    } as never,
    tools: {
      list: () => ['memory_store', 'noop'],
      getInfo: (name: string) => ({ name, description: `Tool: ${name}` }),
    } as never,
    contextWindow: {
      manage: (msgs: Array<{ role: string; content: string }>) => msgs,
    } as never,
    conversationHistory: [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi there!' },
    ],
    ...overrides,
  };
}

describe('buildSystemPrompt', () => {
  it('should include identity core', () => {
    const deps = createMockDeps();
    const prompt = buildSystemPrompt(deps);
    expect(prompt).toContain('You are Killer');
  });

  it('should include emotional state', () => {
    const deps = createMockDeps();
    const prompt = buildSystemPrompt(deps);
    expect(prompt).toContain('curious');
  });

  it('should include life narrative', () => {
    const deps = createMockDeps();
    const prompt = buildSystemPrompt(deps);
    expect(prompt).toContain('Life Context');
  });

  it('should include user understanding', () => {
    const deps = createMockDeps();
    const prompt = buildSystemPrompt(deps);
    expect(prompt).toContain('User prefers concise');
  });

  it('should include predictions', () => {
    const deps = createMockDeps();
    const prompt = buildSystemPrompt(deps);
    expect(prompt).toContain('Anticipated');
  });

  it('should include memory stats when episodes exist', () => {
    const deps = createMockDeps();
    const prompt = buildSystemPrompt(deps);
    expect(prompt).toContain('5 shared memories');
    expect(prompt).toContain('3 things');
  });

  it('should skip memory stats when no episodes', () => {
    const deps = createMockDeps({
      hippocampus: {
        getNarrativeContextForPrompt: () => '',
        getStats: () => ({ episodes: 0, semanticNodes: 0 }),
        getEpisodesByTag: () => [],
        associativeRecall: () => ({ nodes: [], episodes: [], relevanceScore: 0 }),
      } as never,
    });
    const prompt = buildSystemPrompt(deps);
    expect(prompt).not.toContain('shared memories');
  });

  it('should include available tools', () => {
    const deps = createMockDeps();
    const prompt = buildSystemPrompt(deps);
    expect(prompt).toContain('Available tools');
    expect(prompt).toContain('memory_store');
    expect(prompt).toContain('noop');
  });

  it('should include conversation history', () => {
    const deps = createMockDeps();
    const prompt = buildSystemPrompt(deps);
    expect(prompt).toContain('Conversation so far');
    expect(prompt).toContain('User: Hello');
    expect(prompt).toContain('Assistant: Hi there!');
  });

  it('should skip sections when fragments are empty', () => {
    const deps = createMockDeps({
      persona: {
        getSystemPrompt: () => 'Base prompt.',
        emotionalState: {
          getEmotionalPromptFragment: () => '',
        },
        getUserContextPrompt: () => '',
        predictiveModel: {
          getPredictionPromptFragment: () => '',
        },
      } as never,
      hippocampus: {
        getNarrativeContextForPrompt: () => '',
        getStats: () => ({ episodes: 0, semanticNodes: 0 }),
        getEpisodesByTag: () => [],
        associativeRecall: () => ({ nodes: [], episodes: [], relevanceScore: 0 }),
      } as never,
      tools: {
        list: () => [],
        getInfo: () => null,
      } as never,
      conversationHistory: [],
    });
    const prompt = buildSystemPrompt(deps);
    expect(prompt).toContain('Base prompt.');
    expect(prompt).not.toContain('--- Emotional State ---');
    expect(prompt).not.toContain('--- Life Context ---');
    expect(prompt).not.toContain('--- User Understanding ---');
    expect(prompt).not.toContain('Available tools');
    expect(prompt).not.toContain('Conversation so far');
  });

  it('should include relevant memories when currentInput matches tags', () => {
    const deps = createMockDeps({
      currentInput: 'How do I fix the bug in my function?',
      hippocampus: {
        getNarrativeContextForPrompt: () => '',
        getStats: () => ({ episodes: 3, semanticNodes: 2 }),
        getEpisodesByTag: (tag: string) => {
          if (tag === 'coding') {
            return [{
              id: 'ep_1',
              title: 'Fixed a bug in auth',
              narrative: 'User fixed authentication bug with JWT tokens',
              emotionalWeight: 0.7,
              tags: ['coding', 'bug'],
              timestamp: Date.now() - 3600000,
              associations: [],
              decayRate: 0.1,
              accessCount: 1,
            }];
          }
          return [];
        },
        associativeRecall: () => ({ nodes: [], episodes: [], relevanceScore: 0 }),
      } as never,
    });
    const prompt = buildSystemPrompt(deps);
    expect(prompt).toContain('Context from your shared history');
    expect(prompt).toContain('Fixed a bug in auth');
  });

  it('should not include memory section when no currentInput', () => {
    const deps = createMockDeps();
    const prompt = buildSystemPrompt(deps);
    expect(prompt).not.toContain('Context from your shared history');
    expect(prompt).not.toContain('referencing something from your past');
  });

  it('should detect reference intent and show recalled memories', () => {
    const deps = createMockDeps({
      currentInput: 'Remember what we discussed about the API design?',
      hippocampus: {
        getNarrativeContextForPrompt: () => '',
        getStats: () => ({ episodes: 5, semanticNodes: 3 }),
        getEpisodesByTag: (tag: string) => {
          if (tag === 'architecture') {
            return [{
              id: 'ep_arch_1',
              title: 'API design discussion',
              narrative: 'Discussed REST vs GraphQL for the new service',
              emotionalWeight: 0.6,
              tags: ['architecture', 'coding'],
              timestamp: Date.now() - 86400000,
              associations: [],
              decayRate: 0.1,
              accessCount: 2,
            }];
          }
          return [];
        },
        associativeRecall: () => ({ nodes: [], episodes: [], relevanceScore: 0 }),
        getRecentEpisodes: () => [{
          id: 'ep_recent',
          title: 'Deep coding session',
          narrative: 'Spent time debugging authentication flow',
          emotionalWeight: 0.8,
          tags: ['coding', 'debugging'],
          timestamp: Date.now() - 3600000,
          associations: [],
          decayRate: 0.1,
          accessCount: 1,
        }],
      } as never,
    });
    const prompt = buildSystemPrompt(deps);
    // Should show reference-style memory header for reference intent
    expect(prompt).toContain('what you remember');
    expect(prompt).toContain('API design discussion');
  });

  it('should detect Chinese reference patterns', () => {
    const deps = createMockDeps({
      currentInput: '还记得上次说的那个问题吗',
      hippocampus: {
        getNarrativeContextForPrompt: () => '',
        getStats: () => ({ episodes: 2, semanticNodes: 1 }),
        getEpisodesByTag: () => [],
        associativeRecall: () => ({ nodes: [], episodes: [], relevanceScore: 0 }),
        getRecentEpisodes: () => [{
          id: 'ep_1',
          title: 'Previous issue discussion',
          narrative: 'Discussed a recurring problem',
          emotionalWeight: 0.7,
          tags: ['issue'],
          timestamp: Date.now() - 7200000,
          associations: [],
          decayRate: 0.1,
          accessCount: 1,
        }],
      } as never,
    });
    const prompt = buildSystemPrompt(deps);
    expect(prompt).toContain('what you remember');
    expect(prompt).toContain('Previous issue discussion');
  });

  describe('Progressive History Truncation', () => {
    it('should preserve more content for recent turns', () => {
      // Create 14 turns of conversation (28 messages)
      const longContent = 'A'.repeat(600); // 600 chars — longer than any truncation limit
      const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      for (let i = 0; i < 14; i++) {
        history.push({ role: 'user', content: `User message ${i}: ${longContent}` });
        history.push({ role: 'assistant', content: `Agent response ${i}: ${longContent}` });
      }

      const deps = createMockDeps({
        conversationHistory: history,
        hippocampus: {
          getNarrativeContextForPrompt: () => '',
          getStats: () => ({ episodes: 0, semanticNodes: 0 }),
          getEpisodesByTag: () => [],
          associativeRecall: () => ({ nodes: [], episodes: [], relevanceScore: 0 }),
        } as never,
        tools: { list: () => [], getInfo: () => null } as never,
      });

      const prompt = buildSystemPrompt(deps);

      // Most recent user message should have up to 500 chars preserved
      expect(prompt).toContain('User message 13:');
      // Check that the last user message content is longer than 200 chars
      // (progressive truncation gives recent turns 500 chars)
      const lastUserLine = prompt.split('\n').find(l => l.includes('User message 13:'));
      expect(lastUserLine).toBeDefined();
      expect(lastUserLine!.length).toBeGreaterThan(300); // Much more than old 200 char limit
    });

    it('should truncate early turns more aggressively', () => {
      const longContent = 'B'.repeat(800);
      const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      for (let i = 0; i < 20; i++) {
        history.push({ role: 'user', content: `Turn ${i}: ${longContent}` });
        history.push({ role: 'assistant', content: `Reply ${i}: ${longContent}` });
      }

      const deps = createMockDeps({
        conversationHistory: history,
        hippocampus: {
          getNarrativeContextForPrompt: () => '',
          getStats: () => ({ episodes: 0, semanticNodes: 0 }),
          getEpisodesByTag: () => [],
          associativeRecall: () => ({ nodes: [], episodes: [], relevanceScore: 0 }),
        } as never,
        tools: { list: () => [], getInfo: () => null } as never,
      });

      const prompt = buildSystemPrompt(deps);

      // Early turns should be truncated to 150 chars + ellipsis
      const earlyLine = prompt.split('\n').find(l => l.includes('Turn 0:'));
      expect(earlyLine).toBeDefined();
      // Should have ... suffix indicating truncation
      expect(earlyLine!.includes('...')).toBe(true);
      // Should be shorter than recent turns
      expect(earlyLine!.length).toBeLessThan(200);
    });

    it('should not truncate short messages', () => {
      const history: Array<{ role: 'user' | 'assistant'; content: string }> = [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
      ];

      const deps = createMockDeps({
        conversationHistory: history,
      });

      const prompt = buildSystemPrompt(deps);
      expect(prompt).toContain('User: Hi');
      expect(prompt).toContain('Assistant: Hello!');
      // Short messages should not have truncation marker (line ending with ...)
      const lines = prompt.split('\n');
      const truncatedLine = lines.find(l =>
        (l.includes('User:') || l.includes('Assistant:')) && l.trimEnd().endsWith('...')
      );
      expect(truncatedLine).toBeUndefined();
    });
  });
});
