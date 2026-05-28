/**
 * Anthropic Claude LLM Provider
 */

import type { LLMProvider, LLMCompletion } from '@odysseus/core';
import type { LLMProviderConfig } from './types.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Anthropic API 响应类型
 */
interface AnthropicMessage {
  role: string;
  content: Array<{ type: string; text: string }>;
}

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
  model: string;
  usage?: AnthropicUsage;
}

interface AnthropicErrorResponse {
  error?: {
    message: string;
    type?: string;
  };
}

export class AnthropicProvider implements LLMProvider {
  private config: Required<Pick<LLMProviderConfig, 'apiKey' | 'model' | 'maxTokens'>>;
  private readonly apiUrl: string;

  constructor(config: LLMProviderConfig) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model || DEFAULT_MODEL,
      maxTokens: config.maxTokens || DEFAULT_MAX_TOKENS,
    };
    // 支持自定义 API URL（如 MiniMax 的 Anthropic 兼容端点）
    this.apiUrl = config.baseUrl || DEFAULT_API_URL;
  }

  async complete(prompt: string, context?: string): Promise<LLMCompletion> {
    const messages: AnthropicMessage[] = [{ role: 'user', content: [{ type: 'text', text: prompt }] }];

    const requestBody = {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      messages,
    };

    // 如果有 context，添加为系统消息
    const headers: Record<string, string> = {
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    };

    if (context) {
      (requestBody as { system: string; model: string; max_tokens: number; messages: AnthropicMessage[] }).system = context;
    }

    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      throw new Error(`Anthropic API request failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 处理 429 速率限制 - 简单重试一次
    if (response.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        response = await fetch(this.apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
        });
      } catch (error) {
        throw new Error(`Anthropic API retry failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (!response.ok) {
      const errorData = (await response.json()) as AnthropicErrorResponse;
      throw new Error(`Anthropic API error ${response.status}: ${errorData.error?.message || response.statusText}`);
    }

    const data = (await response.json()) as AnthropicResponse;

    const content = data.content[0]?.text || '';
    const tokensUsed = data.usage ? data.usage.input_tokens + data.usage.output_tokens : undefined;

    return {
      content,
      model: data.model || this.config.model,
      tokensUsed,
      finishReason: 'stop',
    };
  }

  async *stream(prompt: string, context?: string): AsyncIterable<string> {
    const messages: AnthropicMessage[] = [{ role: 'user', content: [{ type: 'text', text: prompt }] }];

    const requestBody: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      messages,
      stream: true,
    };

    const headers: Record<string, string> = {
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    };

    if (context) {
      requestBody.system = context;
    }

    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      throw new Error(`Anthropic stream request failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (response.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        response = await fetch(this.apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
        });
      } catch (error) {
        throw new Error(`Anthropic stream retry failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (!response.ok) {
      const errorData = (await response.json()) as AnthropicErrorResponse;
      throw new Error(`Anthropic stream error ${response.status}: ${errorData.error?.message || response.statusText}`);
    }

    // Parse SSE events from response body
    const reader = response.body?.getReader();
    if (!reader) {
      // Fallback to non-streaming
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
        // Keep incomplete last line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;

          try {
            const event = JSON.parse(data) as { type: string; delta?: { text?: string }; content_block?: { text?: string } };
            if (event.type === 'content_block_delta' && event.delta?.text) {
              yield event.delta.text;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  getModel(): string {
    return this.config.model;
  }
}
