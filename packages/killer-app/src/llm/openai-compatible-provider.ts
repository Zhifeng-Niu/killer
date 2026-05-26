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

import type { LLMProvider, LLMCompletion } from '@killer/core';
import type { LLMProviderConfig } from './types.js';

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
}> = {
  minimax: {
    baseUrl: 'https://api.minimaxi.com/v1/chat/completions',
    defaultModel: 'MiniMax-M2.7',
    models: ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed'],
    envKey: 'MINIMAX_API_KEY',
    description: 'MiniMax (海螺 AI)',
    anthropicBaseUrl: 'https://api.minimaxi.com/anthropic/v1/messages',
    anthropicModels: ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed'],
  },
  glm: {
    baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions',
    defaultModel: 'glm-4.7',
    models: ['glm-5.1', 'glm-5', 'glm-4.7', 'glm-4.5-air'],
    envKey: 'GLM_API_KEY',
    description: 'GLM / 智谱 AI',
    anthropicBaseUrl: 'https://open.bigmodel.cn/api/anthropic/v1/messages',
    anthropicModels: ['glm-5.1', 'glm-5', 'glm-4.7', 'glm-4.5-air'],
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    envKey: 'DEEPSEEK_API_KEY',
    description: 'DeepSeek',
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    defaultModel: 'qwen-plus',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
    envKey: 'DASHSCOPE_API_KEY',
    description: 'Qwen / 通义千问 (阿里云)',
  },
  moonshot: {
    baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
    defaultModel: 'moonshot-v1-8k',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    envKey: 'MOONSHOT_API_KEY',
    description: 'Moonshot / Kimi (月之暗面)',
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
  },
};

const DEFAULT_MAX_TOKENS = 4096;

/**
 * OpenAI 消息格式
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatChoice {
  message: { content: string };
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
      throw new Error(
        `${this.providerName} API error ${response.status}: ${err.error?.message || response.statusText}`,
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
      // 回退到 complete
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
