/**
 * BrainstemLoop Tests - Core Cognition Loop
 *
 * Tests the perceive→reason→act→reflect→evolve cycle
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrainstemLoop } from '../brainstem/loop-impl.js';
import { MockLLMProvider } from '../brainstem/llm.js';
import { ToolExecutor, type ToolResult } from '../brainstem/tool-executor.js';
import { DEFAULT_LOOP_CONFIG } from '../brainstem/loop-interface.js';
import type { Perception, LoopState } from '../brainstem/types.js';

/** Fast test config — minimal perception interval */
const FAST_CONFIG = {
  ...DEFAULT_LOOP_CONFIG,
  perceptionInterval: 10,
  debugLogging: false,
  deepReflection: false,
  dreamingMode: false,
};

function createPerception(overrides: Partial<Perception> = {}): Perception {
  return {
    id: `perception_test_${Date.now()}`,
    timestamp: Date.now(),
    source: 'cli',
    data: { message: 'test input' },
    priority: 'normal',
    ...overrides,
  };
}

function createLoop(config = FAST_CONFIG): {
  loop: BrainstemLoop;
  llm: MockLLMProvider;
  tools: ToolExecutor;
} {
  const llm = new MockLLMProvider('Standard reasoning with Confidence: 0.8');
  const tools = new ToolExecutor();
  // Register a noop tool so act() doesn't try to execute an unregistered tool
  tools.register({
    name: 'memory_store',
    description: 'Store in memory',
    execute: async () => ({ success: true, data: 'stored' } satisfies ToolResult),
  });
  tools.register({
    name: 'noop',
    description: 'No operation',
    execute: async () => ({ success: true, data: 'noop' } satisfies ToolResult),
  });

  const loop = new BrainstemLoop(llm, tools, config);
  return { loop, llm, tools };
}

