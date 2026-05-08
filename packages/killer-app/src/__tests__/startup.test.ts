/**
 * Startup Verification Test
 *
 * Verifies the agent can boot, process input, and shut down cleanly
 * using the mock LLM provider (no API key needed).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KillerAgent, type AgentConfig } from '../orchestrator/index.js';
import { createLLMProvider } from '../llm/factory.js';

function createTestAgent(): KillerAgent {
  const llmProvider = createLLMProvider({
    provider: 'mock',
    apiKey: '',
    model: undefined,
  });

  const config: AgentConfig = {
    llm: llmProvider,
    sensory: {
      enabledChannels: [],
      bufferSize: 10,
    },
    memory: {
      dreamingEnabled: false,
      forgettingEnabled: false,
    },
    prefrontal: {
      maxPlanSteps: 3,
      maxConcurrentPlans: 1,
      riskTolerance: 0.5,
    },
    evolutionEnabled: false,
    debugLogging: false,
  };

  return new KillerAgent(config);
}

describe('Startup Verification', () => {
  let agent: KillerAgent;

  beforeEach(async () => {
    agent = createTestAgent();
  });

  afterEach(async () => {
    try {
      await agent.shutdown();
    } catch {
      // Already shut down
    }
  });

  it('should boot and shut down cleanly', async () => {
    await agent.boot();
    const status = agent.getStatus();
    expect(status.running).toBe(true);

    await agent.shutdown();
    const finalStatus = agent.getStatus();
    expect(finalStatus.running).toBe(false);
  });

  it('should process input and return a response', async () => {
    await agent.boot();

    const result = await agent.processInput('Hello, agent!');
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(typeof result.content).toBe('string');
  });

  it('should have all core subsystems after boot', async () => {
    await agent.boot();

    const status = agent.getStatus();
    expect(status.running).toBe(true);
    expect(status.modules).toBeDefined();
    expect(status.modules.brainstem).toBeDefined();
    expect(status.modules.hippocampus).toBeDefined();
    expect(status.modules.prefrontal).toBeDefined();
    expect(status.modules.cortex).toBeDefined();
    expect(status.modules.synapse).toBeDefined();
  });

  it('should have at least one cell (prime) after boot', async () => {
    await agent.boot();

    const cells = agent.getCells();
    expect(cells.length).toBeGreaterThanOrEqual(1);
    // Prime cell should exist (role maps to type)
    const primeCell = cells.find(c => c.role === 'prime');
    expect(primeCell).toBeDefined();
  });

  it('should handle multiple sequential inputs', async () => {
    await agent.boot();

    const r1 = await agent.processInput('First message');
    expect(r1.content).toBeDefined();

    const r2 = await agent.processInput('Second message');
    expect(r2.content).toBeDefined();

    const r3 = await agent.processInput('Third message');
    expect(r3.content).toBeDefined();
  });

  it('should track goals', async () => {
    await agent.boot();

    const goal = agent.createGoal('Test goal', 0.7);
    expect(goal).toBeDefined();
    expect(goal!.description).toBe('Test goal');
    expect(goal!.priority).toBe(0.7);

    const goals = agent.getGoals();
    expect(goals.length).toBeGreaterThanOrEqual(1);
  });

  it('should report memory stats', async () => {
    await agent.boot();

    const stats = agent.getMemoryStats();
    expect(stats).toBeDefined();
    expect(typeof stats.totalEpisodes).toBe('number');
    expect(typeof stats.shortTermCount).toBe('number');
    expect(typeof stats.longTermCount).toBe('number');
  });

  it('should report skills', async () => {
    await agent.boot();

    const skills = agent.getSkills();
    expect(Array.isArray(skills)).toBe(true);
  });

  it('should handle graceful shutdown even after errors', async () => {
    await agent.boot();

    // Process some input (mock provider won't error)
    await agent.processInput('test');

    // Shutdown should not throw even if something goes wrong
    await expect(agent.shutdown()).resolves.toBeUndefined();
  });

  it('should update predictions and validate them over multiple interactions', async () => {
    await agent.boot();

    // First interaction seeds the user model
    await agent.processInput('I need help with coding a Python function');

    // After first interaction, persona should have recorded interaction
    const persona = agent.persona;
    const userModel = persona.getUserModel();
    expect(userModel.interactionSummary.totalInteractions).toBeGreaterThanOrEqual(1);

    // Multiple interactions build up patterns
    await agent.processInput('Can you debug this error in my code?');
    await agent.processInput('I want to learn about testing patterns');

    const updatedModel = persona.getUserModel();
    expect(updatedModel.interactionSummary.totalInteractions).toBeGreaterThanOrEqual(3);

    // Predictive model should have been updated
    const predictions = persona.getPredictions();
    expect(predictions.lastUpdated).toBeGreaterThan(0);
  });

  it('should track prediction accuracy through validation loop', async () => {
    await agent.boot();

    // Seed patterns via multiple interactions
    await agent.processInput('Help me debug a coding error');
    await agent.processInput('Fix this bug in my function');
    await agent.processInput('Write a test for my code');

    // Predictive model should now have predictions with accuracy tracking
    const accuracy = agent.persona.predictiveModel.getPredictionAccuracy();
    // May or may not have validated yet (depends on match),
    // but the mechanism should be wired without errors
    expect(typeof accuracy.overall).toBe('number');
    expect(typeof accuracy.count).toBe('number');
  });

  it('should extract facts from user input into semantic memory', async () => {
    await agent.boot();

    await agent.processInput('My name is Alice and I work as a data scientist');

    const semanticNodes = agent.hippocampus.getSemanticNodesByType('entity');
    // Should have extracted at least the name fact
    expect(semanticNodes.length).toBeGreaterThan(0);

    const nameNode = semanticNodes.find(n =>
      n.properties.field === 'name' || n.label.toLowerCase().includes('alice'),
    );
    expect(nameNode).toBeDefined();
  });

  it('should process input with full cognitive pipeline without errors', async () => {
    await agent.boot();

    // Process multiple inputs to exercise all cognitive layers
    await agent.processInput('Hello, I am working on a project');
    await agent.processInput('Can you help me plan the architecture?');
    const result = await agent.processInput('Tell me about architecture patterns');

    // Should get a valid response through the full pipeline
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();

    // Verify cognitive subsystems have been exercised
    const memoryStats = agent.getMemoryStats();
    expect(memoryStats.totalEpisodes).toBeGreaterThanOrEqual(3);

    const persona = agent.persona;
    expect(persona.getUserModel().interactionSummary.totalInteractions).toBeGreaterThanOrEqual(3);
    expect(persona.getPredictions().lastUpdated).toBeGreaterThan(0);
  });
});
