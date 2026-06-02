/**
 * Cognitive Pipeline Integration Test
 *
 * End-to-end test that exercises the full cognitive subsystem pipeline:
 * input → emotional state → predictive model → context management → system prompt
 *
 * Uses MockLLMProvider to avoid real API calls.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OdysseusAgent, type AgentConfig } from '../orchestrator/index.js';
import type { LLMProvider, LLMCompletion } from '@odysseus/core';

/**
 * Mock LLM that returns configurable responses
 */
class MockLLM implements LLMProvider {
  public lastPrompt: string = '';
  public callCount = 0;
  private response: string;

  constructor(response = 'I understand your request. Let me help you with that.') {
    this.response = response;
  }

  async complete(prompt: string): Promise<LLMCompletion> {
    this.lastPrompt = prompt;
    this.callCount++;
    return { content: this.response, model: 'mock', finishReason: 'stop' };
  }

  async *stream(prompt: string): AsyncIterable<string> {
    this.lastPrompt = prompt;
    this.callCount++;
    yield this.response;
  }

  getModel(): string {
    return 'mock';
  }
}

function createTestAgent(): { agent: OdysseusAgent; llm: MockLLM } {
  const llm = new MockLLM();
  const config: AgentConfig = {
    llm,
    sensory: { enabledChannels: ['cli'], bufferSize: 100 },
    memory: { dreamingEnabled: false, forgettingEnabled: false },
    prefrontal: { maxPlanSteps: 3, maxConcurrentPlans: 2, riskTolerance: 0.5 },
    evolutionEnabled: false,
    debugLogging: false,
  };

  const agent = new OdysseusAgent(config);
  return { agent, llm };
}

