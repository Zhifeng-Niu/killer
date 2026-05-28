/**
 * OpenAI LLM Provider
 */

import type { LLMProvider, LLMCompletion } from '@odysseus/core';
import type { LLMProviderConfig } from './types.js';

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * OpenAI API 请求消息
 */
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * OpenAI API 响应
 */
interface OpenAIChoice {
  message: {
    content: string;
  };
  finish_reason: string;
}

interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

interface OpenAIResponse {
  choices: OpenAIChoice[];
  model: string;
  usage?: OpenAIUsage;
}

interface OpenAIErrorResponse {
  error?: {
    message: string;
    type?: string;
  };
}

export class OpenAIProvider implements LLMProvider {
  private config: Required<Pick<LLMProviderConfig, 'apiKey' | 'model' | 'maxTokens'>> & { baseUrl: string };

  constructor(config: LLMProviderConfig) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model || DEFAULT_MODEL,
      maxTokens: config.maxTokens || DEFAULT_MAX_TOKENS,
      baseUrl: config.baseUrl || DEFAULT_API_URL,
    };
  }

  async complete(prompt: string, context?: string): Promise<LLMCompletion> {
    const messages: OpenAIMessage[] = [];

    if (context) {
      messages.push({ role: 'system', content: context });
    }

    messages.push({ role: 'user', content: prompt });

    const requestBody = {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      messages,
    };

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    };

    let response: Response;
    try {
      response = await fetch(this.config.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      throw new Error(`OpenAI API request failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 处理 429 速率限制 - 简单重试一次
    if (response.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        response = await fetch(this.config.baseUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
        });
      } catch (error) {
        throw new Error(`OpenAI API retry failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (!response.ok) {
      const errorData = (await response.json()) as OpenAIErrorResponse;
      throw new Error(`OpenAI API error ${response.status}: ${errorData.error?.message || response.statusText}`);
    }

    const data = (await response.json()) as OpenAIResponse;

    const content = data.choices[0]?.message?.content || '';
    const tokensUsed = data.usage ? data.usage.prompt_tokens + data.usage.completion_tokens : undefined;
    const finishReason: 'stop' | 'length' | 'error' = data.choices[0]?.finish_reason === 'length' ? 'length' : 'stop';

    return {
      content,
      model: data.model || this.config.model,
      tokensUsed,
      finishReason,
    };
  }

  async *stream(prompt: string, context?: string): AsyncIterable<string> {
    const messages: OpenAIMessage[] = [];

    if (context) {
      messages.push({ role: 'system', content: context });
    }

    messages.push({ role: 'user', content: prompt });

    const requestBody: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      messages,
      stream: true,
    };

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    };

    let response: Response;
    try {
      response = await fetch(this.config.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      throw new Error(`OpenAI stream request failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (response.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        response = await fetch(this.config.baseUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
        });
      } catch (error) {
        throw new Error(`OpenAI stream retry failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (!response.ok) {
      const errorData = (await response.json()) as OpenAIErrorResponse;
      throw new Error(`OpenAI stream error ${response.status}: ${errorData.error?.message || response.statusText}`);
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
              choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
            };
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
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
