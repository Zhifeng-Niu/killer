/**
 * LLM Provider 类型定义
 */

/**
 * 支持的 LLM Provider 类型
 *
 * 内置: anthropic, openai, openrouter, gemini, mock
 * OpenAI-compatible: minimax, glm, deepseek, qwen, moonshot, baichuan, yi, siliconflow, openai-compatible
 */
export type LLMProviderType =
  | 'anthropic' | 'openai' | 'openrouter' | 'gemini' | 'mock'
  | 'minimax' | 'glm' | 'deepseek' | 'qwen' | 'moonshot' | 'baichuan' | 'yi' | 'siliconflow'
  | 'openai-compatible';

/**
 * LLM Provider 配置
 */
export interface LLMProviderConfig {
  /** Provider 类型 */
  provider: string;
  /** API 密钥 */
  apiKey: string;
  /** 模型名称（可选，使用默认值） */
  model?: string;
  /** 基础 URL（可选，用于自定义端点） */
  baseUrl?: string;
  /** 最大 token 数（默认 4096） */
  maxTokens?: number;
  /** 温度参数（0-1） */
  temperature?: number;
}