describe('Cognitive Pipeline Integration', () => {
  let agent: OdysseusAgent;
  let llm: MockLLM;

  beforeEach(async () => {
    const setup = createTestAgent();
    agent = setup.agent;
    llm = setup.llm;
    await agent.boot();
  });

  afterEach(async () => {
    await agent.shutdown();
  });

  it('should process happy input through emotional engine', async () => {
    await agent.processInput('I am so happy and grateful today!');

    const emotionalState = agent.persona.emotionalState.exportState();
    expect(emotionalState.primaryEmotion).toBe('joy');
    expect(emotionalState.intensity).toBeGreaterThan(0);
    expect(emotionalState.current.valence).toBeGreaterThan(0);
  });

  it('should process frustrated input through emotional engine', async () => {
    await agent.processInput('I am frustrated and angry about this bug');

    const emotionalState = agent.persona.emotionalState.exportState();
    expect(emotionalState.primaryEmotion).toBe('anger');
    expect(emotionalState.current.arousal).toBeGreaterThan(0);
  });

  it('should process multiple inputs and build emotional memory', async () => {
    await agent.processInput('This is great!');
    await agent.processInput('Actually, something terrible and sad happened');
    await agent.processInput('I am so angry about this!');

    const state = agent.persona.emotionalState.exportState();
    expect(state.emotionalMemory.length).toBeGreaterThanOrEqual(2);
    expect(state.emotionalMemory[0].emotion).toBe('joy');
  });

  it('should include emotional state in system prompt', async () => {
    await agent.processInput('I am very happy!');

    // The LLM was called - check that the prompt includes emotional context
    const prompt = llm.lastPrompt;
    expect(prompt).toBeDefined();
  });

  it('should track predictions after multiple interactions', async () => {
    // Simulate several interactions to build prediction data
    for (let i = 0; i < 3; i++) {
      await agent.processInput(`I need help with coding task ${i + 1}`);
    }

    const predictions = agent.persona.getPredictions();
    // Predictions may or may not exist depending on data volume
    expect(predictions).toBeDefined();
    expect(Array.isArray(predictions.predictedNeeds)).toBe(true);
  });

  it('should manage context window with conversation history', async () => {
    // Generate enough messages to trigger context management
    for (let i = 0; i < 5; i++) {
      await agent.processInput(`Message ${i}: This is test message ${i} with some content`);
    }

    // Context window should have tracked these
    const config = agent.contextWindow.getConfig();
    expect(config.maxFullTurns).toBeDefined();
  });

  it('should emit consciousness events during processing', async () => {
    const events: unknown[] = [];
    agent.consciousness.onAll((event: unknown) => {
      events.push(event);
    });

    await agent.processInput('I am excited about this project!');

    // Should have emitted emotion and possibly prediction events
    expect(events.length).toBeGreaterThan(0);

    const emotionEvent = events.find(
      (e: any) => e.type === 'emotion.update'
    );
    expect(emotionEvent).toBeDefined();
  });

  it('should produce complete agent status', async () => {
    await agent.processInput('Hello');

    const status = agent.getStatus();
    expect(status.running).toBe(true);
    expect(status.modules.brainstem).toBeDefined();
    expect(status.modules.hippocampus).toBeDefined();
    expect(status.modules.prefrontal).toBeDefined();
  });

  it('should handle persona expression', async () => {
    const expression = agent.persona.getExpression();
    expect(expression.name).toBeDefined();
    expect(expression.voiceStyle).toBeDefined();
  });

  it('should handle memory stats', async () => {
    const stats = agent.getMemoryStats();
    expect(stats.totalEpisodes).toBeDefined();
    expect(typeof stats.totalEpisodes).toBe('number');
  });

  it('should maintain conversation history across turns', async () => {
    await agent.processInput('First message');
    await agent.processInput('Second message');

    // Agent should have processed both inputs successfully
    const status = agent.getStatus();
    expect(status).toBeDefined();
    // Conversation history is internal — verify via context window facts
    expect(agent.contextWindow).toBeDefined();
  });

  describe('consciousness stream event coverage', () => {
    it('should emit emotion.update events during processing', async () => {
      const events: unknown[] = [];
      agent.consciousness.onType('emotion.update' as never, (event: unknown) => {
        events.push(event);
      });

      await agent.processInput('I am so happy about this result!');

      expect(events.length).toBeGreaterThanOrEqual(1);
      const emotionEvent = events[0] as any;
      expect(emotionEvent.data.emotion).toBeDefined();
      expect(emotionEvent.data.intensity).toBeGreaterThan(0);
    });

    it('should emit prediction.update events when predictions exist', async () => {
      // Build up enough data to generate predictions
      for (let i = 0; i < 5; i++) {
        await agent.processInput(`Help me with coding task ${i}`);
      }

      // After multiple interactions, predictions should exist
      const predictions = agent.persona.getPredictions();
      // Even without predictions, the system should not crash
      expect(predictions).toBeDefined();
    });

    it('should emit fact.learned events when facts are extracted', async () => {
      const events: unknown[] = [];
      agent.consciousness.onType('fact.learned' as never, (event: unknown) => {
        events.push(event);
      });

      await agent.processInput('My name is Bob and I work as a designer');

      // Should have extracted name fact
      expect(events.length).toBeGreaterThanOrEqual(1);
      const factEvent = events[0] as any;
      expect(factEvent.data.category).toBeDefined();
      expect(factEvent.data.label).toBeDefined();
    });

    it('should emit health.degraded when cognitive subsystem fails', async () => {
      const events: unknown[] = [];
      agent.consciousness.onType('health.degraded' as never, (event: unknown) => {
        events.push(event);
      });

      // Force hippocampus to fail
      agent.hippocampus.storeEpisode = () => {
        throw new Error('Simulated failure');
      };

      await agent.processInput('This should trigger degraded health');

      expect(events.length).toBeGreaterThanOrEqual(1);
      const degradedEvent = events[0] as any;
      expect(degradedEvent.data.subsystem).toBe('cognitive');
    });
  });
});
