/**
 * Lifecycle Hooks Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { LifecycleHooks } from '../orchestrator/hooks.js';

describe('LifecycleHooks', () => {
  it('should call handlers on emit', async () => {
    const hooks = new LifecycleHooks();
    const calls: string[] = [];

    hooks.on('boot:start', () => { calls.push('start'); });
    hooks.on('boot:complete', () => { calls.push('complete'); });

    await hooks.emit('boot:start');
    await hooks.emit('boot:complete');

    expect(calls).toEqual(['start', 'complete']);
  });

  it('should pass payload to handlers', async () => {
    const hooks = new LifecycleHooks();
    let received: Record<string, unknown> = {};

    hooks.on('input:received', (payload) => { received = payload; });

    await hooks.emit('input:received', { content: 'hello', channel: 'cli' });

    expect(received).toEqual({ content: 'hello', channel: 'cli' });
  });

  it('should support async handlers', async () => {
    const hooks = new LifecycleHooks();
    const order: number[] = [];

    hooks.on('llm:call', async () => {
      order.push(1);
      await new Promise(r => setTimeout(r, 5));
      order.push(2);
    });

    hooks.on('llm:call', () => { order.push(3); });

    await hooks.emit('llm:call');

    expect(order).toEqual([1, 2, 3]);
  });

  it('should unsubscribe with off()', async () => {
    const hooks = new LifecycleHooks();
    let count = 0;

    const sub = hooks.on('tool:execute', () => { count++; });

    await hooks.emit('tool:execute');
    expect(count).toBe(1);

    hooks.off(sub);
    await hooks.emit('tool:execute');
    expect(count).toBe(1);
  });

  it('should not fail when handler throws', async () => {
    const hooks = new LifecycleHooks();
    let afterError = false;

    hooks.on('cycle:start', () => { throw new Error('boom'); });
    hooks.on('cycle:start', () => { afterError = true; });

    await hooks.emit('cycle:start');
    expect(afterError).toBe(true);
  });

  it('should report listener count', () => {
    const hooks = new LifecycleHooks();
    expect(hooks.listenerCount('goal:created')).toBe(0);

    hooks.on('goal:created', () => {});
    hooks.on('goal:created', () => {});
    expect(hooks.listenerCount('goal:created')).toBe(2);
  });

  it('should handle error:pipeline event', async () => {
    const hooks = new LifecycleHooks();
    let received: Record<string, unknown> = {};

    hooks.on('error:pipeline', (payload) => { received = payload; });

    await hooks.emit('error:pipeline', { error: 'test error', input: 'hello' });

    expect(received).toEqual({ error: 'test error', input: 'hello' });
  });

  it('should clear all handlers', async () => {
    const hooks = new LifecycleHooks();
    let count = 0;

    hooks.on('boot:start', () => { count++; });
    hooks.on('boot:complete', () => { count++; });

    hooks.clear();

    await hooks.emit('boot:start');
    await hooks.emit('boot:complete');
    expect(count).toBe(0);
  });

  it('should support multiple handlers for same event', async () => {
    const hooks = new LifecycleHooks();
    const results: number[] = [];

    hooks.on('memory:store', () => { results.push(1); });
    hooks.on('memory:store', () => { results.push(2); });
    hooks.on('memory:store', () => { results.push(3); });

    await hooks.emit('memory:store');
    expect(results).toEqual([1, 2, 3]);
  });

  it('should not call handlers for different events', async () => {
    const hooks = new LifecycleHooks();
    let received = false;

    hooks.on('boot:start', () => { received = true; });
    await hooks.emit('shutdown:start');

    expect(received).toBe(false);
  });

  it('should handle emit with no subscribers gracefully', async () => {
    const hooks = new LifecycleHooks();
    await expect(hooks.emit('delegate:start', { task: 'test' })).resolves.toBeUndefined();
  });

  it('should use default empty payload when none provided', async () => {
    const hooks = new LifecycleHooks();
    let received: Record<string, unknown> | undefined;

    hooks.on('input:received', (p) => { received = p; });
    await hooks.emit('input:received');

    expect(received).toEqual({});
  });

  it('should return subscription with correct event and handler ref', () => {
    const hooks = new LifecycleHooks();
    const handler = () => {};

    const sub = hooks.on('plugin:loaded', handler);

    expect(sub.event).toBe('plugin:loaded');
    expect(sub.handler).toBe(handler);
  });

  it('off() with already-removed handler should not throw', () => {
    const hooks = new LifecycleHooks();
    const sub = hooks.on('goal:created', () => {});

    hooks.off(sub);
    expect(() => hooks.off(sub)).not.toThrow();
  });

  it('off() for event with no subscribers should not throw', () => {
    const hooks = new LifecycleHooks();
    expect(() => {
      hooks.off({ event: 'delegate:complete', handler: () => {} });
    }).not.toThrow();
  });

  it('listenerCount should decrease after off()', () => {
    const hooks = new LifecycleHooks();

    const sub1 = hooks.on('cell:spawn', () => {});
    const sub2 = hooks.on('cell:spawn', () => {});

    expect(hooks.listenerCount('cell:spawn')).toBe(2);

    hooks.off(sub1);
    expect(hooks.listenerCount('cell:spawn')).toBe(1);

    hooks.off(sub2);
    expect(hooks.listenerCount('cell:spawn')).toBe(0);
  });

  it('should pass same payload to all handlers', async () => {
    const hooks = new LifecycleHooks();
    const results: Record<string, unknown>[] = [];

    hooks.on('tool:result', (p) => { results.push(p); });
    hooks.on('tool:result', (p) => { results.push(p); });

    const payload = { tool: 'read', output: 'data' };
    await hooks.emit('tool:result', payload);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual(payload);
    expect(results[1]).toEqual(payload);
  });
});
