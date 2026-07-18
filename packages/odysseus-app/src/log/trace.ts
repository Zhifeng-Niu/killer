/**
 * Lightweight Trace System
 *
 * Zero-dependency execution tracer — writes JSONL spans to `.odysseus/trace.jsonl`.
 * Inspired by OpenTelemetry spans but minimal: name, timing, status, parent.
 *
 * Usage:
 *   const span = Trace.begin('processInput', { userId: 'foo' });
 *   // ... do work ...
 *   span.end();                    // ok
 *   span.end('error', err);        // failed
 */

import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { Logger } from './index.js';

const logger = Logger.getInstance().child('trace');

export interface SpanData {
  traceId: string;
  spanId: string;
  parentId: string | null;
  name: string;
  startTime: number;
  endTime: number | null;
  durationMs: number | null;
  status: 'ok' | 'error' | 'cancelled';
  attributes: Record<string, unknown>;
  error?: { message: string; stack?: string };
}

let traceFilePath: string;
let enabled = false;
let currentTraceId = '';

/**
 * 初始化 trace — 创建/追加 trace 文件
 */
export function initTrace(odysseusDir?: string): void {
  const dir = odysseusDir
    ?? (existsSync('.odysseus') ? '.odysseus'
      : existsSync(join(process.cwd(), '.odysseus')) ? join(process.cwd(), '.odysseus')
        : join(tmpdir(), 'odysseus'));

  if (!existsSync(dir)) {
    try { mkdirSync(dir, { recursive: true }); } catch { /* best effort */ }
  }

  traceFilePath = join(dir, 'trace.jsonl');
  enabled = true;
  currentTraceId = genId(16);

  writeSpan({
    traceId: currentTraceId,
    spanId: genId(8),
    parentId: null,
    name: 'session.start',
    startTime: Date.now(),
    endTime: Date.now(),
    durationMs: 0,
    status: 'ok',
    attributes: { pid: process.pid, nodeVersion: process.version },
  });
}

/**
 * 获取当前 trace 文件路径（用于诊断）
 */
export function getTraceFilePath(): string {
  return traceFilePath ?? '(not initialized)';
}

function genId(len: number): string {
  const chars = '0123456789abcdef';
  let id = '';
  for (let i = 0; i < len; i++) id += chars[Math.floor(Math.random() * 16)];
  return id;
}

function writeSpan(span: SpanData): void {
  if (!enabled) return;
  try {
    appendFileSync(traceFilePath, JSON.stringify(span) + '\n');
  } catch (err) {
    logger.warn(`Failed to write trace span: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * 开始一个 span — 返回可 .end() 的句柄
 */
export function beginSpan(
  name: string,
  attributes?: Record<string, unknown>,
  parentId?: string | null,
): Span {
  const spanId = genId(8);
  return new Span(currentTraceId, spanId, parentId ?? null, name, attributes);
}

/**
 * Span 句柄 — 手动控制结束时间
 */
export class Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly startTime: number;
  readonly attributes: Record<string, unknown>;
  private ended = false;

  constructor(
    traceId: string,
    spanId: string,
    parentId: string | null,
    name: string,
    attributes?: Record<string, unknown>,
  ) {
    this.traceId = traceId;
    this.spanId = spanId;
    this.parentId = parentId;
    this.name = name;
    this.startTime = Date.now();
    this.attributes = attributes ?? {};
  }

  /** 设置属性（链式） */
  setAttr(key: string, value: unknown): this {
    this.attributes[key] = value;
    return this;
  }

  /** 正常结束 */
  end(status: 'ok' | 'error' | 'cancelled' = 'ok', error?: unknown): void {
    if (this.ended) return;
    this.ended = true;
    const endTime = Date.now();
    const spanData: SpanData = {
      traceId: this.traceId,
      spanId: this.spanId,
      parentId: this.parentId,
      name: this.name,
      startTime: this.startTime,
      endTime,
      durationMs: endTime - this.startTime,
      status,
      attributes: this.attributes,
    };
    if (error instanceof Error) {
      spanData.error = { message: error.message, stack: error.stack };
    } else if (error) {
      spanData.error = { message: String(error) };
    }
    writeSpan(spanData);
  }

  /** 创建子 span */
  child(name: string, attributes?: Record<string, unknown>): Span {
    return new Span(this.traceId, genId(8), this.spanId, name, attributes);
  }
}

/**
 * 便捷方法：包装 async 函数自动追踪
 */
export async function traceAsync<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, unknown>,
  parentId?: string | null,
): Promise<T> {
  const span = beginSpan(name, attributes, parentId);
  try {
    const result = await fn(span);
    span.end('ok');
    return result;
  } catch (err) {
    span.end('error', err);
    throw err;
  }
}

/**
 * 同步追踪（用于非 async 场景）
 */
export function traceSync<T>(
  name: string,
  fn: (span: Span) => T,
  attributes?: Record<string, unknown>,
  parentId?: string | null,
): T {
  const span = beginSpan(name, attributes, parentId);
  try {
    const result = fn(span);
    span.end('ok');
    return result;
  } catch (err) {
    span.end('error', err);
    throw err;
  }
}
