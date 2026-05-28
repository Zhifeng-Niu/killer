/**
 * OpenAI-Compatible Generic Provider
 *
 * 兼容所有提供 OpenAI API 格式的服务商：
 * MiniMax、GLM/智谱、DeepSeek、Qwen/通义千问、Moonshot、百川、零一万物 等。
 *
 * 这些服务商的共同特征：
 * - 使用 /v1/chat/completions 接口格式
 * - Bearer token 认证
 * - 支持 streaming (SSE)
 */

import type { LLMProvider, LLMCompletion, LLMToolCallCompletion, ToolDefinition, ToolCall, ChatMessage } from '@killer/core';
import type { LLMProviderConfig } from './types.js';

// ChatMessage is now imported from @killer/core

/**
 * 预配置的服务商预设
 *
 * 用户只需设置 KILLER_LLM_PROVIDER=minimax 和 MINIMAX_API_KEY 即可。
 * baseUrl 和默认模型自动填充。
 *
 * 双协议支持: 部分服务商同时提供 OpenAI 和 Anthropic 兼容端点。
 * 设置 anthropicBaseUrl 后，用户可通过 protocol: 'anthropic' 切换协议。
 */
export const OPENAI_COMPATIBLE_PROVIDERS: Record<string, {
  baseUrl: string;
  defaultModel: string;
  models: string[];
  envKey: string;
  description: string;
  /** Anthropic 兼容端点（双协议服务商） */
  anthropicBaseUrl?: string;
  /** Anthropic 协议下可用的模型（可能与 OpenAI 协议不同） */
  anthropicModels?: string[];
  /** API key 格式前缀（用于自动检测） */
  keyPrefix?: string;
  /** 获取 API key 的帮助链接 */
  helpUrl?: string;
}> = {
  minimax: {
    baseUrl: 'https://api.minimaxi.com/v1/chat/completions',
    defaultModel: 'MiniMax-M2.7',
    models: ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed'],
    envKey: 'MINIMAX_API_KEY',
    description: 'MiniMax (海螺 AI)',
    keyPrefix: 'sk-cp-',
    helpUrl: 'https://platform.minimaxi.com/',
    anthropicBaseUrl: 'https://api.minimaxi.com/anthropic/v1/messages',
    anthropicModels: ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed'],
  },
  glm: {
    baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions',
    defaultModel: 'GLM-4.7',
    models: ['GLM-5.1', 'GLM-5', 'GLM-4.7', 'GLM-4.5-Air'],
    envKey: 'GLM_API_KEY',
    description: 'GLM / 智谱 AI',
    helpUrl: 'https://open.bigmodel.cn/',
    anthropicBaseUrl: 'https://open.bigmodel.cn/api/anthropic/v1/messages',
    anthropicModels: ['GLM-5.1', 'GLM-5', 'GLM-4.7', 'GLM-4.5-Air'],
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    envKey: 'DEEPSEEK_API_KEY',
    description: 'DeepSeek',
    keyPrefix: 'sk-',
    helpUrl: 'https://platform.deepseek.com/api_keys',
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    defaultModel: 'qwen-plus',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
    envKey: 'DASHSCOPE_API_KEY',
    description: 'Qwen / 通义千问 (阿里云)',
    helpUrl: 'https://dashscope.console.aliyun.com/',
  },
  moonshot: {
    baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
    defaultModel: 'moonshot-v1-8k',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    envKey: 'MOONSHOT_API_KEY',
    description: 'Moonshot / Kimi (月之暗面)',
    keyPrefix: 'sk-kimi',
    helpUrl: 'https://platform.moonshot.cn/',
  },
  baichuan: {
    baseUrl: 'https://api.baichuan-ai.com/v1/chat/completions',
    defaultModel: 'Baichuan4',
    models: ['Baichuan4', 'Baichuan3-Turbo', 'Baichuan3-Turbo-128k'],
    envKey: 'BAICHUAN_API_KEY',
    description: 'Baichuan / 百川智能',
  },
  yi: {
    baseUrl: 'https://api.lingyiwanwu.com/v1/chat/completions',
    defaultModel: 'yi-lightning',
    models: ['yi-lightning', 'yi-large', 'yi-medium'],
    envKey: 'YI_API_KEY',
    description: 'Yi / 零一万物',
  },
  siliconflow: {
    baseUrl: 'https://api.siliconflow.cn/v1/chat/completions',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    models: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-V3.2', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct'],
    envKey: 'SILICONFLOW_API_KEY',
    description: 'SiliconFlow / 硅基流动',
    helpUrl: 'https://cloud.siliconflow.cn/',
  },
  volcengine: {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    defaultModel: 'doubao-1.5-pro-32k',
    models: ['doubao-1.5-pro-32k', 'doubao-1.5-pro-256k', 'doubao-1.5-lite-32k', 'deepseek-V3'],
    envKey: 'VOLCENGINE_API_KEY',
    description: 'Volcengine / 火山方舟 (字节跳动)',
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
    envKey: 'GEMINI_API_KEY',
    description: 'Google Gemini',
    helpUrl: 'https://aistudio.google.com/apikey',
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    envKey: 'GROQ_API_KEY',
    description: 'Groq (超快推理)',
    keyPrefix: 'gsk_',
    helpUrl: 'https://console.groq.com/keys',
  },
  together: {
    baseUrl: 'https://api.together.xyz/v1/chat/completions',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
    envKey: 'TOGETHER_API_KEY',
    description: 'Together AI',
    helpUrl: 'https://api.together.xyz/settings/api-keys',
  },
  stepfun: {
    baseUrl: 'https://api.stepfun.com/v1/chat/completions',
    defaultModel: 'step-2-16k',
    models: ['step-2-16k', 'step-1-8k', 'step-1-flash'],
    envKey: 'STEPFUN_API_KEY',
    description: 'Stepfun / 阶跃星辰',
    helpUrl: 'https://platform.stepfun.com/',
  },
  hunyuan: {
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions',
    defaultModel: 'hunyuan-turbos',
    models: ['hunyuan-turbos', 'hunyuan-pro', 'hunyuan-lite'],
    envKey: 'HUNYUAN_API_KEY',
    description: 'Hunyuan / 混元 (腾讯)',
    helpUrl: 'https://console.cloud.tencent.com/hunyuan',
  },
};

