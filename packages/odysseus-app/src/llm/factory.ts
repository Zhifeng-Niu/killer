/**
 * LLM Provider 工厂函数
 */

import type { LLMProvider } from '@odysseus/core';
import { MockLLMProvider } from '@odysseus/core';
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
 * 从 baseUrl 自动推断通信协议
 */
function detectProtocolFromUrl(url: string): 'openai' | 'anthropic' | null {
  if (/\/anthropic\//i.test(url)) return 'anthropic';
  if (/\/v1\/chat\/completions/i.test(url) || /\/v\d\/chat/i.test(url)) return 'openai';
  return null;
}

/**
 * 检查 provider 名称是否为已知的有效 provider
 */
export function isValidProvider(name: string): boolean {
  return BUILTIN_PROVIDERS.has(name) || COMPAT_PROVIDERS.has(name) || name === 'openai-compatible';
}

/**
 * 获取所有支持的 provider 列表（用于帮助信息）
 */
export function getSupportedProviders(): Array<{ name: string; description: string; envKey: string; protocols: string[] }> {
  const providers: Array<{ name: string; description: string; envKey: string; protocols: string[] }> = [
    { name: 'anthropic', description: 'Anthropic (Claude)', envKey: 'ANTHROPIC_API_KEY', protocols: ['anthropic'] },
    { name: 'openai', description: 'OpenAI (GPT)', envKey: 'OPENAI_API_KEY', protocols: ['openai'] },
    { name: 'openrouter', description: 'OpenRouter', envKey: 'OPENROUTER_API_KEY', protocols: ['openai'] },
    { name: 'gemini', description: 'Google Gemini', envKey: 'GOOGLE_API_KEY', protocols: ['openai'] },
    { name: 'mock', description: 'Demo mode (no LLM)', envKey: '(none)', protocols: [] },
  ];

  for (const [name, preset] of Object.entries(OPENAI_COMPATIBLE_PROVIDERS)) {
    const protocols = ['openai'];
    if (preset.anthropicBaseUrl) protocols.push('anthropic');
    providers.push({
      name,
      description: preset.description,
      envKey: preset.envKey,
      protocols,
    });
  }

  providers.push({
    name: 'openai-compatible',
    description: 'Any OpenAI-compatible API (custom baseUrl)',
    envKey: 'ODYSSEUS_API_KEY',
    protocols: ['openai'],
  });

  return providers;
}

/**
 * 创建 LLM Provider 实例
 *
 * 支持双协议路由：
 * - protocol: 'openai' (默认) → OpenAICompatibleProvider
 * - protocol: 'anthropic' → AnthropicProvider（使用服务商的 Anthropic 兼容端点）
 * - 自动检测：如果 preset 有 anthropicBaseUrl 且 config.protocol 未指定，
 *   根据 baseUrl 模式自动判断
 *
 * 所有非 mock provider 自动包装 ResilientLLMProvider（断路器 + 重试）。
 *
 * @example
 * ```ts
 * // MiniMax via OpenAI 协议（默认）
 * const p = createLLMProvider({ provider: 'minimax', apiKey: 'sk-cp-...' });
 *
 * // MiniMax via Anthropic 协议
 * const p = createLLMProvider({ provider: 'minimax', apiKey: 'sk-cp-...', protocol: 'anthropic' });
 *
 * // 自定义 Anthropic 兼容端点
 * const p = createLLMProvider({
 *   provider: 'anthropic',
 *   apiKey: '...',
 *   baseUrl: 'https://api.minimaxi.com/anthropic/v1/messages',
 *   model: 'MiniMax-M2.7',
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
    default: {
      const preset = OPENAI_COMPATIBLE_PROVIDERS[config.provider];

      // 双协议路由：判断是否使用 Anthropic 协议
      const useAnthropic = resolveProtocol(config, preset);

      if (useAnthropic) {
        provider = new AnthropicProvider({
          ...config,
          baseUrl: config.baseUrl || preset?.anthropicBaseUrl,
          model: config.model || (preset?.anthropicModels ? preset.anthropicModels[0] : preset?.defaultModel),
        });
      } else if (COMPAT_PROVIDERS.has(config.provider) || config.provider === 'openai-compatible') {
        provider = new OpenAICompatibleProvider(config);
      } else {
        throw new Error(
          `Unknown provider: "${config.provider}". ` +
          `Supported: anthropic, openai, openrouter, gemini, mock, ` +
          `${[...COMPAT_PROVIDERS].join(', ')}, openai-compatible`,
        );
      }
    }
  }

  // 包装断路器 + 重试
  return new ResilientLLMProvider(provider);
}

/**
 * 判断是否应使用 Anthropic 协议
 */
function resolveProtocol(
  config: LLMProviderConfig,
  preset: { anthropicBaseUrl?: string; anthropicModels?: string[] } | undefined,
): boolean {
  // 显式指定
  if (config.protocol === 'anthropic') return true;
  if (config.protocol === 'openai') return false;

  // 自动检测：从 baseUrl 推断
  if (config.baseUrl) {
    const detected = detectProtocolFromUrl(config.baseUrl);
    if (detected) return detected === 'anthropic';
  }

  // 无 preset 或 preset 不支持 Anthropic → 默认 OpenAI
  return false;
}
