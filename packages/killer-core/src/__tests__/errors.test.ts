/**
 * Structured Error Classes Tests
 */

import { describe, it, expect } from 'vitest';
import {
  KillerError,
  ValidationError,
  LLMError,
  APIError,
  ToolError,
  isKillerError,
} from '@killer/core';

describe('KillerError', () => {
  it('should have correct properties', () => {
    const err = new KillerError('test', 'TEST_CODE', false);
    expect(err.message).toBe('test');
    expect(err.code).toBe('TEST_CODE');
    expect(err.recoverable).toBe(false);
    expect(err.timestamp).toBeGreaterThan(0);
    expect(err.name).toBe('KillerError');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(KillerError);
  });

  it('should default to recoverable', () => {
    const err = new KillerError('test', 'CODE');
    expect(err.recoverable).toBe(true);
  });
});

describe('ValidationError', () => {
  it('should capture field name', () => {
    const err = new ValidationError('message is required', 'message');
    expect(err.field).toBe('message');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.recoverable).toBe(true);
    expect(err).toBeInstanceOf(KillerError);
  });
});

describe('LLMError', () => {
  it('should capture provider and status', () => {
    const err = new LLMError('Rate limited', 'anthropic', 429);
    expect(err.provider).toBe('anthropic');
    expect(err.statusCode).toBe(429);
    expect(err.recoverable).toBe(true); // 4xx is recoverable
  });

  it('should be non-recoverable for 5xx', () => {
    const err = new LLMError('Server error', 'openai', 500);
    expect(err.recoverable).toBe(false);
  });

  it('should be recoverable when no status code', () => {
    const err = new LLMError('Connection failed', 'mock');
    expect(err.recoverable).toBe(true);
    expect(err.statusCode).toBeUndefined();
  });
});

describe('APIError', () => {
  it('should capture status code', () => {
    const err = new APIError('Not found', 404);
    expect(err.statusCode).toBe(404);
    expect(err.recoverable).toBe(true); // 4xx
  });

  it('should be non-recoverable for 5xx', () => {
    const err = new APIError('Internal error', 500);
    expect(err.recoverable).toBe(false);
  });
});

describe('ToolError', () => {
  it('should capture tool name', () => {
    const err = new ToolError('Execution failed', 'memory_store');
    expect(err.toolName).toBe('memory_store');
    expect(err.recoverable).toBe(true);
  });
});

describe('isKillerError', () => {
  it('should return true for KillerError subclasses', () => {
    expect(isKillerError(new ValidationError('test', 'f'))).toBe(true);
    expect(isKillerError(new LLMError('test', 'p'))).toBe(true);
    expect(isKillerError(new APIError('test', 400))).toBe(true);
    expect(isKillerError(new ToolError('test', 't'))).toBe(true);
  });

  it('should return false for generic Error', () => {
    expect(isKillerError(new Error('test'))).toBe(false);
  });

  it('should return false for non-Error values', () => {
    expect(isKillerError('error')).toBe(false);
    expect(isKillerError(null)).toBe(false);
    expect(isKillerError(undefined)).toBe(false);
  });
});
