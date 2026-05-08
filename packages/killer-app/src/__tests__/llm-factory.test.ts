/**
 * LLM Factory Tests
 *
 * Tests for the LLM provider factory:
 * - Correct provider instantiation per type
 * - Resilience wrapping for non-mock providers
 * - Mock provider passthrough (no wrapping)
 * - Unknown provider error
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLLMProvider } from '../llm/factory.js';
import { MockLLMProvider } from '@killer/core';
import { ResilientLLMProvider } from '../llm/resilience.js';

describe('LLM Factory', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Mock fetch to avoid real API calls
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ text: 'test' }], model: 'test' }),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should create MockLLMProvider for mock provider', () => {
    const provider = createLLMProvider({ provider: 'mock' });
    expect(provider).toBeInstanceOf(MockLLMProvider);
  });

  it('should wrap Anthropic provider in ResilientLLMProvider', () => {
    const provider = createLLMProvider({ provider: 'anthropic', apiKey: 'test-key' });
    expect(provider).toBeInstanceOf(ResilientLLMProvider);
  });

  it('should wrap OpenAI provider in ResilientLLMProvider', () => {
    const provider = createLLMProvider({ provider: 'openai', apiKey: 'test-key' });
    expect(provider).toBeInstanceOf(ResilientLLMProvider);
  });

  it('should wrap OpenRouter provider in ResilientLLMProvider', () => {
    const provider = createLLMProvider({ provider: 'openrouter', apiKey: 'test-key' });
    expect(provider).toBeInstanceOf(ResilientLLMProvider);
  });

  it('should wrap Gemini provider in ResilientLLMProvider', () => {
    const provider = createLLMProvider({ provider: 'gemini', apiKey: 'test-key' });
    expect(provider).toBeInstanceOf(ResilientLLMProvider);
  });

  it('should pass model config to Gemini provider', () => {
    const provider = createLLMProvider({
      provider: 'gemini',
      apiKey: 'test-key',
      model: 'gemini-2.5-pro',
    });
    expect(provider.getModel()).toBe('gemini-2.5-pro');
  });

  it('should throw for unknown provider', () => {
    expect(() => createLLMProvider({ provider: 'groq' as never, apiKey: 'test' }))
      .toThrow('Unknown provider: "groq"');
  });

  it('should not wrap mock provider in resilience', () => {
    const provider = createLLMProvider({ provider: 'mock' });
    // MockLLMProvider should be returned directly, not wrapped
    expect(provider).not.toBeInstanceOf(ResilientLLMProvider);
  });

  it('should pass model config to Anthropic provider', async () => {
    const provider = createLLMProvider({
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-opus-4',
    });
    // ResilientLLMProvider delegates getModel to inner provider
    expect(provider.getModel()).toBe('claude-opus-4');
  });

  it('should use default model when not specified', () => {
    const provider = createLLMProvider({ provider: 'anthropic', apiKey: 'test-key' });
    expect(provider.getModel()).toContain('claude');
  });
});
