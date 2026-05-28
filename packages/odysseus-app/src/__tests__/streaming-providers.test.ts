/**
 * LLM Provider Streaming Tests
 *
 * Tests for true SSE streaming in Anthropic, OpenAI, and OpenRouter providers.
 * Uses mocked fetch to simulate server-sent events.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicProvider } from '../llm/anthropic-provider.js';
import { OpenAIProvider } from '../llm/openai-provider.js';
import { OpenRouterProvider } from '../llm/openrouter-provider.js';

function createSSEBody(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = events.map(e => encoder.encode(`data: ${e}\n\n`));
  chunks.push(encoder.encode('data: [DONE]\n\n'));

  return new ReadableStream({
    pull(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

describe('Anthropic Streaming', () => {
  let provider: AnthropicProvider;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    provider = new AnthropicProvider({ apiKey: 'test-key', model: 'claude-test' });
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should stream tokens from Anthropic SSE events', async () => {
    const events = [
      JSON.stringify({ type: 'message_start' }),
      JSON.stringify({ type: 'content_block_start' }),
      JSON.stringify({ type: 'content_block_delta', delta: { text: 'Hello' } }),
      JSON.stringify({ type: 'content_block_delta', delta: { text: ' world' } }),
      JSON.stringify({ type: 'content_block_delta', delta: { text: '!' } }),
      JSON.stringify({ type: 'message_stop' }),
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: createSSEBody(events),
    });

    const tokens: string[] = [];
    for await (const token of provider.stream('Say hello')) {
      tokens.push(token);
    }

    expect(tokens).toEqual(['Hello', ' world', '!']);
  });

  it('should fallback to complete() when body is null', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: 'Fallback response' }],
        model: 'claude-test',
      }),
    });

    const tokens: string[] = [];
    for await (const token of provider.stream('test')) {
      tokens.push(token);
    }

    expect(tokens).toEqual(['Fallback response']);
  });

  it('should handle stream errors', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ error: { message: 'Invalid API key' } }),
    });

    await expect(async () => {
      for await (const _ of provider.stream('test')) { /* consume */ }
    }).rejects.toThrow('401');
  });
});

describe('OpenAI Streaming', () => {
  let provider: OpenAIProvider;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    provider = new OpenAIProvider({ apiKey: 'test-key', model: 'gpt-4o' });
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should stream tokens from OpenAI SSE events', async () => {
    const events = [
      JSON.stringify({ choices: [{ delta: { content: 'Hi' } }] }),
      JSON.stringify({ choices: [{ delta: { content: ' there' } }] }),
      JSON.stringify({ choices: [{ delta: { content: '!' }, finish_reason: 'stop' }] }),
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: createSSEBody(events),
    });

    const tokens: string[] = [];
    for await (const token of provider.stream('Say hi')) {
      tokens.push(token);
    }

    expect(tokens).toEqual(['Hi', ' there', '!']);
  });

  it('should skip delta chunks without content', async () => {
    const events = [
      JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] }),
      JSON.stringify({ choices: [{ delta: { content: 'Content' } }] }),
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: createSSEBody(events),
    });

    const tokens: string[] = [];
    for await (const token of provider.stream('test')) {
      tokens.push(token);
    }

    expect(tokens).toEqual(['Content']);
  });
});

describe('OpenRouter Streaming', () => {
  let provider: OpenRouterProvider;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    provider = new OpenRouterProvider({ apiKey: 'test-key', model: 'anthropic/claude-test' });
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should stream tokens from OpenRouter SSE events', async () => {
    const events = [
      JSON.stringify({ choices: [{ delta: { content: 'Open' } }] }),
      JSON.stringify({ choices: [{ delta: { content: 'Router' } }] }),
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: createSSEBody(events),
    });

    const tokens: string[] = [];
    for await (const token of provider.stream('test')) {
      tokens.push(token);
    }

    expect(tokens).toEqual(['Open', 'Router']);
  });

  it('should handle stream errors', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: () => Promise.resolve({ error: { message: 'Insufficient credits' } }),
    });

    await expect(async () => {
      for await (const _ of provider.stream('test')) { /* consume */ }
    }).rejects.toThrow('403');
  });
});
