/**
 * OpenAI-Compatible Provider Tests
 *
 * 验证通用 OpenAI 兼容 provider 对中国 LLM 的支持。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAICompatibleProvider, OPENAI_COMPATIBLE_PROVIDERS } from '../llm/openai-compatible-provider.js';

describe('OpenAICompatibleProvider', () => {
  describe('OPENAI_COMPATIBLE_PROVIDERS registry', () => {
    it('should have all expected Chinese providers', () => {
      const expected = ['minimax', 'glm', 'deepseek', 'qwen', 'moonshot', 'baichuan', 'yi', 'siliconflow'];
      for (const name of expected) {
        expect(OPENAI_COMPATIBLE_PROVIDERS[name]).toBeDefined();
        expect(OPENAI_COMPATIBLE_PROVIDERS[name].baseUrl).toContain('https://');
        expect(OPENAI_COMPATIBLE_PROVIDERS[name].defaultModel).toBeTruthy();
        expect(OPENAI_COMPATIBLE_PROVIDERS[name].models.length).toBeGreaterThan(0);
        expect(OPENAI_COMPATIBLE_PROVIDERS[name].envKey).toBeTruthy();
      }
    });

    it('should have MiniMax with correct endpoints', () => {
      const minimax = OPENAI_COMPATIBLE_PROVIDERS.minimax;
      expect(minimax.baseUrl).toBe('https://api.minimaxi.com/v1/chat/completions');
      expect(minimax.models).toContain('MiniMax-M2.7');
      expect(minimax.envKey).toBe('MINIMAX_API_KEY');
    });

    it('should have GLM with correct endpoints', () => {
      const glm = OPENAI_COMPATIBLE_PROVIDERS.glm;
      expect(glm.baseUrl).toContain('open.bigmodel.cn');
      expect(glm.models).toContain('glm-4.7');
      expect(glm.envKey).toBe('GLM_API_KEY');
    });

    it('should have DeepSeek with correct endpoints', () => {
      const ds = OPENAI_COMPATIBLE_PROVIDERS.deepseek;
      expect(ds.baseUrl).toBe('https://api.deepseek.com/v1/chat/completions');
      expect(ds.defaultModel).toBe('deepseek-chat');
    });
  });

  describe('constructor', () => {
    it('should use preset baseUrl for known provider', () => {
      const provider = new OpenAICompatibleProvider({
        provider: 'deepseek',
        apiKey: 'test-key',
      });
      expect(provider.getModel()).toBe('deepseek-chat');
    });

    it('should use custom baseUrl for openai-compatible', () => {
      const provider = new OpenAICompatibleProvider({
        provider: 'openai-compatible',
        apiKey: 'test-key',
        baseUrl: 'https://custom.api.com/v1/chat/completions',
        model: 'my-model',
      });
      expect(provider.getModel()).toBe('my-model');
    });

    it('should use custom model when provided', () => {
      const provider = new OpenAICompatibleProvider({
        provider: 'glm',
        apiKey: 'test-key',
        model: 'glm-5.1',
      });
      expect(provider.getModel()).toBe('glm-5.1');
    });
  });

  describe('complete', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    it('should call correct endpoint with Bearer auth', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Hello from DeepSeek!' }, finish_reason: 'stop' }],
          model: 'deepseek-chat',
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      };
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const provider = new OpenAICompatibleProvider({
        provider: 'deepseek',
        apiKey: 'sk-test-123',
      });

      const result = await provider.complete('Say hello', 'You are helpful');

      expect(fetch).toHaveBeenCalledWith(
        'https://api.deepseek.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk-test-123',
          }),
        }),
      );

      expect(result.content).toBe('Hello from DeepSeek!');
      expect(result.tokensUsed).toBe(15);
    });

    it('should handle API errors gracefully', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ error: { message: 'Invalid API key' } }),
      };
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const provider = new OpenAICompatibleProvider({
        provider: 'minimax',
        apiKey: 'bad-key',
      });

      await expect(provider.complete('test')).rejects.toThrow('minimax API error 401');
    });
  });

  describe('stream', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    it('should fallback to complete when stream fails', async () => {
      // First call (stream) returns non-ok
      const streamResponse = {
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: { message: 'stream error' } }),
      };

      // Second call (complete fallback)
      const completeResponse = {
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'fallback response' }, finish_reason: 'stop' }],
          model: 'deepseek-chat',
        }),
      };

      (fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(streamResponse)
        .mockResolvedValueOnce(completeResponse);

      const provider = new OpenAICompatibleProvider({
        provider: 'deepseek',
        apiKey: 'test-key',
      });

      const chunks: string[] = [];
      for await (const chunk of provider.stream('test')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['fallback response']);
    });
  });
});
