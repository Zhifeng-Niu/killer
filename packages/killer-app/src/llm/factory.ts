/**
 * LLM Provider 工厂函数
 */

import type { LLMProvider } from '@killer/core';
import { MockLLMProvider } from '@killer/core';
import type { LLMProviderConfig } from './types.js';
import { OPENAI_COMPATIBLE_PROVIDERS } from './openai-compatible-provider.js';
import { AnthropicProvider } from './anthropic-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { OpenAICompatibleProvider } from './openai-compatible-provider.js';
import { OpenRouterProvider } from './openrouter-provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { ResilientLLMProvider } from './resilience.js';

/** 内置 provider 类型 */
const BUILTIN_PROVIDERS = new Set(['anthropic', 'openai', 'openrouter', 'gemini', 'mock']);

/** OpenAI-compatible provider 名称 */
const COMPAT_PROVIDERS = new Set(Object.keys(OPENAI_COMPATIBLE_PROVIDERS));

/**
 * 检查 provider 名称是否为已知的有效 provider
 */
export function isValidProvider(name: string): boolean {
  return BUILTIN_PROVIDERS.has(name) || COMPAT_PROVIDERS.has(name) || name === 'openai-compatible';
}

/**
 * 获取所有支持的 provider 列表（用于帮助信息）
 */
export function getSupportedProviders(): Array<{ name: string; description: string; envKey: string }> {
  const providers = [
    { name: 'anthropic', description: 'Anthropic (Claude)', envKey: 'ANTHROPIC_API_KEY' },
    { name: 'openai', description: 'OpenAI (GPT)', envKey: 'OPENAI_API_KEY' },
    { name: 'openrouter', description: 'OpenRouter', envKey: 'OPENROUTER_API_KEY' },
    { name: 'gemini', description: 'Google Gemini', envKey: 'GOOGLE_API_KEY' },
    { name: 'mock', description: 'Demo mode (no LLM)', envKey: '(none)' },
  ];

  for (const [name, preset] of Object.entries(OPENAI_COMPATIBLE_PROVIDERS)) {
    providers.push({
      name,
      description: preset.description,
      envKey: preset.envKey,
    });
  }

  providers.push({
    name: 'openai-compatible',
    description: 'Any OpenAI-compatible API (custom baseUrl)',
    envKey: 'KILLER_API_KEY',
  });

  return providers;
}

/**
 * 创建 LLM Provider 实例
 *
 * 所有非 mock provider 自动包装 ResilientLLMProvider（断路器 + 重试）。
 * Mock provider 不包装，避免在测试中引入不必要的重试延迟。
 *
 * @param config - Provider 配置
 * @returns LLMProvider 实例
 *
 * @example
 * ```ts
 * // Anthropic
 * const p = createLLMProvider({ provider: 'anthropic', apiKey: 'sk-...' });
 *
 * // MiniMax
 * const p = createLLMProvider({ provider: 'minimax', apiKey: 'sk-cp-...' });
 *
 * // Custom OpenAI-compatible
 * const p = createLLMProvider({
 *   provider: 'openai-compatible',
 *   apiKey: '...',
 *   baseUrl: 'https://my-api.example.com/v1/chat/completions',
 * });
 * ```
 */
export function createLLMProvider(config: LLMProviderConfig): LLMProvider {
  let provider: LLMProvider;

  switch (config.provider) {
    case 'anthropic':
      provider = new AnthropicProvider(config);
      break;
    case 'openai':
      provider = new OpenAIProvider(config);
      break;
    case 'openrouter':
      provider = new OpenRouterProvider(config);
      break;
    case 'gemini':
      provider = new GeminiProvider(config);
      break;
    case 'mock':
      return new MockLLMProvider();
    default:
      // MiniMax, GLM, DeepSeek, Qwen, Moonshot, Baichuan, Yi, SiliconFlow,
      // openai-compatible, or any unknown provider → try OpenAI-compatible
      if (COMPAT_PROVIDERS.has(config.provider) || config.provider === 'openai-compatible') {
        provider = new OpenAICompatibleProvider(config);
      } else {
        throw new Error(
          `Unknown provider: "${config.provider}". ` +
          `Supported: anthropic, openai, openrouter, gemini, mock, ` +
          `${[...COMPAT_PROVIDERS].join(', ')}, openai-compatible`,
        );
      }
  }

  // 包装断路器 + 重试
  return new ResilientLLMProvider(provider);
}
