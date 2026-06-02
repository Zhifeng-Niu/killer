/**
 * Configuration System Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadConfig, initOdysseusDir, type OdysseusConfig } from '../config/index.js';

describe('Configuration System', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save relevant env vars
    for (const key of ['ODYSSEUS_LLM_PROVIDER', 'ODYSSEUS_API_KEY', 'ODYSSEUS_MODEL', 'ODYSSEUS_DEBUG', 'ODYSSEUS_LOG_LEVEL', 'ANTHROPIC_API_KEY']) {
      originalEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    // Restore env vars
    for (const [key, val] of Object.entries(originalEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  });

  it('should return default config when nothing is set', () => {
    // Clear env
    delete process.env.ODYSSEUS_LLM_PROVIDER;
    delete process.env.ODYSSEUS_API_KEY;
    delete process.env.ODYSSEUS_MODEL;
    delete process.env.ODYSSEUS_DEBUG;
    delete process.env.ODYSSEUS_LOG_LEVEL;
    delete process.env.ANTHROPIC_API_KEY;

    const config = loadConfig({ llm: { provider: 'mock', apiKey: 'test' } });
    expect(config.llm.provider).toBe('mock');
    expect(config.agent.debugLogging).toBe(false);
    expect(config.memory.dreamingEnabled).toBe(true);
    expect(config.prefrontal.maxPlanSteps).toBe(10);
  });

  it('should read LLM config from environment', () => {
    process.env.ODYSSEUS_LLM_PROVIDER = 'openai';
    process.env.ODYSSEUS_API_KEY = 'test-key-123';
    process.env.ODYSSEUS_MODEL = 'gpt-4';

    const config = loadConfig();
    expect(config.llm.provider).toBe('openai');
    expect(config.llm.apiKey).toBe('test-key-123');
    expect(config.llm.model).toBe('gpt-4');
  });

  it('should use provider-specific API key as fallback', () => {
    process.env.ODYSSEUS_LLM_PROVIDER = 'anthropic';
    delete process.env.ODYSSEUS_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';

    const config = loadConfig();
    expect(config.llm.apiKey).toBe('anthropic-key');
  });

  it('should read debug config from environment', () => {
    process.env.ODYSSEUS_DEBUG = 'true';
    const config = loadConfig({ llm: { provider: 'mock' } });
    expect(config.agent.debugLogging).toBe(true);
  });

  it('should allow CLI overrides', () => {
    const config = loadConfig({
      agent: { debugLogging: true },
      llm: { provider: 'mock', apiKey: 'test' },
    });
    expect(config.agent.debugLogging).toBe(true);
    expect(config.llm.provider).toBe('mock');
  });

  it('should merge nested config objects', () => {
    const config = loadConfig({
      llm: { provider: 'mock', apiKey: 'test' },
      prefrontal: { riskTolerance: 0.9 },
    });
    expect(config.prefrontal.riskTolerance).toBe(0.9);
    // Other prefrontal fields should keep defaults
    expect(config.prefrontal.maxPlanSteps).toBe(10);
  });

  it('should init .odysseus directory', () => {
    const tmpDir = path.join(os.tmpdir(), `odysseus-test-${Date.now()}`);
    try {
      const dir = initOdysseusDir(tmpDir);

      expect(fs.existsSync(dir)).toBe(true);
      expect(fs.existsSync(path.join(dir, 'config.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'sessions'))).toBe(true);

      // Config should be valid JSON
      const content = fs.readFileSync(path.join(dir, 'config.json'), 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.llm).toBeDefined();
    } finally {
      // Cleanup
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should not overwrite existing config on init', () => {
    const tmpDir = path.join(os.tmpdir(), `odysseus-test-${Date.now()}`);
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
      const configPath = path.join(tmpDir, 'config.json');
      fs.writeFileSync(configPath, '{"llm":{"provider":"openai"}}', 'utf-8');

      initOdysseusDir(tmpDir);

      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toBe('{"llm":{"provider":"openai"}}');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('Config Validation', () => {
    it('should reject invalid LLM provider', () => {
      expect(() => loadConfig({ llm: { provider: 'invalid_provider', apiKey: 'test' } }))
        .toThrow('Invalid LLM provider "invalid_provider"');
    });

    it('should return config with empty apiKey for non-mock provider (main.ts handles fallback)', () => {
      delete process.env.ODYSSEUS_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      const config = loadConfig({ llm: { provider: 'anthropic' } });
      // loadConfig 不再 throw — mock fallback 由 main.ts 的 validateConfig 处理
      expect(config.llm.provider).toBe('anthropic');
      expect(config.llm.apiKey).toBe('');
    });

    it('should allow mock provider without API key', () => {
      const config = loadConfig({ llm: { provider: 'mock' } });
      expect(config.llm.provider).toBe('mock');
    });

    it('should reject temperature out of range', () => {
      expect(() => loadConfig({ llm: { provider: 'mock', temperature: 1.5 } }))
        .toThrow('Invalid temperature');
      expect(() => loadConfig({ llm: { provider: 'mock', temperature: -0.1 } }))
        .toThrow('Invalid temperature');
    });

    it('should reject non-positive maxTokens', () => {
      expect(() => loadConfig({ llm: { provider: 'mock', maxTokens: 0 } }))
        .toThrow('Invalid maxTokens');
      expect(() => loadConfig({ llm: { provider: 'mock', maxTokens: -100 } }))
        .toThrow('Invalid maxTokens');
    });

    it('should reject invalid webhook port', () => {
      expect(() => loadConfig({ llm: { provider: 'mock' }, sensory: { enabledChannels: ['cli'], bufferSize: 100, webhook: { port: 0 } } }))
        .toThrow('Invalid webhook port');
      expect(() => loadConfig({ llm: { provider: 'mock' }, sensory: { enabledChannels: ['cli'], bufferSize: 100, webhook: { port: 99999 } } }))
        .toThrow('Invalid webhook port');
    });

    it('should reject invalid log level', () => {
      expect(() => loadConfig({ llm: { provider: 'mock' }, logging: { level: 'verbose' } }))
        .toThrow('Invalid log level');
    });

    it('should accept all valid providers', () => {
      for (const provider of ['anthropic', 'openai', 'openrouter', 'mock']) {
        const config = loadConfig({ llm: { provider, apiKey: provider === 'mock' ? undefined : 'test' } });
        expect(config.llm.provider).toBe(provider);
      }
    });
  });
});
