/**
 * Structured Error Classes Tests
 */

import { describe, it, expect } from 'vitest';
import {
  OdysseusError,
  ValidationError,
  LLMError,
  APIError,
  ToolError,
  isOdysseusError,
} from '@odysseus/core';

describe('OdysseusError', () => {
  it('should have correct properties', () => {
    const err = new OdysseusError('test', 'TEST_CODE', false);
    expect(err.message).toBe('test');
    expect(err.code).toBe('TEST_CODE');
    expect(err.recoverable).toBe(false);
    expect(err.timestamp).toBeGreaterThan(0);
    expect(err.name).toBe('OdysseusError');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(OdysseusError);
  });

  it('should default to recoverable', () => {
    const err = new OdysseusError('test', 'CODE');
    expect(err.recoverable).toBe(true);
  });
});

describe('ValidationError', () => {
  it('should capture field name', () => {
    const err = new ValidationError('message is required', 'message');
    expect(err.field).toBe('message');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.recoverable).toBe(true);
    expect(err).toBeInstanceOf(OdysseusError);
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

describe('isOdysseusError', () => {
  it('should return true for OdysseusError subclasses', () => {
    expect(isOdysseusError(new ValidationError('test', 'f'))).toBe(true);
    expect(isOdysseusError(new LLMError('test', 'p'))).toBe(true);
    expect(isOdysseusError(new APIError('test', 400))).toBe(true);
    expect(isOdysseusError(new ToolError('test', 't'))).toBe(true);
  });

  it('should return false for generic Error', () => {
    expect(isOdysseusError(new Error('test'))).toBe(false);
  });

  it('should return false for non-Error values', () => {
    expect(isOdysseusError('error')).toBe(false);
    expect(isOdysseusError(null)).toBe(false);
    expect(isOdysseusError(undefined)).toBe(false);
  });
});
