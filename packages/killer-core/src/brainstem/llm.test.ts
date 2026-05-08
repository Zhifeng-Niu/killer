/**
 * LLM Provider 测试
 */

import { describe, it, expect } from 'vitest';
import { MockLLMProvider, MockResponses } from './llm.js';

describe('MockLLMProvider', () => {
  it('应该返回同步完成结果', async () => {
    const provider = new MockLLMProvider('Test response');

    const result = await provider.complete('Test prompt');

    expect(result.content).toContain('Test response');
    expect(result.model).toBe('mock-llm-v1');
    expect(result.finishReason).toBe('stop');
  });

  it('应该支持流式输出', async () => {
    const provider = new MockLLMProvider('Stream test');

    const chunks: string[] = [];
    for await (const chunk of provider.stream('Test')) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toContain('Stream test');
  });

  it('应该返回模型名称', () => {
    const provider = new MockLLMProvider();
    expect(provider.getModel()).toBe('mock-llm-v1');
  });

  it('应该支持设置响应模式', async () => {
    const provider = new MockLLMProvider();
    provider.setResponsePattern('Custom pattern');

    const result = await provider.complete('Test');

    expect(result.content).toContain('Custom pattern');
  });

  it('应该提供预定义的响应模式', async () => {
    const provider = new MockLLMProvider(MockResponses.standardReasoning);

    const result = await provider.complete('Test');

    expect(result.content).toContain('Analyze the current context');
    expect(result.content).toContain('Confidence');
  });
});