const DEFAULT_MAX_TOKENS = 4096;

/**
 * OpenAI 消息格式 — 已统一使用 @killer/core 的 ChatMessage
 */

interface ChatChoice {
  message: { content: string; tool_calls?: RawToolCall[] };
  finish_reason: string;
}

interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

interface ChatResponse {
  choices: ChatChoice[];
  model: string;
  usage?: ChatUsage;
}

/** API 返回的原始 tool_call 格式 */
interface RawToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** 带工具调用的 API 响应 */
interface ToolCallChatResponse {
  choices: ChatChoice[];
  model: string;
  usage?: ChatUsage;
}

interface ErrorResponse {
  error?: { message: string; type?: string };
}

/**
 * OpenAI-Compatible Provider
 *
 * 通过 baseUrl + apiKey 连接任何兼容 OpenAI chat/completions 接口的服务。
 */
export class OpenAICompatibleProvider implements LLMProvider {
  private readonly apiKey: string;
  private model: string;
  private readonly maxTokens: number;
  private readonly baseUrl: string;
  private readonly providerName: string;

  constructor(config: LLMProviderConfig) {
    const preset = OPENAI_COMPATIBLE_PROVIDERS[config.provider];

    this.apiKey = config.apiKey;
    this.model = config.model || preset?.defaultModel || 'gpt-4o';
    this.maxTokens = config.maxTokens || DEFAULT_MAX_TOKENS;
    this.baseUrl = config.baseUrl || preset?.baseUrl || 'https://api.openai.com/v1/chat/completions';
    this.providerName = config.provider;
  }

  async complete(prompt: string, context?: string): Promise<LLMCompletion> {
    const messages = this.buildMessages(prompt, context);

    const response = await this.doRequest(messages, false);

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as ErrorResponse;
      const friendly = formatProviderError(this.providerName, response.status);
      throw new Error(
        `${friendly}\n原始错误: ${err.error?.message || response.statusText}`,
      );
    }

    const data = (await response.json()) as ChatResponse;
    const content = data.choices[0]?.message?.content || '';
    const tokensUsed = data.usage
      ? data.usage.prompt_tokens + data.usage.completion_tokens
      : undefined;

