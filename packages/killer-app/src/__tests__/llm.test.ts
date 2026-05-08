/**
 * LLM Provider Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicProvider } from '../llm/anthropic-provider.js';
import { OpenAIProvider } from '../llm/openai-provider.js';
import { OpenRouterProvider } from '../llm/openrouter-provider.js';
import { createLLMProvider } from '../llm/factory.js';
import type { LLMProviderConfig } from '../llm/types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AnthropicProvider({ provider: 'anthropic', apiKey: 'test-key' });
  });

  it('should call correct API endpoint with proper headers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Test response' }],
        model: 'claude-sonnet-4-20250514',
        usage: { input_tokens: 10, output_tokens: 20 },
      }),
    });

    await provider.complete('Hello');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe('https://api.anthropic.com/v1/messages');
    const options = callArgs[1] as RequestInit;
    expect(options.headers).toMatchObject({
      'x-api-key': 'test-key',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    });
  });

  it('should send correct request body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4-20250514',
      }),
    });

    await provider.complete('Test prompt');

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse((callArgs[1] as RequestInit).body as string);
    expect(body).toMatchObject({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Test prompt' }] }],
    });
  });

  it('should include context as system message when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4-20250514',
      }),
    });

    await provider.complete('Hello', 'System context');

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse((callArgs[1] as RequestInit).body as string);
    expect(body.system).toBe('System context');
  });

  it('should parse response correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Generated content' }],
        model: 'claude-sonnet-4-20250514',
        usage: { input_tokens: 15, output_tokens: 25 },
      }),
    });

    const result = await provider.complete('Test');

    expect(result.content).toBe('Generated content');
    expect(result.model).toBe('claude-sonnet-4-20250514');
    expect(result.tokensUsed).toBe(40);
    expect(result.finishReason).toBe('stop');
  });

  it('should retry on 429 status', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ error: { message: 'Rate limited' } }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'Success after retry' }],
          model: 'claude-sonnet-4-20250514',
        }),
      });

    const result = await provider.complete('Test');
    expect(result.content).toBe('Success after retry');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should throw error on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Unauthorized' } }),
    });

    await expect(provider.complete('Test')).rejects.toThrow('Anthropic API error 401: Unauthorized');
  });

  it('should return correct model name', () => {
    expect(provider.getModel()).toBe('claude-sonnet-4-20250514');
  });

  it('should use custom model when provided', async () => {
    provider = new AnthropicProvider({ provider: 'anthropic', apiKey: 'test-key', model: 'claude-opus-4-20250514' });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-opus-4-20250514',
      }),
    });

    await provider.complete('Test');
    expect(provider.getModel()).toBe('claude-opus-4-20250514');
  });
});

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenAIProvider({ provider: 'openai', apiKey: 'test-key' });
  });

  it('should call correct API endpoint with proper headers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
        model: 'gpt-4o',
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      }),
    });

    await provider.complete('Hello');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe('https://api.openai.com/v1/chat/completions');
    const options = callArgs[1] as RequestInit;
    expect(options.headers).toMatchObject({
      'Authorization': 'Bearer test-key',
      'Content-Type': 'application/json',
    });
  });

  it('should send correct request body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
        model: 'gpt-4o',
      }),
    });

    await provider.complete('Test prompt');

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse((callArgs[1] as RequestInit).body as string);
    expect(body).toMatchObject({
      model: 'gpt-4o',
      max_tokens: 4096,
      messages: [{ role: 'user', content: 'Test prompt' }],
    });
  });

  it('should include context as system message when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
        model: 'gpt-4o',
      }),
    });

    await provider.complete('Hello', 'System context');

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse((callArgs[1] as RequestInit).body as string);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'System context' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('should parse response correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'AI response' }, finish_reason: 'stop' }],
        model: 'gpt-4o',
        usage: { prompt_tokens: 12, completion_tokens: 18 },
      }),
    });

    const result = await provider.complete('Test');

    expect(result.content).toBe('AI response');
    expect(result.model).toBe('gpt-4o');
    expect(result.tokensUsed).toBe(30);
    expect(result.finishReason).toBe('stop');
  });

  it('should set finishReason to length when token limit reached', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Partial' }, finish_reason: 'length' }],
        model: 'gpt-4o',
      }),
    });

    const result = await provider.complete('Test');
    expect(result.finishReason).toBe('length');
  });

  it('should retry on 429 status', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ error: { message: 'Rate limited' } }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Success after retry' }, finish_reason: 'stop' }],
          model: 'gpt-4o',
        }),
      });

    const result = await provider.complete('Test');
    expect(result.content).toBe('Success after retry');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should throw error on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid API key' } }),
    });

    await expect(provider.complete('Test')).rejects.toThrow('OpenAI API error 401: Invalid API key');
  });
});

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenRouterProvider({ provider: 'openrouter', apiKey: 'test-key' });
  });

  it('should call correct API endpoint with proper headers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
        model: 'anthropic/claude-sonnet-4',
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      }),
    });

    await provider.complete('Hello');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe('https://openrouter.ai/api/v1/chat/completions');
    const options = callArgs[1] as RequestInit;
    expect(options.headers).toMatchObject({
      'Authorization': 'Bearer test-key',
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://killer-agent.dev',
    });
  });

  it('should include HTTP-Referer header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
        model: 'anthropic/claude-sonnet-4',
      }),
    });

    await provider.complete('Test');

    const callArgs = mockFetch.mock.calls[0];
    const headers = (callArgs[1] as RequestInit).headers as Record<string, string>;
    expect(headers['HTTP-Referer']).toBe('https://killer-agent.dev');
  });
});

describe('createLLMProvider factory', () => {
  it('should create provider for anthropic', () => {
    const config: LLMProviderConfig = { provider: 'anthropic', apiKey: 'key' };
    const provider = createLLMProvider(config);
    expect(provider.getModel()).toBe('claude-sonnet-4-20250514');
  });

  it('should create provider for openai', () => {
    const config: LLMProviderConfig = { provider: 'openai', apiKey: 'key' };
    const provider = createLLMProvider(config);
    expect(typeof provider.getModel()).toBe('string');
  });

  it('should create provider for openrouter', () => {
    const config: LLMProviderConfig = { provider: 'openrouter', apiKey: 'key' };
    const provider = createLLMProvider(config);
    expect(typeof provider.getModel()).toBe('string');
  });

  it('should create MockLLMProvider for mock type', () => {
    const config: LLMProviderConfig = { provider: 'mock', apiKey: 'key' };
    const provider = createLLMProvider(config);
    expect(provider.getModel()).toBe('mock-llm-v1');
  });
});
