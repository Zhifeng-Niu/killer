/**
 * Metrics Collection Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector, Counter, Gauge, Histogram } from '../metrics/index.js';

describe('Counter', () => {
  it('should increment and get value', () => {
    const c = new Counter('test');
    expect(c.get()).toBe(0);
    c.inc();
    expect(c.get()).toBe(1);
    c.inc(5);
    expect(c.get()).toBe(6);
  });

  it('should reset to zero', () => {
    const c = new Counter('test');
    c.inc(10);
    c.reset();
    expect(c.get()).toBe(0);
  });

  it('should produce snapshot', () => {
    const c = new Counter('requests', { method: 'GET' });
    c.inc(3);
    const snap = c.snapshot();
    expect(snap.type).toBe('counter');
    expect(snap.name).toBe('requests');
    expect(snap.value).toBe(3);
    expect(snap.labels).toEqual({ method: 'GET' });
  });
});

describe('Gauge', () => {
  it('should inc, dec, and set', () => {
    const g = new Gauge('connections');
    g.inc();
    expect(g.get()).toBe(1);
    g.inc(4);
    expect(g.get()).toBe(5);
    g.dec(2);
    expect(g.get()).toBe(3);
    g.set(42);
    expect(g.get()).toBe(42);
  });

  it('should produce snapshot', () => {
    const g = new Gauge('temp');
    g.set(23.5);
    const snap = g.snapshot();
    expect(snap.type).toBe('gauge');
    expect(snap.value).toBe(23.5);
  });
});

describe('Histogram', () => {
  it('should observe values and compute stats', () => {
    const h = new Histogram('latency', [0.1, 0.5, 1, 5]);
    h.observe(0.05);
    h.observe(0.3);
    h.observe(0.8);
    h.observe(3);

    const stats = h.getStats();
    expect(stats.count).toBe(4);
    expect(stats.sum).toBeCloseTo(4.15, 1);
    expect(stats.avg).toBeCloseTo(1.0375, 2);
  });

  it('should time operations with startTimer', () => {
    const h = new Histogram('duration');
    const stop = h.startTimer();
    stop();

    const stats = h.getStats();
    expect(stats.count).toBe(1);
    expect(stats.sum).toBeGreaterThan(0);
  });

  it('should reset', () => {
    const h = new Histogram('test');
    h.observe(1);
    h.observe(2);
    h.reset();
    expect(h.getStats().count).toBe(0);
  });
});

describe('MetricsCollector', () => {
  beforeEach(() => {
    MetricsCollector.reset();
  });

  it('should be a singleton', () => {
    const a = MetricsCollector.getInstance();
    const b = MetricsCollector.getInstance();
    expect(a).toBe(b);
  });

  it('should register and retrieve counters', () => {
    const m = MetricsCollector.getInstance();
    const c = m.counter('requests');
    c.inc(10);
    expect(m.counter('requests').get()).toBe(10);
  });

  it('should register and retrieve gauges', () => {
    const m = MetricsCollector.getInstance();
    m.gauge('connections').set(5);
    expect(m.gauge('connections').get()).toBe(5);
  });

  it('should register and retrieve histograms', () => {
    const m = MetricsCollector.getInstance();
    m.histogram('latency').observe(0.5);
    expect(m.histogram('latency').getStats().count).toBe(1);
  });

  it('should produce full snapshot', () => {
    const m = MetricsCollector.getInstance();
    m.counter('req').inc(3);
    m.gauge('conn').set(2);
    m.histogram('lat').observe(0.1);

    const snap = m.snapshot();
    expect(snap.uptime_seconds).toBeGreaterThanOrEqual(0);
    expect(snap.timestamp).toBeGreaterThan(0);
    expect(snap.metrics).toHaveLength(3);
    expect(snap.metrics.map(s => s.name)).toContain('req');
  });

  it('should compute health check', () => {
    const m = MetricsCollector.getInstance();
    m.counter('llm_calls_total').inc(10);
    m.counter('llm_errors_total').inc(1);
    m.histogram('llm_latency_seconds').observe(0.5);

    const health = m.healthCheck();
    expect(health.status).toBe('healthy');
    expect(health.llm.calls).toBe(10);
    expect(health.llm.errors).toBe(1);
    expect(health.llm.errorRate).toBe(0.1);
  });

  it('should detect unhealthy state', () => {
    const m = MetricsCollector.getInstance();
    m.counter('llm_calls_total').inc(10);
    m.counter('llm_errors_total').inc(6);

    const health = m.healthCheck();
    expect(health.status).toBe('unhealthy');
  });

  it('should detect degraded state', () => {
    const m = MetricsCollector.getInstance();
    m.counter('llm_calls_total').inc(10);
    m.counter('llm_errors_total').inc(3);

    const health = m.healthCheck();
    expect(health.status).toBe('degraded');
  });

  it('should reset all metrics', () => {
    const m = MetricsCollector.getInstance();
    m.counter('test').inc(100);
    m.reset();
    expect(m.counter('test').get()).toBe(0);
  });

  it('should separate metrics by labels', () => {
    const m = MetricsCollector.getInstance();
    m.counter('http', { method: 'GET' }).inc(5);
    m.counter('http', { method: 'POST' }).inc(3);

    expect(m.counter('http', { method: 'GET' }).get()).toBe(5);
    expect(m.counter('http', { method: 'POST' }).get()).toBe(3);
  });
});
