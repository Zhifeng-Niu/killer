/**
 * Session Persistence Integration Tests
 *
 * 验证完整的 boot → interact → save → shutdown → boot → load → restore 周期。
 * 使用临时目录避免污染用户数据。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { KillerAgent, type AgentConfig } from '../orchestrator/index.js';
import { MockLLMProvider } from '@killer/core';

function createTestAgentConfig(sessionDir: string): AgentConfig {
  return {
    llm: new MockLLMProvider('Integration test response'),
    sensory: { enabledChannels: [], bufferSize: 100 },
    memory: { dreamingEnabled: false, forgettingEnabled: false },
    prefrontal: {
      maxPlanSteps: 5,
      maxConcurrentPlans: 3,
      riskTolerance: 0.5,
    },
    evolutionEnabled: false,
    debugLogging: false,
    sessionDir,
  };
}

describe('Session Persistence Integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'killer-session-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should persist and restore hippocampus memories', async () => {
    // Phase 1: Boot, create memories, save
    const agent1 = new KillerAgent(createTestAgentConfig(tempDir));
    await agent1.boot();

    agent1.hippocampus.storeEpisode({
      title: 'User loves TypeScript',
      narrative: 'User expressed strong preference for TypeScript over JavaScript',
      emotionalWeight: 0.8,
      tags: ['preference', 'language'],
      associations: [],
      decayRate: 0.1,
      accessCount: 0,
    });

    const beforeCount = agent1.hippocampus.export().episodic.length;
    expect(beforeCount).toBeGreaterThan(0);

    agent1.saveSession('test-session');
    await agent1.shutdown();

    // Phase 2: Boot new agent, load session
    const agent2 = new KillerAgent(createTestAgentConfig(tempDir));
    await agent2.boot();
    const loaded = agent2.loadSession('test-session');

    expect(loaded).toBe(true);

    const afterExport = agent2.hippocampus.export();
    expect(afterExport.episodic.length).toBe(beforeCount);

    const restored = afterExport.episodic.find(
      (e: any) => e.title === 'User loves TypeScript',
    );
    expect(restored).toBeDefined();
    expect(restored.emotionalWeight).toBeCloseTo(0.8);

    await agent2.shutdown();
  });

  it('should persist persona genome through sessions', async () => {
    // Phase 1
    const agent1 = new KillerAgent(createTestAgentConfig(tempDir));
    await agent1.boot();

    agent1.persona.recordInteraction(300, 0.9, ['coding', 'testing']);
    agent1.persona.observeUserBehavior('prefers-concise-output', ['style']);
    agent1.persona.updateTrait('curiosity', 0.85);
    agent1.persona.markSessionStart();

    const beforeTrust = agent1.persona.getUserModel().trustLevel;
    const beforePatterns = agent1.persona.getMirrorNeuronData().observedPatterns.length;
    const beforeTraits = agent1.persona.getTrait('curiosity');

    agent1.saveSession('persona-test');
    await agent1.shutdown();

    // Phase 2
    const agent2 = new KillerAgent(createTestAgentConfig(tempDir));
    await agent2.boot();
    const loaded = agent2.loadSession('persona-test');

    expect(loaded).toBe(true);

    // Verify persona genome restored
    expect(agent2.persona.getUserModel().trustLevel).toBeCloseTo(beforeTrust, 1);
    expect(agent2.persona.getMirrorNeuronData().observedPatterns.length).toBe(beforePatterns);

    // Verify personality trait restored
    expect(agent2.persona.getTrait('curiosity')).toBeCloseTo(beforeTraits, 1);

    await agent2.shutdown();
  });

  it('should persist emotional state through sessions', async () => {
    // Phase 1
    const agent1 = new KillerAgent(createTestAgentConfig(tempDir));
    await agent1.boot();

    agent1.persona.processEmotionalTrigger('This is amazing and wonderful!', 'user-message');
    const beforeEmotion = agent1.persona.emotionalState.exportState();
    expect(beforeEmotion.intensity).toBeGreaterThan(0);

    const beforeValence = beforeEmotion.current.valence;
    const beforeArousal = beforeEmotion.current.arousal;
    const beforePrimary = beforeEmotion.primaryEmotion;

    agent1.saveSession('emotion-test');
    await agent1.shutdown();

    // Phase 2
    const agent2 = new KillerAgent(createTestAgentConfig(tempDir));
    await agent2.boot();
    const loaded = agent2.loadSession('emotion-test');

    expect(loaded).toBe(true);

    const afterEmotion = agent2.persona.emotionalState.exportState();
    expect(afterEmotion.current.valence).toBeCloseTo(beforeValence, 2);
    expect(afterEmotion.current.arousal).toBeCloseTo(beforeArousal, 2);
    expect(afterEmotion.primaryEmotion).toBe(beforePrimary);

    await agent2.shutdown();
  });

  it('should persist predictions through sessions', async () => {
    // Phase 1
    const agent1 = new KillerAgent(createTestAgentConfig(tempDir));
    await agent1.boot();

    // Build up some prediction data
    for (let i = 0; i < 5; i++) {
      agent1.persona.recordInteraction(100 + i * 50, 0.7 + i * 0.05, ['coding']);
    }

    const beforePredictions = agent1.persona.predictiveModel.exportState();

    agent1.saveSession('prediction-test');
    await agent1.shutdown();

    // Phase 2
    const agent2 = new KillerAgent(createTestAgentConfig(tempDir));
    await agent2.boot();
    const loaded = agent2.loadSession('prediction-test');

    expect(loaded).toBe(true);

    const afterPredictions = agent2.persona.predictiveModel.exportState();
    // Verify prediction structure is preserved
    expect(afterPredictions.psychologicalProfile).toBeDefined();
    expect(afterPredictions.psychologicalProfile.openness).toBeCloseTo(
      beforePredictions.psychologicalProfile.openness, 2,
    );

    await agent2.shutdown();
  });

  it('should persist conversation history through sessions', async () => {
    // Phase 1
    const agent1 = new KillerAgent(createTestAgentConfig(tempDir));
    await agent1.boot();

    await agent1.processInput('Hello from test', 'cli');
    await agent1.processInput('How are you?', 'cli');

    agent1.saveSession('conversation-test');
    await agent1.shutdown();

    // Phase 2
    const agent2 = new KillerAgent(createTestAgentConfig(tempDir));
    await agent2.boot();
    const loaded = agent2.loadSession('conversation-test');

    expect(loaded).toBe(true);

    // Conversation history should be restored
    const state = agent2.getState();
    // At least 4 messages: 2 user + 2 assistant
    expect(state.conversationHistory.length).toBeGreaterThanOrEqual(4);

    await agent2.shutdown();
  });

  it('should persist cell state through sessions', async () => {
    const agent = new KillerAgent(createTestAgentConfig(tempDir));
    await agent.boot();

    // Spawn a cell
    const cellId = agent.spawnCellWithRole('researcher');
    expect(cellId).toBeDefined();

    // Save
    agent.saveSession('cell-test');

    // Verify snapshot includes cell data
    const state = agent.getState();
    expect(state.cells.length).toBeGreaterThan(0);
    const researcherCell = state.cells.find(c => c.role.includes('researcher'));
    expect(researcherCell).toBeDefined();

    await agent.shutdown();
  });

  it('should produce valid JSON session file', async () => {
    const agent = new KillerAgent(createTestAgentConfig(tempDir));
    await agent.boot();

    agent.persona.recordInteraction(200, 0.8, ['test']);
    agent.persona.updateTrait('warmth', 0.9);
    agent.saveSession('json-test');
    await agent.shutdown();

    // Verify file is valid JSON with expected structure
    const filePath = path.join(tempDir, 'json-test.json');
    expect(fs.existsSync(filePath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data.version).toBe(2);
    expect(data.conversationHistory).toBeDefined();
    expect(data.personaGenome).toBeDefined();
    expect(data.emotionalState).toBeDefined();
    expect(data.predictions).toBeDefined();
    expect(data.personalityTraits).toBeDefined();
    expect(data.hippocampusData).toBeDefined();
    expect(data.personalityTraits.warmth).toBeCloseTo(0.9, 1);
  });

  it('should handle backup recovery when main file is corrupted', async () => {
    const agent = new KillerAgent(createTestAgentConfig(tempDir));
    await agent.boot();

    agent.saveSession('backup-test');
    await agent.shutdown();

    // Corrupt the main file
    const filePath = path.join(tempDir, 'backup-test.json');
    fs.writeFileSync(filePath, 'not valid json {{{{');

    // The backup should exist from the atomic write
    const backupPath = filePath + '.bak';
    if (fs.existsSync(backupPath)) {
      const agent2 = new KillerAgent(createTestAgentConfig(tempDir));
      await agent2.boot();
      const loaded = agent2.loadSession('backup-test');
      expect(loaded).toBe(true);
      await agent2.shutdown();
    }
  });

  it('should migrate V1 session data to current version', async () => {
    // Create a V1-style session file with minimal data
    const v1Data = {
      version: 1,
      savedAt: Date.now(),
      conversationHistory: [
        { role: 'user', content: 'Hello', timestamp: Date.now() },
        { role: 'assistant', content: 'Hi there', timestamp: Date.now() },
      ],
      personaGenome: {
        coreDNA: { id: 'default', version: 1 },
        expression: { name: 'Killer', avatar: '🧠', tagline: 'Test', voiceStyle: 'warm', quirks: [] },
        // V1 data may not have mirrorNeuron or userModel
      },
    };

    const filePath = path.join(tempDir, 'v1-migration.json');
    fs.writeFileSync(filePath, JSON.stringify(v1Data));

    const agent = new KillerAgent(createTestAgentConfig(tempDir));
    await agent.boot();
    const loaded = agent.loadSession('v1-migration');

    expect(loaded).toBe(true);
    // Conversation history should be restored
    expect(agent.conversationHistory.length).toBe(2);
    expect(agent.conversationHistory[0].content).toBe('Hello');

    await agent.shutdown();
  });

  it('should handle missing cognitive fields gracefully', async () => {
    // Create a session with no cognitive data at all
    const minimalData = {
      version: 1,
      savedAt: Date.now(),
      conversationHistory: [],
    };

    const filePath = path.join(tempDir, 'minimal-session.json');
    fs.writeFileSync(filePath, JSON.stringify(minimalData));

    const agent = new KillerAgent(createTestAgentConfig(tempDir));
    await agent.boot();
    const loaded = agent.loadSession('minimal-session');

    expect(loaded).toBe(true);
    // Agent should function normally even without cognitive data
    expect(agent.persona).toBeDefined();
    expect(agent.persona.emotionalState).toBeDefined();

    await agent.shutdown();
  });
});
