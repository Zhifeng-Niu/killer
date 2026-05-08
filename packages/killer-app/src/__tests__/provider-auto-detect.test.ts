/**
 * Provider Auto-Detection Tests
 *
 * 验证当用户只设了 API key 而没设 KILLER_LLM_PROVIDER 时，
 * 系统能自动推断正确的 provider。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// 所有需要清理的环境变量
const ENV_KEYS = [
  'KILLER_LLM_PROVIDER',
  'KILLER_API_KEY',
  'DEEPSEEK_API_KEY',
  'GLM_API_KEY',
  'ZHIPU_API_KEY',
  'MINIMAX_API_KEY',
  'DASHSCOPE_API_KEY',
  'MOONSHOT_API_KEY',
  'BAICHUAN_API_KEY',
  'YI_API_KEY',
  'SILICONFLOW_API_KEY',
  'OPENROUTER_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
];

describe('Provider Auto-Detection', () => {
  // 保存原始值
  const originalValues: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalValues[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalValues[key] !== undefined) {
        process.env[key] = originalValues[key];
      } else {
        delete process.env[key];
      }
    }
  });

  // 动态导入以确保读取最新环境变量
  async function loadFreshConfig() {
    const mod = await import('../config/types.js?t=' + Date.now());
    return mod.loadConfig();
  }

  it('should detect DeepSeek from DEEPSEEK_API_KEY', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test-deepseek';
    const config = await loadFreshConfig();
    expect(config.llm.provider).toBe('deepseek');
    expect(config.llm.apiKey).toBe('sk-test-deepseek');
  });

  it('should detect GLM from GLM_API_KEY', async () => {
    process.env.GLM_API_KEY = 'test-glm-key';
    const config = await loadFreshConfig();
    expect(config.llm.provider).toBe('glm');
    expect(config.llm.apiKey).toBe('test-glm-key');
  });

  it('should detect GLM from ZHIPU_API_KEY (alias)', async () => {
    process.env.ZHIPU_API_KEY = 'test-zhipu-key';
    const config = await loadFreshConfig();
    expect(config.llm.provider).toBe('glm');
    expect(config.llm.apiKey).toBe('test-zhipu-key');
  });

  it('should detect MiniMax from MINIMAX_API_KEY', async () => {
    process.env.MINIMAX_API_KEY = 'test-minimax';
    const config = await loadFreshConfig();
    expect(config.llm.provider).toBe('minimax');
  });

  it('should detect Qwen from DASHSCOPE_API_KEY', async () => {
    process.env.DASHSCOPE_API_KEY = 'test-dashscope';
    const config = await loadFreshConfig();
    expect(config.llm.provider).toBe('qwen');
  });

  it('should prefer explicit KILLER_LLM_PROVIDER over auto-detect', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-deepseek';
    process.env.KILLER_LLM_PROVIDER = 'glm';
    process.env.GLM_API_KEY = 'sk-glm';
    const config = await loadFreshConfig();
    expect(config.llm.provider).toBe('glm');
    expect(config.llm.apiKey).toBe('sk-glm');
  });

  it('should use KILLER_API_KEY as generic key with default anthropic provider', async () => {
    process.env.KILLER_API_KEY = 'sk-generic';
    // 没有 provider 特定 key → 没有 auto-detect → 回到默认 anthropic
    // 但 KILLER_API_KEY 被设了
    process.env.KILLER_LLM_PROVIDER = 'anthropic';
    const config = await loadFreshConfig();
    expect(config.llm.provider).toBe('anthropic');
    expect(config.llm.apiKey).toBe('sk-generic');
  });

  it('should prefer DeepSeek over GLM when both keys present (detection order)', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-deepseek';
    process.env.GLM_API_KEY = 'sk-glm';
    const config = await loadFreshConfig();
    expect(config.llm.provider).toBe('deepseek');
  });

  it('should return default config with empty apiKey when no keys present', async () => {
    const config = await loadFreshConfig();
    expect(config.llm.provider).toBe('anthropic');
    expect(config.llm.apiKey).toBe('');
  });

  it('should detect SiliconFlow from SILICONFLOW_API_KEY', async () => {
    process.env.SILICONFLOW_API_KEY = 'sk-sf';
    const config = await loadFreshConfig();
    expect(config.llm.provider).toBe('siliconflow');
  });
});
