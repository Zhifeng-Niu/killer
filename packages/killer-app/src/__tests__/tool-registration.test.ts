/**
 * Tool Registration Integration Test
 *
 * Verifies that all tool sources are registered:
 * - killer-app BuiltinTools (memory_store, memory_recall, etc.)
 * - killer-core getBuiltinTools() (web_search, file ops, shell, etc.)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KillerAgent, type AgentConfig } from '../orchestrator/index.js';
import { createLLMProvider } from '../llm/factory.js';
import { getBuiltinTools } from '@killer/core';

function createTestAgent(): KillerAgent {
  const llmProvider = createLLMProvider({ provider: 'mock', apiKey: '', model: undefined });
  const config: AgentConfig = {
    llm: llmProvider,
    sensory: { enabledChannels: [], bufferSize: 10 },
    memory: { dreamingEnabled: false, forgettingEnabled: false },
    prefrontal: { maxPlanSteps: 3, maxConcurrentPlans: 1, riskTolerance: 0.5 },
    evolutionEnabled: false,
    debugLogging: false,
  };
  return new KillerAgent(config);
}

describe('Tool Registration Integration', () => {
  let agent: KillerAgent;

  beforeEach(async () => {
    agent = createTestAgent();
    await agent.boot();
  });

  afterEach(async () => {
    await agent.shutdown();
  });

  it('should register killer-app built-in tools', () => {
    const toolNames = agent.tools.list();

    // killer-app specific tools
    expect(toolNames).toContain('memory_store');
    expect(toolNames).toContain('memory_recall');
    expect(toolNames).toContain('agent_status');
    expect(toolNames).toContain('trigger_dream');
    expect(toolNames).toContain('time');
    expect(toolNames).toContain('calculate');
    expect(toolNames).toContain('plan_goal');
  });

  it('should register killer-core built-in tools', () => {
    const toolNames = agent.tools.list();

    // killer-core tools (from getBuiltinTools)
    expect(toolNames).toContain('web_search');
  });

  it('should have tools from both sources', () => {
    const toolNames = agent.tools.list();

    // 7 app tools + core tools (some may overlap) → should be substantial
    expect(toolNames.length).toBeGreaterThanOrEqual(12);
  });

  it('should list all core tools from getBuiltinTools', () => {
    const coreTools = getBuiltinTools();
    const coreNames = coreTools.map(t => t.name);

    expect(coreNames).toContain('web_search');
    expect(coreNames).toContain('web_fetch');
    expect(coreNames).toContain('read_file');
    expect(coreNames).toContain('write_file');
    expect(coreNames).toContain('list_directory');
    expect(coreNames).toContain('execute_shell');
    expect(coreNames).toContain('synapse_broadcast');
    expect(coreNames).toContain('send_message');
    expect(coreNames.length).toBe(13);
  });
});
