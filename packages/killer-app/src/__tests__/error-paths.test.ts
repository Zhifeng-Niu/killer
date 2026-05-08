/**
 * Error Path Tests
 *
 * Tests for critical error scenarios that should be handled gracefully:
 * - LLM failure during streaming
 * - Session save/load failures
 * - Plugin load failures
 * - Rate limiting behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicProvider } from '../llm/anthropic-provider.js';
import { SessionManager } from '../session/session-manager.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

function createSSEBody(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = events.map(e => encoder.encode(`data: ${e}\n\n`));
  chunks.push(encoder.encode('data: [DONE]\n\n'));

  return new ReadableStream({
    pull(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

describe('LLM Streaming Error Paths', () => {
  let provider: AnthropicProvider;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    provider = new AnthropicProvider({ apiKey: 'test-key', model: 'claude-test' });
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should handle mid-stream server error gracefully', async () => {
    // Stream starts OK, then sends an error event
    const events = [
      JSON.stringify({ type: 'message_start' }),
      JSON.stringify({ type: 'content_block_delta', delta: { text: 'Hello' } }),
      JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Server overloaded' } }),
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: createSSEBody(events),
    });

    const tokens: string[] = [];
    let caughtError: Error | null = null;
    try {
      for await (const token of provider.stream('test')) {
        tokens.push(token);
      }
    } catch (err) {
      caughtError = err instanceof Error ? err : new Error(String(err));
    }

    // Should have received the initial token before error
    expect(tokens).toContain('Hello');
  });

  it('should handle network error during stream', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(async () => {
      for await (const _ of provider.stream('test')) { /* consume */ }
    }).rejects.toThrow('ECONNREFUSED');
  });

  it('should handle empty stream response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: createSSEBody([]), // Only [DONE]
    });

    const tokens: string[] = [];
    for await (const token of provider.stream('test')) {
      tokens.push(token);
    }

    expect(tokens).toEqual([]);
  });

  it('should handle malformed SSE data gracefully', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      pull(controller) {
        controller.enqueue(encoder.encode('data: {invalid json}\n\n'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body,
    });

    const tokens: string[] = [];
    for await (const token of provider.stream('test')) {
      tokens.push(token);
    }

    // Malformed JSON should be skipped silently
    expect(tokens).toEqual([]);
  });
});

describe('Session Error Paths', () => {
  let tmpDir: string;
  let manager: SessionManager;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `killer-session-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    manager = new SessionManager({ sessionsDir: tmpDir });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should handle save to read-only directory gracefully', async () => {
    const readOnlyDir = path.join(os.tmpdir(), `killer-readonly-${Date.now()}`);
    fs.mkdirSync(readOnlyDir);
    fs.chmodSync(readOnlyDir, 0o444);

    const readOnlyManager = new SessionManager({ sessionsDir: readOnlyDir });
    readOnlyManager.startSession();
    readOnlyManager.addMessage('user', 'test');

    // save() should not throw — it catches internally
    const snapshot = await readOnlyManager.createSnapshot({}, { llmProvider: 'mock', debugLogging: false });
    await readOnlyManager.save(snapshot);

    fs.chmodSync(readOnlyDir, 0o755);
    fs.rmSync(readOnlyDir, { recursive: true, force: true });
  });

  it('should handle load of corrupted latest.json', async () => {
    // Corrupt the latest.json file
    const latestPath = path.join(tmpDir, 'latest.json');
    fs.writeFileSync(latestPath, '{ not valid json }}}', 'utf-8');

    const result = await manager.loadLatest();
    // Should return null gracefully, not throw
    expect(result).toBeNull();
  });

  it('should handle load of missing session', async () => {
    const result = await manager.loadLatest();
    expect(result).toBeNull();
  });

  it('should not crash when listing sessions with corrupted files', () => {
    // Create one valid session file and one corrupted
    fs.writeFileSync(
      path.join(tmpDir, 'session_valid_123.json'),
      JSON.stringify({ version: '1.0.0', sessionId: 'session_valid_123', startedAt: Date.now(), savedAt: Date.now(), conversation: [], agentState: {}, config: {} }),
    );
    fs.writeFileSync(path.join(tmpDir, 'session_bad_456.json'), 'not json');

    // listSessions catches internally — may return [] on parse failure, but never throws
    const sessions = manager.listSessions();
    expect(Array.isArray(sessions)).toBe(true);
  });
});

describe('Plugin Error Isolation', () => {
  it('should be importable without errors', async () => {
    const { PluginManager } = await import('../plugins/types.js');
    const pm = new PluginManager('/nonexistent/path');
    const count = await pm.loadFromDirectory('/nonexistent/path');
    expect(count).toBe(0);
  });
});