    return {
      content,
      model: data.model || this.model,
      tokensUsed,
      finishReason: data.choices[0]?.finish_reason === 'length' ? 'length' : 'stop',
    };
  }

  async *stream(prompt: string, context?: string): AsyncIterable<string> {
    const messages = this.buildMessages(prompt, context);

    const response = await this.doRequest(messages, true);

    if (!response.ok) {
      const completion = await this.complete(prompt, context);
      yield completion.content;
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      const completion = await this.complete(prompt, context);
      yield completion.content;
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;

          try {
            const chunk = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {
            // 跳过格式错误的行
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  getModel(): string {
    return this.model;
  }

  setModel(model: string): void {
    this.model = model;
  }

  /**
   * 使用原生 function calling 的完成请求
   *
   * 发送 messages + tools 参数，解析 tool_calls 响应。
   * 这是 tool chain loop 的核心——模型返回结构化的工具调用，
   * 而不是从文本中 regex 挖掘。
   */
  async completeWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[],
  ): Promise<LLMToolCallCompletion> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    // 转换消息格式：killer-core 用 camelCase，API 需要 snake_case
    const apiMessages = messages.map(m => {
      if (m.role === 'tool') {
        const tm = m as { role: 'tool'; toolCallId: string; content: string };
        return { role: 'tool', tool_call_id: tm.toolCallId, content: tm.content };
      }
      if (m.role === 'assistant' && 'tool_calls' in m) {
        const am = m as { role: 'assistant'; content: string; tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> };
        return { role: 'assistant', content: am.content, tool_calls: am.tool_calls };
      }
      return m;
    });

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages: apiMessages,
      tools,
      tool_choice: 'auto',
    };

    let response: Response;
    try {
      response = await fetch(this.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new Error(
        `${this.providerName} request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 429 重试一次
    if (response.status === 429) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        response = await fetch(this.baseUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
      } catch (error) {
        throw new Error(
          `${this.providerName} retry failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as ErrorResponse;
      const friendly = formatProviderError(this.providerName, response.status);
      throw new Error(
        `${friendly}\n原始错误: ${err.error?.message || response.statusText}`,
      );
    }

    const data = await response.json() as ToolCallChatResponse;

    const choice = data.choices[0];
    if (!choice) {
      return { content: '', model: data.model || this.model, finishReason: 'stop' };
    }

    const content = choice.message?.content || '';
    const toolCalls = choice.message?.tool_calls?.map((tc: RawToolCall): ToolCall => ({
      id: tc.id,
      type: 'function',
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }));

    const finishReason = choice.finish_reason === 'tool_calls'
      ? 'tool_calls' as const
      : choice.finish_reason === 'length'
        ? 'length' as const
        : 'stop' as const;

    const tokensUsed = data.usage
      ? data.usage.prompt_tokens + data.usage.completion_tokens
      : undefined;

    return {
      content,
      model: data.model || this.model,
      tokensUsed,
      finishReason,
      ...(toolCalls && toolCalls.length > 0 && { toolCalls }),
    };
  }

  private buildMessages(prompt: string, context?: string): ChatMessage[] {
    const messages: ChatMessage[] = [];
    if (context) messages.push({ role: 'system', content: context });
    messages.push({ role: 'user', content: prompt });
    return messages;
  }

  private async doRequest(messages: ChatMessage[], stream: boolean): Promise<Response> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages,
      ...(stream && { stream: true }),
    };

    let response: Response;
    try {
      response = await fetch(this.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new Error(
        `${this.providerName} request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 429 重试一次
    if (response.status === 429) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        response = await fetch(this.baseUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
      } catch (error) {
        throw new Error(
          `${this.providerName} retry failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return response;
  }
}

/**
 * 格式化 Provider 特定的友好错误信息
 *
 * 将 HTTP 状态码转换为用户可读的提示，包含获取新 key 的链接。
 */
export function formatProviderError(
  provider: string,
  status: number,
  _message?: string,
): string {
  const preset = OPENAI_COMPATIBLE_PROVIDERS[provider];
  const helpUrl = preset?.helpUrl;
  const helpSuffix = helpUrl ? `\n获取新 key: ${helpUrl}` : '';

  switch (status) {
    case 401:
      return `API key 无效或已过期。${helpSuffix}`;
    case 403:
      return `无权访问该模型。请检查账户权限和套餐。${helpSuffix}`;
    case 429:
      return `请求频率超限，请等待 30 秒后重试。如持续出现，检查账户配额。`;
    case 500: case 502: case 503:
      return `${preset?.description ?? provider} 暂时不可用，请稍后重试。`;
    default:
      return `${preset?.description ?? provider} 请求失败 (${status})。${helpSuffix}`;
  }
}

/** 内置 provider（非 OpenAI-compatible） */
const BUILTIN_PROVIDER_OPTIONS: Array<{ name: string; description: string; envKey: string; dualProtocol?: boolean }> = [
  { name: 'anthropic', description: 'Anthropic (Claude)', envKey: 'ANTHROPIC_API_KEY' },
  { name: 'openai', description: 'OpenAI (GPT)', envKey: 'OPENAI_API_KEY' },
  { name: 'openrouter', description: 'OpenRouter (聚合多模型)', envKey: 'OPENROUTER_API_KEY' },
  { name: 'gemini', description: 'Google Gemini', envKey: 'GOOGLE_API_KEY' },
  { name: 'mock', description: '体验模式 (无需 API key)', envKey: '' },
];

/**
 * 从 registry 派生 init-wizard 所需的 Provider 列表
 *
 * 单一数据源：所有 provider 信息从 OPENAI_COMPATIBLE_PROVIDERS + 内置列表派生，
 * 避免 init-wizard 维护重复的 PROVIDER_OPTIONS 数组。
 */
export function getProviderOptions(): Array<{
  name: string;
  description: string;
  envKey: string;
  dualProtocol?: boolean;
}> {
  const options: Array<{ name: string; description: string; envKey: string; dualProtocol?: boolean }> = [];

  // OpenAI-compatible providers（从 registry 派生）
  for (const [name, preset] of Object.entries(OPENAI_COMPATIBLE_PROVIDERS)) {
    options.push({
      name,
      description: preset.description,
      envKey: preset.envKey,
      dualProtocol: !!preset.anthropicBaseUrl,
    });
  }

  // 内置 providers
  options.push(...BUILTIN_PROVIDER_OPTIONS);

  return options;
}

/**
 * 从 registry 派生 env key → provider 的映射
 *
 * 用于自动扫描环境变量中已有的 API Key。
 */
export function getProviderEnvKeys(): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const [name, preset] of Object.entries(OPENAI_COMPATIBLE_PROVIDERS)) {
    mapping[preset.envKey] = name;
  }

  for (const builtin of BUILTIN_PROVIDER_OPTIONS) {
    if (builtin.envKey) {
      mapping[builtin.envKey] = builtin.name;
    }
  }

  return mapping;
}

/**
 * 从 API Key 格式自动推断服务商
 *
 * 基于 registry 的 keyPrefix 字段 + 内置规则进行匹配。
 * 单一数据源：keyPrefix 定义在 registry 中，此函数消费 registry 数据。
 */
export function detectProviderFromKey(key: string): { provider: string; confidence: 'high' | 'low' } | null {
  if (!key || key.length < 10) return null;

  // 从 registry 的 keyPrefix 字段匹配
  for (const [name, preset] of Object.entries(OPENAI_COMPATIBLE_PROVIDERS)) {
    if (preset.keyPrefix && key.startsWith(preset.keyPrefix)) {
      return { provider: name, confidence: 'high' };
    }
  }

  // 内置 provider 特殊规则（无 keyPrefix 的特殊格式）
  if (key.startsWith('sk-ant-')) return { provider: 'anthropic', confidence: 'high' };
  if (key.startsWith('sk-or-')) return { provider: 'openrouter', confidence: 'high' };
  if (key.startsWith('AIza')) return { provider: 'gemini', confidence: 'high' };

  // 智谱 GLM — JWT 格式 (三段 base64url)
  if (/^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
    return { provider: 'glm', confidence: 'high' };
  }

  // OpenAI — 通常包含 proj- 或 org- 段
  if (key.startsWith('sk-') && (key.includes('proj-') || key.includes('org-'))) {
    return { provider: 'openai', confidence: 'high' };
  }

  // 低置信度 — sk- 前缀但不确定
  if (key.startsWith('sk-')) return { provider: 'deepseek', confidence: 'low' };

  return null;
}
