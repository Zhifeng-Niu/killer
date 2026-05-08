/**
 * Structured Error Hierarchy
 *
 * Custom error classes for the Killer Agent Framework.
 * Enables structured error handling, classification, and recovery.
 */

/**
 * Base error class for all Killer framework errors
 */
export class KillerError extends Error {
  public readonly code: string;
  public readonly recoverable: boolean;
  public readonly timestamp: number;

  constructor(message: string, code: string, recoverable = true) {
    super(message);
    this.name = 'KillerError';
    this.code = code;
    this.recoverable = recoverable;
    this.timestamp = Date.now();
  }
}

/**
 * Validation error — input failed validation
 */
export class ValidationError extends KillerError {
  public readonly field: string;

  constructor(message: string, field: string) {
    super(message, 'VALIDATION_ERROR', true);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * LLM provider error — API call failure
 */
export class LLMError extends KillerError {
  public readonly provider: string;
  public readonly statusCode?: number;

  constructor(message: string, provider: string, statusCode?: number) {
    super(message, 'LLM_ERROR', statusCode === undefined || statusCode < 500);
    this.name = 'LLMError';
    this.provider = provider;
    this.statusCode = statusCode;
  }
}

/**
 * API error — HTTP endpoint error
 */
export class APIError extends KillerError {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message, 'API_ERROR', statusCode < 500);
    this.name = 'APIError';
    this.statusCode = statusCode;
  }
}

/**
 * Tool execution error
 */
export class ToolError extends KillerError {
  public readonly toolName: string;

  constructor(message: string, toolName: string) {
    super(message, 'TOOL_ERROR', true);
    this.name = 'ToolError';
    this.toolName = toolName;
  }
}

/**
 * Type guard: check if an error is a KillerError
 */
export function isKillerError(error: unknown): error is KillerError {
  return error instanceof KillerError;
}
