/**
 * LLM Resilience E2E Tests
 *
 * End-to-end tests for the full resilience pipeline:
 * Factory → Provider → ResilientLLMProvider → Circuit Breaker
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLLMProvider } from '../llm/factory.js';
import { ResilientLLMProvider } from '../llm/resilience.js';

describe('LLM Resilience E2E', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // Provider-specific response formats
  function mockOpenAISuccess(content: string) {
    return {
      ok: true, status: 200,
      json: async () => ({
        choices: [{ message: { content }, finish_reason: 'stop' }],
        model: 'gpt-4o',
        usage: { prompt_tokens: 5, completion_tokens: 10 },
      }),
    };
  }

  function mockGeminiSuccess(content: string) {
    return {
      ok: true, status: 200,
      json: async () => ({
        choices: [{ message: { content }, finish_reason: 'stop' }],
        model: 'gemini-2.0-flash',
        usage: { prompt_tokens: 5, completion_tokens: 10 },
      }),
    };
  }

  function mockError(status: number, message: string) {
    return {
      ok: false, status, statusText: message,
      json: async () => ({ error: { message } }),
    };
  }

  describe('Factory + Resilience integration', () => {
    it('should create resilient provider from factory', () => {
      const provider = createLLMProvider({ provider: 'anthropic', apiKey: 'test-key' });
      expect(provider).toBeInstanceOf(ResilientLLMProvider);
    });

    it('should complete with Gemini provider through resilience', async () => {
      fetchMock.mockResolvedValue(mockGeminiSuccess('Hello from Gemini'));

      const provider = createLLMProvider({ provider: 'gemini', apiKey: 'test-key' });
      const result = await provider.complete('Hi');

      expect(result.content).toBe('Hello from Gemini');
    });

    it('should retry on transient failure then succeed', async () => {
      fetchMock
        .mockResolvedValueOnce(mockError(500, 'Internal Server Error'))
        .mockResolvedValue(mockOpenAISuccess('Success after retry'));

      const provider = createLLMProvider({ provider: 'openai', apiKey: 'test-key' });

      const result = await provider.complete('Test');
      expect(result.content).toBe('Success after retry');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should report circuit breaker diagnostics', async () => {
      fetchMock.mockResolvedValue(mockOpenAISuccess('OK'));

      const provider = createLLMProvider({ provider: 'openai', apiKey: 'test-key' });

      await provider.complete('Test');
      const resilient = provider as ResilientLLMProvider;
      const diag = resilient.getDiagnostics();

      expect(diag.circuitState).toBe('closed');
      expect(diag.failureCount).toBe(0);
      expect(diag.config.failureThreshold).toBe(5);
      expect(diag.config.maxRetryAttempts).toBe(3);
    });
  });

  describe('Circuit breaker full lifecycle', () => {
    it('should open after threshold failures and transition to half-open', async () => {
      const provider = new ResilientLLMProvider(
        {
          complete: vi.fn().mockRejectedValue(new Error('API down')),
          stream: vi.fn(),
          getModel: () => 'test-model',
        },
        { failureThreshold: 2, resetTimeoutMs: 100, halfOpenMaxAttempts: 1 },
        { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, backoffMultiplier: 1 },
      );

      // Trigger failures to open circuit
      await expect(provider.complete('a')).rejects.toThrow('API down');
      expect(provider.getCircuitState()).toBe('closed');

      await expect(provider.complete('b')).rejects.toThrow('API down');
      expect(provider.getCircuitState()).toBe('open');

      // Circuit open → immediate rejection
      await expect(provider.complete('c')).rejects.toThrow('AI 服务暂时不可用');

      // Wait for reset timeout → half-open
      await new Promise(r => setTimeout(r, 150));
      expect(provider.getCircuitState()).toBe('half-open');
    });

    it('should close circuit after successful half-open request', async () => {
      let callCount = 0;
      const provider = new ResilientLLMProvider(
        {
          complete: vi.fn(async () => {
            callCount++;
            if (callCount <= 2) throw new Error('Fail');
            return { content: 'Recovered', model: 'test', finishReason: 'stop' as const };
          }),
          stream: vi.fn(),
          getModel: () => 'test-model',
        },
        { failureThreshold: 2, resetTimeoutMs: 50, halfOpenMaxAttempts: 1 },
        { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, backoffMultiplier: 1 },
      );

      // Open the circuit
      await expect(provider.complete('a')).rejects.toThrow();
      await expect(provider.complete('b')).rejects.toThrow();
      expect(provider.getCircuitState()).toBe('open');

      // Wait for half-open
      await new Promise(r => setTimeout(r, 80));

      // Successful call closes the circuit
      const result = await provider.complete('c');
      expect(result.content).toBe('Recovered');
      expect(provider.getCircuitState()).toBe('closed');
    });
  });

  describe('Provider coverage', () => {
    it('should work with all non-mock providers', async () => {
      const providers: Array<{ type: 'openai' | 'openrouter' | 'gemini'; mock: ReturnType<typeof mockOpenAISuccess> }> = [
        { type: 'openai', mock: mockOpenAISuccess('OpenAI response') },
        { type: 'openrouter', mock: mockOpenAISuccess('OpenRouter response') },
        { type: 'gemini', mock: mockGeminiSuccess('Gemini response') },
      ];

      for (const { type, mock } of providers) {
        fetchMock.mockResolvedValue(mock);
        const provider = createLLMProvider({ provider: type, apiKey: 'test-key' });
        const result = await provider.complete('Test');
        expect(result.content).toBeTruthy();
      }
    });
  });
});
