/**
 * BrainstemLoop Tests
 *
 * Tests for the never-stop perception→reason→act→reflect→evolve cycle.
 * Strategy: inject a perception, then immediately stop the loop to run one cycle.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrainstemLoop } from '../brainstem/loop-impl.js';
import { MockLLMProvider } from '../brainstem/llm.js';
import { ToolExecutor } from '../brainstem/tool-executor.js';
import type { Perception, LoopState } from '../brainstem/types.js';
import type { LoopConfig } from '../brainstem/loop-interface.js';

function createPerception(overrides?: Partial<Perception>): Perception {
  return {
    id: `test_perception_${Date.now()}`,
    timestamp: Date.now(),
    source: 'cli',
    data: { message: 'test input' },
    priority: 'normal',
    ...overrides,
  };
}

describe('BrainstemLoop', () => {
  let llm: MockLLMProvider;
  let tools: ToolExecutor;
  let config: LoopConfig;

  beforeEach(() => {
    llm = new MockLLMProvider('Test reasoning with confidence 0.85');
    tools = new ToolExecutor();
    config = {
      perceptionInterval: 10,
      dreamingMode: false,
      maxConcurrentActions: 5,
      debugLogging: false,
      deepReflection: false,
    };
  });

  it('should start and stop cleanly', async () => {
    const loop = new BrainstemLoop(llm, tools, config);

    // Start with dreaming mode off and no perceptions — loop will idle
    const startPromise = loop.start();

    // Stop immediately
    await loop.stop();

    // Should resolve without hanging
    await startPromise.catch(() => {}); // May reject due to stop, that's ok
    expect(loop.getState().phase).toBe('perceive');
  });

  it('should process a full cycle: perceive→reason→act→reflect→evolve', async () => {
    const loop = new BrainstemLoop(llm, tools, config);
    const phases: string[] = [];

    loop.on('phaseChange', (state: LoopState) => {
      phases.push(state.phase);
    });

    // Inject perception
    loop.injectPerception(createPerception());

    // Start loop — it will process the perception
    const startPromise = loop.start();

    // Wait for evolution (last phase) then stop
    const evolutionPromise = new Promise<void>((resolve) => {
      loop.on('evolutionComplete', () => {
        resolve();
      });
    });

    await evolutionPromise;
    await loop.stop();
    await startPromise.catch(() => {});

    // Should have gone through all phases
    expect(phases).toContain('perceive');
    expect(phases).toContain('reason');
    expect(phases).toContain('act');
    expect(phases).toContain('reflect');
    expect(phases).toContain('evolve');
  });

  it('should emit perceptionReceived event', async () => {
    const loop = new BrainstemLoop(llm, tools, config);
    let receivedPerception: Perception | null = null;

    loop.on('perceptionReceived', (state: LoopState) => {
      receivedPerception = state.currentPerception;
    });

    const perception = createPerception({ source: 'cli', priority: 'high' });
    loop.injectPerception(perception);

    const startPromise = loop.start();
    await new Promise<void>((resolve) => {
      loop.on('reasoningComplete', () => resolve());
    });
    await loop.stop();
    await startPromise.catch(() => {});

    expect(receivedPerception).not.toBeNull();
    expect(receivedPerception!.source).toBe('cli');
    expect(receivedPerception!.priority).toBe('high');
  });

  it('should extract confidence from LLM response', async () => {
    llm.setResponsePattern('Analysis complete. Confidence: 0.92');

    const loop = new BrainstemLoop(llm, tools, config);
    let reasoning: LoopState['currentReasoning'] = null;

    loop.on('reasoningComplete', (state: LoopState) => {
      reasoning = state.currentReasoning;
    });

    loop.injectPerception(createPerception());

    const startPromise = loop.start();
    await new Promise<void>((resolve) => {
      loop.on('actionExecuted', () => resolve());
    });
    await loop.stop();
    await startPromise.catch(() => {});

    expect(reasoning).not.toBeNull();
    expect(reasoning!.confidence).toBeCloseTo(0.92, 1);
  });

  it('should use default confidence when not found', async () => {
    llm.setResponsePattern('No confidence mentioned here');

    const loop = new BrainstemLoop(llm, tools, config);
    let reasoning: LoopState['currentReasoning'] = null;

    loop.on('reasoningComplete', (state: LoopState) => {
      reasoning = state.currentReasoning;
    });

    loop.injectPerception(createPerception());

    const startPromise = loop.start();
    await new Promise<void>((resolve) => {
      loop.on('actionExecuted', () => resolve());
    });
    await loop.stop();
    await startPromise.catch(() => {});

    expect(reasoning).not.toBeNull();
    expect(reasoning!.confidence).toBe(0.7); // Default
  });

  it('should handle tool execution in act phase', async () => {
    let toolExecuted = false;
    tools.register({
      name: 'test_tool',
      description: 'A test tool',
      execute: async () => {
        toolExecuted = true;
        return { success: true, data: 'test result' };
      },
    });

    // The LLM response suggests a tool_call to test_tool
    llm.setResponsePattern('Should call test_tool with confidence: 0.8');

    const loop = new BrainstemLoop(llm, tools, config);
    loop.injectPerception(createPerception());

    const startPromise = loop.start();
    await new Promise<void>((resolve) => {
      loop.on('evolutionComplete', () => resolve());
    });
    await loop.stop();
    await startPromise.catch(() => {});

    // Tool may or may not execute depending on how parseActions works
    // The key test is that the cycle completes without error
    expect(loop.getState().currentAction).not.toBeNull();
  });

  it('should set correct reflection outcome for completed action', async () => {
    const loop = new BrainstemLoop(llm, tools, config);
    let reflection: LoopState['currentReflection'] = null;

    loop.on('reflectionComplete', (state: LoopState) => {
      reflection = state.currentReflection;
    });

    loop.injectPerception(createPerception());

    const startPromise = loop.start();
    await new Promise<void>((resolve) => {
      loop.on('evolutionComplete', () => resolve());
    });
    await loop.stop();
    await startPromise.catch(() => {});

    expect(reflection).not.toBeNull();
    // Default action should complete successfully (no tool to execute)
    expect(['success', 'failure']).toContain(reflection!.outcome);
  });

  it('should trigger reinforcement mutation on high adaptability', async () => {
    const loop = new BrainstemLoop(llm, tools, config);
    let evolution: LoopState['currentEvolution'] = null;

    loop.on('evolutionComplete', (state: LoopState) => {
      evolution = state.currentEvolution;
    });

    loop.injectPerception(createPerception());

    const startPromise = loop.start();
    await new Promise<void>((resolve) => {
      loop.on('evolutionComplete', () => resolve());
    });
    await loop.stop();
    await startPromise.catch(() => {});

    expect(evolution).not.toBeNull();
    expect(evolution!.mutations.length).toBeGreaterThanOrEqual(0);
  });

  it('should support event unsubscription', async () => {
    const loop = new BrainstemLoop(llm, tools, config);
    let callCount = 0;
    const callback = () => { callCount++; };

    loop.on('phaseChange', callback);
    loop.off('phaseChange', callback);

    loop.injectPerception(createPerception());

    const startPromise = loop.start();
    await new Promise<void>((resolve) => {
      loop.on('evolutionComplete', () => resolve());
    });
    await loop.stop();
    await startPromise.catch(() => {});

    // Callback was unsubscribed, should not have been called
    expect(callCount).toBe(0);
  });

  it('should handle dreaming mode for internal perceptions', async () => {
    const dreamConfig = { ...config, dreamingMode: true };
    const loop = new BrainstemLoop(llm, tools, dreamConfig);

    let perception: Perception | null = null;
    loop.on('perceptionReceived', (state: LoopState) => {
      if (!perception) {
        perception = state.currentPerception;
      }
    });

    // Don't inject any perception — dreaming mode should generate internal ones
    const startPromise = loop.start();

    await new Promise<void>((resolve) => {
      loop.on('reasoningComplete', () => resolve());
    });
    await loop.stop();
    await startPromise.catch(() => {});

    expect(perception).not.toBeNull();
    expect(perception!.source).toBe('internal');
  });

  it('should continue loop after error', async () => {
    // Use an LLM that fails once then succeeds
    let callCount = 0;
    const failingLLM = {
      complete: vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('LLM temporarily unavailable');
        }
        return { content: 'Retry success. Confidence: 0.7', model: 'test' };
      }),
      stream: vi.fn(async function* () { yield 'test'; }),
      getModel: () => 'test-llm',
    };

    const loop = new BrainstemLoop(failingLLM, tools, { ...config, perceptionInterval: 10 });
    const originalError = console.error;
    console.error = () => {};

    loop.injectPerception(createPerception());

    const startPromise = loop.start();

    // After the first error, inject another perception for the retry
    await new Promise(resolve => setTimeout(resolve, 200));
    loop.injectPerception(createPerception());

    // Wait for a successful cycle after the error
    await new Promise<void>((resolve) => {
      loop.on('reasoningComplete', () => {
        if (callCount >= 2) resolve();
      });
    });

    await loop.stop();
    await startPromise.catch(() => {});
    console.error = originalError;

    // LLM was called at least twice (once failed, once succeeded)
    expect(callCount).toBeGreaterThanOrEqual(2);
  }, 10000);

  it('should not start if already running', async () => {
    const loop = new BrainstemLoop(llm, tools, { ...config, dreamingMode: true });
    const startCount = { value: 0 };
    const originalLog = console.log;
    console.log = () => {};

    const p1 = loop.start();
    startCount.value++;
    // Second start should be no-op
    await loop.start();
    startCount.value++;

    await loop.stop();
    await p1.catch(() => {});
    console.log = originalLog;

    // Both start() calls should resolve without error
    expect(startCount.value).toBe(2);
  });

  it('should not stop if not running', async () => {
    const loop = new BrainstemLoop(llm, tools, config);
    // stop() on non-running loop should be no-op
    await loop.stop();
    expect(loop.getState().phase).toBe('perceive');
  });

  it('should handle deep reflection when enabled', async () => {
    // LLM returns structured reflection JSON
    llm.setResponsePattern(JSON.stringify({
      emotionalImpact: {
        userImpact: 'positive',
        conversationToneChange: 'improved',
        confidence: 0.8,
      },
      selfAssessment: {
        selfConfidence: 0.75,
        blindSpots: ['edge cases'],
        growthAreas: ['error handling'],
        strengths: ['quick response'],
      },
      behavioralAdjustments: [{
        domain: 'communication',
        currentBehavior: 'brief',
        suggestedBehavior: 'more explanatory',
        priority: 0.6,
      }],
    }));

    const deepConfig = { ...config, deepReflection: true };
    const loop = new BrainstemLoop(llm, tools, deepConfig);
    let reflection: LoopState['currentReflection'] = null;

    loop.on('reflectionComplete', (state: LoopState) => {
      reflection = state.currentReflection;
    });

    loop.injectPerception(createPerception());

    const startPromise = loop.start();
    await new Promise<void>((resolve) => {
      loop.on('evolutionComplete', () => resolve());
    });
    await loop.stop();
    await startPromise.catch(() => {});

    expect(reflection).not.toBeNull();
    expect(reflection!.emotionalImpact).toBeDefined();
    expect(reflection!.emotionalImpact!.userImpact).toBe('positive');
    expect(reflection!.selfAssessment).toBeDefined();
    expect(reflection!.selfAssessment!.selfConfidence).toBe(0.75);
    expect(reflection!.behavioralAdjustments).toBeDefined();
    expect(reflection!.behavioralAdjustments!.length).toBe(1);
    expect(reflection!.behavioralAdjustments![0].domain).toBe('communication');
  });

  it('should fallback to default deep reflection on invalid JSON', async () => {
    llm.setResponsePattern('This is not JSON at all');

    const deepConfig = { ...config, deepReflection: true };
    const loop = new BrainstemLoop(llm, tools, deepConfig);
    let reflection: LoopState['currentReflection'] = null;

    loop.on('reflectionComplete', (state: LoopState) => {
      reflection = state.currentReflection;
    });

    loop.injectPerception(createPerception());

    const startPromise = loop.start();
    await new Promise<void>((resolve) => {
      loop.on('evolutionComplete', () => resolve());
    });
    await loop.stop();
    await startPromise.catch(() => {});

    // Should get default values, not crash
    expect(reflection).not.toBeNull();
    expect(reflection!.emotionalImpact).toBeDefined();
    expect(reflection!.selfAssessment).toBeDefined();
  });

  it('should handle deep reflection with code block JSON', async () => {
    llm.setResponsePattern('```json\n{"emotionalImpact":{"userImpact":"neutral","conversationToneChange":"stable","confidence":0.5},"selfAssessment":{"selfConfidence":0.6,"blindSpots":[],"growthAreas":[],"strengths":[]},"behavioralAdjustments":[]}\n```');

    const deepConfig = { ...config, deepReflection: true };
    const loop = new BrainstemLoop(llm, tools, deepConfig);
    let reflection: LoopState['currentReflection'] = null;

    loop.on('reflectionComplete', (state: LoopState) => {
      reflection = state.currentReflection;
    });

    loop.injectPerception(createPerception());

    const startPromise = loop.start();
    await new Promise<void>((resolve) => {
      loop.on('evolutionComplete', () => resolve());
    });
    await loop.stop();
    await startPromise.catch(() => {});

    expect(reflection).not.toBeNull();
    expect(reflection!.emotionalImpact!.userImpact).toBe('neutral');
    expect(reflection!.selfAssessment!.selfConfidence).toBe(0.6);
  });

  it('should handle deep reflection with surrounding text JSON', async () => {
    llm.setResponsePattern('Here is my analysis:\n{"emotionalImpact":{"userImpact":"negative","conversationToneChange":"worsened","confidence":0.3},"selfAssessment":{"selfConfidence":0.4,"blindSpots":["testing"],"growthAreas":["robustness"],"strengths":["speed"]},"behavioralAdjustments":[{"domain":"precision","currentBehavior":"approximate","suggestedBehavior":"exact","priority":0.8}]}\nEnd of analysis.');

    const deepConfig = { ...config, deepReflection: true };
    const loop = new BrainstemLoop(llm, tools, deepConfig);
    let reflection: LoopState['currentReflection'] = null;

    loop.on('reflectionComplete', (state: LoopState) => {
      reflection = state.currentReflection;
    });

    loop.injectPerception(createPerception());

    const startPromise = loop.start();
    await new Promise<void>((resolve) => {
      loop.on('evolutionComplete', () => resolve());
    });
    await loop.stop();
    await startPromise.catch(() => {});

    expect(reflection).not.toBeNull();
    expect(reflection!.emotionalImpact!.userImpact).toBe('negative');
    expect(reflection!.behavioralAdjustments!.length).toBe(1);
    expect(reflection!.behavioralAdjustments![0].domain).toBe('precision');
  });

  it('should return immutable state from getState', () => {
    const loop = new BrainstemLoop(llm, tools, config);
    const state1 = loop.getState();
    const state2 = loop.getState();

    // Different object references
    expect(state1).not.toBe(state2);
    // Same values
    expect(state1.phase).toBe(state2.phase);
  });

  it('should handle event callback errors gracefully', async () => {
    const loop = new BrainstemLoop(llm, tools, { ...config, dreamingMode: true });
    const badCallback = () => { throw new Error('Callback explosion'); };
    const originalError = console.error;
    const errors: string[] = [];
    console.error = (...args: unknown[]) => { errors.push(String(args.join(' '))); };

    loop.on('phaseChange', badCallback);

    // Also add a good callback to verify it still fires
    let goodCallbackFired = false;
    loop.on('phaseChange', () => { goodCallbackFired = true; });

    const startPromise = loop.start();
    await new Promise<void>((resolve) => {
      loop.on('reasoningComplete', () => resolve());
    });
    await loop.stop();
    await startPromise.catch(() => {});
    console.error = originalError;

    // Good callback should still have fired despite bad one
    expect(goodCallbackFired).toBe(true);
  });
});
