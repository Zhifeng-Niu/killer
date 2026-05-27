/**
 * Resilience Tests - 断路器和重试
 */

import { describe, it, expect, vi } from 'vitest';
import { ResilientLLMProvider } from '../llm/resilience.js';
import { MockLLMProvider } from '@killer/core';
import type { LLMProvider, LLMCompletion } from '@killer/core';

describe('ResilientLLMProvider', () => {
  it('should delegate to inner provider on success', async () => {
    const inner = new MockLLMProvider('Hello from mock');
    const resilient = new ResilientLLMProvider(inner);

    const result = await resilient.complete('test prompt');
    expect(result.content).toContain('Hello from mock');
  });

  it('should return model name from inner provider', () => {
    const inner = new MockLLMProvider();
    const resilient = new ResilientLLMProvider(inner);

    expect(resilient.getModel()).toBe(inner.getModel());
  });

  it('should retry on failure', async () => {
    let callCount = 0;
    const inner: LLMProvider = {
      complete: async (): Promise<LLMCompletion> => {
        callCount++;
        if (callCount < 3) throw new Error('Temporary failure');
        return { content: 'Success', model: 'test', finishReason: 'stop' };
      },
      stream: async function* () { yield 'ok'; },
      getModel: () => 'test',
    };

    const resilient = new ResilientLLMProvider(
      inner,
      {},
      { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50, backoffMultiplier: 2 },
    );

    const result = await resilient.complete('test');
    expect(result.content).toBe('Success');
    expect(callCount).toBe(3);
  });

  it('should throw after max retries', async () => {
    const inner: LLMProvider = {
      complete: async (): Promise<LLMCompletion> => { throw new Error('Always fails'); },
      stream: async function* () { yield 'ok'; },
      getModel: () => 'test',
    };

    const resilient = new ResilientLLMProvider(
      inner,
      {},
      { maxAttempts: 2, baseDelayMs: 10, maxDelayMs: 50, backoffMultiplier: 2 },
    );

    await expect(resilient.complete('test')).rejects.toThrow('Always fails');
  });

  it('should start with closed circuit', () => {
    const inner = new MockLLMProvider();
    const resilient = new ResilientLLMProvider(inner);

    expect(resilient.getCircuitState()).toBe('closed');
  });

  it('should open circuit after threshold failures', async () => {
    const inner: LLMProvider = {
      complete: async (): Promise<LLMCompletion> => { throw new Error('fail'); },
      stream: async function* () { yield 'ok'; },
      getModel: () => 'test',
    };

    const resilient = new ResilientLLMProvider(
      inner,
      { failureThreshold: 3, resetTimeoutMs: 1000, halfOpenMaxAttempts: 1 },
      { maxAttempts: 1, baseDelayMs: 10, maxDelayMs: 50, backoffMultiplier: 2 },
    );

    // Trigger failures
    for (let i = 0; i < 3; i++) {
      try { await resilient.complete('test'); } catch {}
    }

    expect(resilient.getCircuitState()).toBe('open');

    // Next call should fail immediately with circuit breaker error
    await expect(resilient.complete('test')).rejects.toThrow('AI 服务暂时不可用');
  });

  it('should reset circuit', async () => {
    const inner: LLMProvider = {
      complete: async (): Promise<LLMCompletion> => { throw new Error('fail'); },
      stream: async function* () { yield 'ok'; },
      getModel: () => 'test',
    };

    const resilient = new ResilientLLMProvider(
      inner,
      { failureThreshold: 2, resetTimeoutMs: 1000, halfOpenMaxAttempts: 1 },
      { maxAttempts: 1, baseDelayMs: 10, maxDelayMs: 50, backoffMultiplier: 2 },
    );

    // Trigger failures to open circuit
    for (let i = 0; i < 2; i++) {
      try { await resilient.complete('test'); } catch {}
    }
    expect(resilient.getCircuitState()).toBe('open');

    // Reset
    resilient.reset();
    expect(resilient.getCircuitState()).toBe('closed');
  });

  it('should close circuit on success', async () => {
    let callCount = 0;
    const inner: LLMProvider = {
      complete: async (): Promise<LLMCompletion> => {
        callCount++;
        if (callCount <= 1) throw new Error('fail');
        return { content: 'ok', model: 'test', finishReason: 'stop' };
      },
      stream: async function* () { yield 'ok'; },
      getModel: () => 'test',
    };

    const resilient = new ResilientLLMProvider(
      inner,
      { failureThreshold: 5, resetTimeoutMs: 1000, halfOpenMaxAttempts: 1 },
      { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50, backoffMultiplier: 2 },
    );

    // First call fails but retries succeed
    const result = await resilient.complete('test');
    expect(result.content).toBe('ok');
    expect(resilient.getCircuitState()).toBe('closed');
  });

  it('should transition to half-open after resetTimeout', async () => {
    const inner: LLMProvider = {
      complete: async (): Promise<LLMCompletion> => { throw new Error('fail'); },
      stream: async function* () { yield 'ok'; },
      getModel: () => 'test',
    };

    const resilient = new ResilientLLMProvider(
      inner,
      { failureThreshold: 1, resetTimeoutMs: 10, halfOpenMaxAttempts: 1 },
      { maxAttempts: 1, baseDelayMs: 1 },
    );

    await expect(resilient.complete('test')).rejects.toThrow();
    expect(resilient.getCircuitState()).toBe('open');

    // Wait for resetTimeout to pass
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(resilient.getCircuitState()).toBe('half-open');
  });

  it('should recover to closed from half-open on success', async () => {
    let callCount = 0;
    const inner: LLMProvider = {
      complete: async (): Promise<LLMCompletion> => {
        callCount++;
        if (callCount <= 1) throw new Error('fail');
        return { content: 'recovered', model: 'test' };
      },
      stream: async function* () { yield 'ok'; },
      getModel: () => 'test',
    };

    const resilient = new ResilientLLMProvider(
      inner,
      { failureThreshold: 1, resetTimeoutMs: 10, halfOpenMaxAttempts: 1 },
      { maxAttempts: 1, baseDelayMs: 1 },
    );

    // Open circuit
    await expect(resilient.complete('test')).rejects.toThrow();
    expect(resilient.getCircuitState()).toBe('open');

    // Wait for half-open
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Succeed in half-open → should close
    const result = await resilient.complete('test');
    expect(result.content).toBe('recovered');
    expect(resilient.getCircuitState()).toBe('closed');
  });

  it('should re-open from half-open on failure', async () => {
    const inner: LLMProvider = {
      complete: async (): Promise<LLMCompletion> => { throw new Error('still failing'); },
      stream: async function* () { yield 'ok'; },
      getModel: () => 'test',
    };

    const resilient = new ResilientLLMProvider(
      inner,
      { failureThreshold: 1, resetTimeoutMs: 10, halfOpenMaxAttempts: 1 },
      { maxAttempts: 1, baseDelayMs: 1 },
    );

    // Open circuit
    await expect(resilient.complete('test')).rejects.toThrow();

    // Wait for half-open
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(resilient.getCircuitState()).toBe('half-open');

    // Fail again → re-open
    await expect(resilient.complete('test')).rejects.toThrow('still failing');
    expect(resilient.getCircuitState()).toBe('open');
  });

  it('should retry stream on failure and succeed', async () => {
    let streamCallCount = 0;
    const inner: LLMProvider = {
      complete: async () => ({ content: 'ok', model: 'test' }),
      stream: async function* () {
        streamCallCount++;
        if (streamCallCount < 2) throw new Error('stream error');
        yield 'chunk1';
      },
      getModel: () => 'test',
    };

    const resilient = new ResilientLLMProvider(
      inner, undefined,
      { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5, backoffMultiplier: 2 },
    );

    const chunks: string[] = [];
    for await (const chunk of resilient.stream('test')) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['chunk1']);
    expect(streamCallCount).toBe(2);
  });

  it('should throw after all stream retries fail', async () => {
    const inner: LLMProvider = {
      complete: async () => ({ content: 'ok', model: 'test' }),
      stream: async function* () { throw new Error('stream fail'); },
      getModel: () => 'test',
    };

    const resilient = new ResilientLLMProvider(
      inner, undefined,
      { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 5, backoffMultiplier: 2 },
    );

    const gen = resilient.stream('test');
    await expect(gen.next()).rejects.toThrow('stream fail');
  });

  it('should not apply circuit breaker to stream', async () => {
    let streamCallCount = 0;
    const inner: LLMProvider = {
      complete: async (): Promise<LLMCompletion> => { throw new Error('complete fail'); },
      stream: async function* () {
        streamCallCount++;
        yield 'ok';
      },
      getModel: () => 'test',
    };

    const resilient = new ResilientLLMProvider(
      inner,
      { failureThreshold: 1, resetTimeoutMs: 60000 },
      { maxAttempts: 1, baseDelayMs: 1 },
    );

    // Open circuit via complete
    await expect(resilient.complete('test')).rejects.toThrow();
    expect(resilient.getCircuitState()).toBe('open');

    // Stream should still work (no circuit breaker)
    const chunks: string[] = [];
    for await (const chunk of resilient.stream('test')) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(['ok']);
  });

  it('should stop retrying when circuit opens mid-attempts', async () => {
    const inner: LLMProvider = {
      complete: async (): Promise<LLMCompletion> => { throw new Error('fail'); },
      stream: async function* () { yield 'ok'; },
      getModel: () => 'test',
    };

    const resilient = new ResilientLLMProvider(
      inner,
      { failureThreshold: 1, resetTimeoutMs: 60000 },
      { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 },
    );

    // Single call should trigger circuit open on first failure,
    // cutting short any retries within that call
    await expect(resilient.complete('test')).rejects.toThrow();
    expect(resilient.getCircuitState()).toBe('open');
  });

  it('should include model name in circuit breaker error', async () => {
    const inner: LLMProvider = {
      complete: async (): Promise<LLMCompletion> => { throw new Error('fail'); },
      stream: async function* () { yield 'ok'; },
      getModel: () => 'claude-opus-4',
    };

    const resilient = new ResilientLLMProvider(
      inner,
      { failureThreshold: 1, resetTimeoutMs: 60000 },
      { maxAttempts: 1, baseDelayMs: 1 },
    );

    await expect(resilient.complete('test')).rejects.toThrow();

    // Next call should include model name in error object
    try { await resilient.complete('test'); } catch (e) {
      expect((e as { provider?: string }).provider).toBe('claude-opus-4');
    }
  });

  it('should return full diagnostics info', async () => {
    const inner: LLMProvider = {
      complete: async (): Promise<LLMCompletion> => { throw new Error('fail'); },
      stream: async function* () { yield 'ok'; },
      getModel: () => 'diag-model',
    };

    const resilient = new ResilientLLMProvider(
      inner,
      { failureThreshold: 5, resetTimeoutMs: 30000 },
      { maxAttempts: 3, baseDelayMs: 1000 },
    );

    const diag = resilient.getDiagnostics();
    expect(diag.model).toBe('diag-model');
    expect(diag.circuitState).toBe('closed');
    expect(diag.failureCount).toBe(0);
    expect(diag.lastFailureTime).toBeNull();
    expect(diag.config.failureThreshold).toBe(5);
    expect(diag.config.resetTimeoutMs).toBe(30000);
    expect(diag.config.maxRetryAttempts).toBe(3);
  });

  it('should track failure count and lastFailureTime in diagnostics', async () => {
    const inner: LLMProvider = {
      complete: async (): Promise<LLMCompletion> => { throw new Error('fail'); },
      stream: async function* () { yield 'ok'; },
      getModel: () => 'test',
    };

    const resilient = new ResilientLLMProvider(
      inner,
      { failureThreshold: 10, resetTimeoutMs: 60000 },
      { maxAttempts: 1, baseDelayMs: 1 },
    );

    try { await resilient.complete('test'); } catch {}

    const diag = resilient.getDiagnostics();
    expect(diag.failureCount).toBe(1);
    expect(diag.lastFailureTime).toBeGreaterThan(0);
  });

  it('should respect custom failureThreshold of 5', async () => {
    const inner: LLMProvider = {
      complete: async (): Promise<LLMCompletion> => { throw new Error('fail'); },
      stream: async function* () { yield 'ok'; },
      getModel: () => 'test',
    };

    const resilient = new ResilientLLMProvider(
      inner,
      { failureThreshold: 5, resetTimeoutMs: 60000 },
      { maxAttempts: 1, baseDelayMs: 1 },
    );

    for (let i = 0; i < 4; i++) {
      await expect(resilient.complete('test')).rejects.toThrow();
    }
    expect(resilient.getCircuitState()).toBe('closed');

    await expect(resilient.complete('test')).rejects.toThrow();
    expect(resilient.getCircuitState()).toBe('open');
  });
});
