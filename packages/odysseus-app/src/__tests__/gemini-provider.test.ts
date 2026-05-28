/**
 * Gemini Provider Tests
 *
 * Tests for the Google Gemini LLM provider.
 * Uses mocked fetch to verify API interaction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiProvider } from '../llm/gemini-provider.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('GeminiProvider', () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GeminiProvider({
      provider: 'gemini',
      apiKey: 'test-gemini-key',
    });
  });

  describe('constructor', () => {
    it('should use default model', () => {
      expect(provider.getModel()).toBe('gemini-2.0-flash');
    });

    it('should use custom model when specified', () => {
      const custom = new GeminiProvider({
        provider: 'gemini',
        apiKey: 'test-key',
        model: 'gemini-2.5-pro',
      });
      expect(custom.getModel()).toBe('gemini-2.5-pro');
    });
  });

  describe('complete', () => {
    it('should send request with correct headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Hello from Gemini' }, finish_reason: 'stop' }],
          model: 'gemini-2.0-flash',
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      await provider.complete('Hello');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0];
      expect(call[1].headers['x-goog-api-key']).toBe('test-gemini-key');
      expect(call[1].headers['Content-Type']).toBe('application/json');
    });

    it('should return completion with content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Gemini response' }, finish_reason: 'stop' }],
          model: 'gemini-2.0-flash',
          usage: { prompt_tokens: 15, completion_tokens: 8 },
        }),
      });

      const result = await provider.complete('Test prompt');

      expect(result.content).toBe('Gemini response');
      expect(result.model).toBe('gemini-2.0-flash');
      expect(result.tokensUsed).toBe(23);
      expect(result.finishReason).toBe('stop');
    });

    it('should include system context when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
          model: 'gemini-2.0-flash',
        }),
      });

      await provider.complete('Hello', 'You are helpful');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[0].content).toBe('You are helpful');
    });

    it('should detect length finish reason', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Truncated...' }, finish_reason: 'length' }],
          model: 'gemini-2.0-flash',
        }),
      });

      const result = await provider.complete('Long prompt');
      expect(result.finishReason).toBe('length');
    });

    it('should retry on 429 rate limit', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Success after retry' }, finish_reason: 'stop' }],
            model: 'gemini-2.0-flash',
          }),
        });

      const result = await provider.complete('Test');
      expect(result.content).toBe('Success after retry');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ error: { message: 'Invalid request' } }),
      });

      await expect(provider.complete('Test')).rejects.toThrow('Gemini API error 400');
    });

    it('should throw on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(provider.complete('Test')).rejects.toThrow('Gemini API request failed');
    });

    it('should use default base URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
          model: 'gemini-2.0-flash',
        }),
      });

      await provider.complete('Test');

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('generativelanguage.googleapis.com');
    });

    it('should use custom base URL when configured', async () => {
      const customProvider = new GeminiProvider({
        provider: 'gemini',
        apiKey: 'test-key',
        baseUrl: 'https://custom-endpoint.example.com/v1/chat/completions',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
          model: 'gemini-2.0-flash',
        }),
      });

      await customProvider.complete('Test');

      expect(mockFetch.mock.calls[0][0]).toBe('https://custom-endpoint.example.com/v1/chat/completions');
    });
  });
});