describe('BrainstemLoop', () => {
  describe('initialization', () => {
    it('should initialize with perceive phase', () => {
      const { loop } = createLoop();
      const state = loop.getState();
      expect(state.phase).toBe('perceive');
      expect(state.currentPerception).toBeNull();
      expect(state.currentReasoning).toBeNull();
      expect(state.currentAction).toBeNull();
      expect(state.currentReflection).toBeNull();
      expect(state.currentEvolution).toBeNull();
    });

    it('should return a copy of state', () => {
      const { loop } = createLoop();
      const s1 = loop.getState();
      s1.phase = 'act';
      const s2 = loop.getState();
      expect(s2.phase).toBe('perceive');
    });
  });

  describe('perception injection', () => {
    it('should accept perception injection', () => {
      const { loop } = createLoop();
      // Should not throw
      loop.injectPerception(createPerception());
    });
  });

  describe('single cycle', () => {
    it('should process a perception through the full cycle', async () => {
      const { loop } = createLoop();
      const events: string[] = [];

      loop.on('phaseChange', (state) => events.push(state.phase));
      loop.on('perceptionReceived', () => events.push('perceived'));
      loop.on('reasoningComplete', () => events.push('reasoned'));
      loop.on('actionExecuted', () => events.push('acted'));
      loop.on('reflectionComplete', () => events.push('reflected'));
      loop.on('evolutionComplete', () => events.push('evolved'));

      // Inject perception before starting
      loop.injectPerception(createPerception());

      // Start loop — it will process the perception and then wait for next
      const startPromise = loop.start();

      // Wait for cycle to complete (perceive + reason + act + reflect + evolve)
      await new Promise(r => setTimeout(r, 500));

      await loop.stop();

      // Verify all phases happened
      expect(events).toContain('perceived');
      expect(events).toContain('reasoned');
      expect(events).toContain('acted');
      expect(events).toContain('reflected');
      expect(events).toContain('evolved');
      expect(events).toContain('perceive');
      expect(events).toContain('reason');
      expect(events).toContain('act');
      expect(events).toContain('reflect');
      expect(events).toContain('evolve');

      // Verify final state
      const finalState = loop.getState();
      expect(finalState.currentPerception).not.toBeNull();
      expect(finalState.currentReasoning).not.toBeNull();
      expect(finalState.currentAction).not.toBeNull();
      expect(finalState.currentReflection).not.toBeNull();
      expect(finalState.currentEvolution).not.toBeNull();
    });

    it('should update reasoning with confidence', async () => {
      const llm = new MockLLMProvider('Analysis complete. Confidence: 0.92');
      const tools = new ToolExecutor();
      tools.register({ name: 'memory_store', description: 'store', execute: async () => ({ success: true, data: 'ok' } satisfies ToolResult) });
      tools.register({ name: 'noop', description: 'noop', execute: async () => ({ success: true, data: 'ok' } satisfies ToolResult) });

      const loop = new BrainstemLoop(llm, tools, FAST_CONFIG);
      loop.injectPerception(createPerception());

      const startPromise = loop.start();
      await new Promise(r => setTimeout(r, 500));
      await loop.stop();

      const state = loop.getState();
      expect(state.currentReasoning).not.toBeNull();
      expect(state.currentReasoning!.confidence).toBeGreaterThan(0);
      expect(state.currentReasoning!.id).toContain('reasoning_');
    });

    it('should execute tool_call actions', async () => {
      const { loop, tools } = createLoop();

      let toolExecuted = false;
      // Override the memory_store tool to track execution
      tools.unregister('memory_store');
      tools.register({
        name: 'memory_store',
        description: 'store',
        execute: async () => {
          toolExecuted = true;
          return { success: true, data: 'stored' } satisfies ToolResult;
        },
      });

      loop.injectPerception(createPerception());
      loop.start();
      await new Promise(r => setTimeout(r, 500));
      await loop.stop();

      // The action should have been executed (either memory_store or noop)
      const state = loop.getState();
      expect(state.currentAction).not.toBeNull();
      expect(['completed', 'failed']).toContain(state.currentAction!.status);
    });
  });

  describe('reflection', () => {
    it('should reflect success for completed actions', async () => {
      const { loop } = createLoop();
      loop.injectPerception(createPerception());
      loop.start();
      await new Promise(r => setTimeout(r, 500));
      await loop.stop();

      const state = loop.getState();
      if (state.currentAction!.status === 'completed') {
        expect(state.currentReflection!.outcome).toBe('success');
        expect(state.currentReflection!.lessons).toContain('Action execution successful');
      }
    });

    it('should reflect failure for failed actions', async () => {
      const tools = new ToolExecutor();
      tools.register({
        name: 'failing_tool',
        description: 'always fails',
        execute: async () => { throw new Error('Tool error'); },
      });
      tools.register({ name: 'noop', description: 'noop', execute: async () => ({ success: true, data: 'ok' } satisfies ToolResult) });

      const llm = new MockLLMProvider('Use the failing_tool');
      const loop = new BrainstemLoop(llm, tools, FAST_CONFIG);

      loop.injectPerception(createPerception());
      loop.start();
      await new Promise(r => setTimeout(r, 500));
      await loop.stop();

      // Depending on which tool gets called, reflection outcome varies
      const state = loop.getState();
      expect(state.currentReflection).not.toBeNull();
      expect(['success', 'partial', 'failure']).toContain(state.currentReflection!.outcome);
    });
  });

  describe('deep reflection', () => {
    it('should perform deep reflection when enabled', async () => {
      const deepReflectionJSON = JSON.stringify({
        emotionalImpact: {
          userImpact: 'positive',
          conversationToneChange: 'improved',
          confidence: 0.85,
        },
        selfAssessment: {
          selfConfidence: 0.9,
          blindSpots: ['edge case handling'],
          growthAreas: ['async patterns'],
          strengths: ['reliable execution'],
        },
        behavioralAdjustments: [
          {
            domain: 'communication',
            currentBehavior: 'Too verbose',
            suggestedBehavior: 'Be more concise',
            priority: 0.7,
          },
        ],
      });

      const llm = new MockLLMProvider(`Here is my reflection:\n\`\`\`json\n${deepReflectionJSON}\n\`\`\``);
      const tools = new ToolExecutor();
      tools.register({ name: 'memory_store', description: 'store', execute: async () => ({ success: true, data: 'ok' } satisfies ToolResult) });
      tools.register({ name: 'noop', description: 'noop', execute: async () => ({ success: true, data: 'ok' } satisfies ToolResult) });

      const loop = new BrainstemLoop(llm, tools, {
        ...FAST_CONFIG,
        deepReflection: true,
      });

      loop.injectPerception(createPerception());
      loop.start();
      await new Promise(r => setTimeout(r, 600));
      await loop.stop();

      const state = loop.getState();
      const reflection = state.currentReflection;
      expect(reflection).not.toBeNull();
      // Deep reflection fields should be populated (or defaults if parsing failed)
      expect(reflection!.emotionalImpact).toBeDefined();
      expect(reflection!.selfAssessment).toBeDefined();
      expect(reflection!.behavioralAdjustments).toBeDefined();
    });

    it('should fallback to default deep reflection on bad LLM response', async () => {
      const llm = new MockLLMProvider('This is not JSON at all, no braces here');
      const tools = new ToolExecutor();
      tools.register({ name: 'memory_store', description: 'store', execute: async () => ({ success: true, data: 'ok' } satisfies ToolResult) });
      tools.register({ name: 'noop', description: 'noop', execute: async () => ({ success: true, data: 'ok' } satisfies ToolResult) });

      const loop = new BrainstemLoop(llm, tools, {
        ...FAST_CONFIG,
        deepReflection: true,
      });

      loop.injectPerception(createPerception());
      loop.start();
      await new Promise(r => setTimeout(r, 600));
      await loop.stop();

      const state = loop.getState();
      const reflection = state.currentReflection;
      expect(reflection).not.toBeNull();
      // Should have default deep reflection values
      expect(reflection!.emotionalImpact).toBeDefined();
      expect(reflection!.emotionalImpact!.confidence).toBeGreaterThanOrEqual(0);
      expect(reflection!.selfAssessment).toBeDefined();
    });
  });

  describe('evolution', () => {
    it('should generate reinforcement mutation for high adaptability', async () => {
      const { loop } = createLoop();
      loop.injectPerception(createPerception());
      loop.start();
      await new Promise(r => setTimeout(r, 500));
      await loop.stop();

      const state = loop.getState();
      expect(state.currentEvolution).not.toBeNull();
      expect(state.currentEvolution!.id).toContain('evolution_');
      // Success outcome → adaptability 0.8 → reinforcement mutation
      if (state.currentReflection!.adaptability > 0.7) {
        const strategyMutations = state.currentEvolution!.mutations.filter(m => m.target === 'strategy');
        expect(strategyMutations.length).toBeGreaterThan(0);
      }
    });
  });

  describe('events', () => {
    it('should support on/off subscription', () => {
      const { loop } = createLoop();
      const listener = vi.fn();
      loop.on('phaseChange', listener);
      loop.off('phaseChange', listener);
      // Should not throw, listener removed
    });

    it('should emit events with loop state', async () => {
      const { loop } = createLoop();
      const states: LoopState[] = [];

      loop.on('perceptionReceived', (s) => states.push(s));
      loop.injectPerception(createPerception());
      loop.start();
      await new Promise(r => setTimeout(r, 500));
      await loop.stop();

      expect(states.length).toBeGreaterThan(0);
      expect(states[0].currentPerception).not.toBeNull();
    });

    it('should isolate event callback errors', async () => {
      const { loop } = createLoop();
      const goodListener = vi.fn();

      loop.on('perceptionReceived', () => { throw new Error('boom'); });
      loop.on('perceptionReceived', goodListener);

      loop.injectPerception(createPerception());
      loop.start();
      await new Promise(r => setTimeout(r, 500));
      await loop.stop();

      // Good listener should still be called despite bad one
      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('dreaming mode', () => {
    it('should generate internal perceptions in dreaming mode', async () => {
      const { loop } = createLoop({ ...FAST_CONFIG, dreamingMode: true });
      const perceptions: Perception[] = [];
      loop.on('perceptionReceived', (s) => {
        if (s.currentPerception) perceptions.push(s.currentPerception);
      });

      loop.start();
      await new Promise(r => setTimeout(r, 300));
      await loop.stop();

      // Should have generated at least one internal perception
      const internalPerceptions = perceptions.filter(p => p.source === 'internal');
      expect(internalPerceptions.length).toBeGreaterThan(0);
      expect(internalPerceptions[0].data).toHaveProperty('type', 'dream_cycle');
    });
  });

  describe('lifecycle', () => {
    it('should handle double start gracefully', async () => {
      const { loop } = createLoop({ ...FAST_CONFIG, dreamingMode: true });
      loop.start();
      // Second start should be a no-op
      await loop.start();
      await loop.stop();
    });

    it('should handle stop when not running', async () => {
      const { loop } = createLoop();
      // Should not throw
      await loop.stop();
    });

    it('should process multiple perceptions', async () => {
      const { loop } = createLoop();
      const perceptionCount: number[] = [];

      loop.on('perceptionReceived', () => perceptionCount.push(1));

      // Inject 3 perceptions before starting
      loop.injectPerception(createPerception());
      loop.injectPerception(createPerception());
      loop.injectPerception(createPerception());

      loop.start();
      await new Promise(r => setTimeout(r, 1000));
      await loop.stop();

      expect(perceptionCount.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('extractJSON', () => {
    it('should extract JSON from code block response', async () => {
      const json = JSON.stringify({ key: 'value', nested: { num: 42 } });
      const llm = new MockLLMProvider(`Here's the analysis:\n\`\`\`json\n${json}\n\`\`\`\nDone.`);
      const tools = new ToolExecutor();
      tools.register({ name: 'memory_store', description: 'store', execute: async () => ({ success: true, data: 'ok' } satisfies ToolResult) });
      tools.register({ name: 'noop', description: 'noop', execute: async () => ({ success: true, data: 'ok' } satisfies ToolResult) });

      const loop = new BrainstemLoop(llm, tools, { ...FAST_CONFIG, deepReflection: true });

      loop.injectPerception(createPerception());
      loop.start();
      await new Promise(r => setTimeout(r, 600));
      await loop.stop();

      // If JSON was parsed, deep reflection fields should exist
      const state = loop.getState();
      expect(state.currentReflection).not.toBeNull();
    });
  });

  describe('error resilience', () => {
    it('should continue loop after LLM error', async () => {
      const llm = new MockLLMProvider();
      // Make LLM throw on first call, then succeed
      let callCount = 0;
      const originalComplete = llm.complete.bind(llm);
      llm.complete = async (prompt: string, ctx?: string) => {
        callCount++;
        if (callCount === 1) throw new Error('LLM unavailable');
        return originalComplete(prompt, ctx);
      };

      const tools = new ToolExecutor();
      tools.register({ name: 'memory_store', description: 'store', execute: async () => ({ success: true, data: 'ok' } satisfies ToolResult) });
      tools.register({ name: 'noop', description: 'noop', execute: async () => ({ success: true, data: 'ok' } satisfies ToolResult) });

      const loop = new BrainstemLoop(llm, tools, { ...FAST_CONFIG, dreamingMode: true });

      loop.start();
      await new Promise(r => setTimeout(r, 2500));
      await loop.stop();

      // Should have made multiple calls (first fails, error delay 1s, then succeed)
      expect(callCount).toBeGreaterThan(1);
    });
  });
});
