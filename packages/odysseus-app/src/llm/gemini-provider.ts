/**
 * Google Gemini LLM Provider
 *
 * Uses the Gemini REST API with OpenAI-compatible format.
 */

import type { LLMProvider, LLMCompletion } from '@odysseus/core';
import type { LLMProviderConfig } from './types.js';

const DEFAULT_MODEL = 'gemini-2.0-flash';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_API_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

/**
 * Gemini API message format (OpenAI-compatible)
 */
interface GeminiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GeminiChoice {
  message: {
    content: string;
  };
  finish_reason: string;
}

interface GeminiUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

interface GeminiResponse {
  choices: GeminiChoice[];
  model: string;
  usage?: GeminiUsage;
}

interface GeminiErrorResponse {
  error?: {
    message: string;
    code?: number;
  };
}

export class GeminiProvider implements LLMProvider {
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
    const messages = this.buildMessages(prompt, context);

    const response = await this.request(messages, false);

    const content = response.choices[0]?.message?.content || '';
    const tokensUsed = response.usage
      ? response.usage.prompt_tokens + response.usage.completion_tokens
      : undefined;
    const finishReason: 'stop' | 'length' | 'error' =
      response.choices[0]?.finish_reason === 'length' ? 'length' : 'stop';

    return {
      content,
      model: response.model || this.config.model,
      tokensUsed,
      finishReason,
    };
  }

  async *stream(prompt: string, context?: string): AsyncIterable<string> {
    const messages = this.buildMessages(prompt, context);

    const response = await fetch(this.config.baseUrl, {
      method: 'POST',
      headers: {
        'x-goog-api-key': this.config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      // Fallback to non-streaming
      const result = await this.complete(prompt, context);
      yield result.content;
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      const result = await this.complete(prompt, context);
      yield result.content;
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
            if (content) yield content;
          } catch {
            // Skip malformed JSON
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

  private buildMessages(prompt: string, context?: string): GeminiMessage[] {
    const messages: GeminiMessage[] = [];
    if (context) messages.push({ role: 'system', content: context });
    messages.push({ role: 'user', content: prompt });
    return messages;
  }

  private async request(messages: GeminiMessage[], _stream: boolean): Promise<GeminiResponse> {
    let response: Response;
    try {
      response = await fetch(this.config.baseUrl, {
        method: 'POST',
        headers: {
          'x-goog-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: this.config.maxTokens,
          messages,
        }),
      });
    } catch (error) {
      throw new Error(`Gemini API request failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (response.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        response = await fetch(this.config.baseUrl, {
          method: 'POST',
          headers: {
            'x-goog-api-key': this.config.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.config.model,
            max_tokens: this.config.maxTokens,
            messages,
          }),
        });
      } catch (error) {
        throw new Error(`Gemini API retry failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (!response.ok) {
      const errorData = (await response.json()) as GeminiErrorResponse;
      throw new Error(`Gemini API error ${response.status}: ${errorData.error?.message || response.statusText}`);
    }

    return (await response.json()) as GeminiResponse;
  }
}
