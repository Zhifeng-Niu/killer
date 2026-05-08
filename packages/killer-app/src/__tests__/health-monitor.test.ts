/**
 * Health Monitor Tests
 *
 * 测试全局健康监控的模块注册、健康检查、告警生成
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HealthMonitor, type ModuleHealth } from '../metrics/health-monitor.js';
import { MetricsCollector } from '../metrics/types.js';

describe('HealthMonitor', () => {
  let monitor: HealthMonitor;

  beforeEach(() => {
    MetricsCollector.reset();
    monitor = new HealthMonitor();
  });

  describe('Module Registration', () => {
    it('should register module checkers', () => {
      monitor.registerModule('test', () => ({
        name: 'test',
        status: 'healthy',
        score: 1,
        lastChecked: Date.now(),
      }));

      const report = monitor.check();
      expect(report.modules.length).toBe(1);
      expect(report.modules[0].name).toBe('test');
    });

    it('should handle empty checkers', () => {
      const report = monitor.check();
      expect(report.modules).toEqual([]);
      expect(report.status).toBe('booting');
      expect(report.overallScore).toBe(0);
    });
  });

  describe('Health Scoring', () => {
    it('should report healthy when all modules score high', () => {
      monitor.registerModule('a', () => ({ name: 'a', status: 'healthy', score: 0.95, lastChecked: Date.now() }));
      monitor.registerModule('b', () => ({ name: 'b', status: 'healthy', score: 0.90, lastChecked: Date.now() }));

      const report = monitor.check();
      expect(report.status).toBe('healthy');
      expect(report.overallScore).toBeGreaterThanOrEqual(0.8);
    });

    it('should report degraded when some modules score low', () => {
      monitor.registerModule('a', () => ({ name: 'a', status: 'healthy', score: 1.0, lastChecked: Date.now() }));
      monitor.registerModule('b', () => ({ name: 'b', status: 'degraded', score: 0.3, lastChecked: Date.now() }));

      const report = monitor.check();
      expect(report.status).toBe('degraded');
      expect(report.overallScore).toBeLessThan(0.8);
      expect(report.overallScore).toBeGreaterThanOrEqual(0.5);
    });

    it('should report unhealthy when most modules fail', () => {
      monitor.registerModule('a', () => ({ name: 'a', status: 'failed', score: 0, lastChecked: Date.now() }));
      monitor.registerModule('b', () => ({ name: 'b', status: 'failed', score: 0.1, lastChecked: Date.now() }));

      const report = monitor.check();
      expect(report.status).toBe('unhealthy');
      expect(report.overallScore).toBeLessThan(0.5);
    });
  });

  describe('Alert Generation', () => {
    it('should generate critical alerts for failed modules', () => {
      monitor.registerModule('db', () => ({
        name: 'db',
        status: 'failed',
        score: 0,
        message: 'Connection refused',
        lastChecked: Date.now(),
      }));

      const report = monitor.check();
      const criticals = report.alerts.filter(a => a.severity === 'critical');
      expect(criticals.length).toBe(1);
      expect(criticals[0].module).toBe('db');
      expect(criticals[0].message).toContain('failed');
    });

    it('should generate warning alerts for degraded modules', () => {
      monitor.registerModule('cache', () => ({
        name: 'cache',
        status: 'degraded',
        score: 0.4,
        message: 'High latency',
        lastChecked: Date.now(),
      }));

      const report = monitor.check();
      const warnings = report.alerts.filter(a => a.severity === 'warning');
      expect(warnings.length).toBe(1);
      expect(warnings[0].module).toBe('cache');
    });

    it('should not generate alerts for healthy modules', () => {
      monitor.registerModule('api', () => ({
        name: 'api',
        status: 'healthy',
        score: 1,
        lastChecked: Date.now(),
      }));

      const report = monitor.check();
      expect(report.alerts.length).toBe(0);
    });

    it('should handle checker errors gracefully', () => {
      monitor.registerModule('broken', () => {
        throw new Error('Checker crashed');
      });

      const report = monitor.check();
      expect(report.modules.length).toBe(1);
      expect(report.modules[0].status).toBe('failed');
      expect(report.alerts.length).toBe(1);
      expect(report.alerts[0].message).toContain('Checker crashed');
    });
  });

  describe('Report Formatting', () => {
    it('should format report as readable string', () => {
      monitor.registerModule('brain', () => ({
        name: 'brain',
        status: 'healthy',
        score: 0.95,
        message: 'Running smoothly',
        lastChecked: Date.now(),
      }));

      const report = monitor.check();
      const formatted = monitor.formatReport(report);

      expect(formatted).toContain('healthy');
      expect(formatted).toContain('brain');
      expect(formatted).toContain('95%');
      expect(formatted).toContain('Running smoothly');
    });

    it('should show "No health report" when none available', () => {
      const formatted = monitor.formatReport();
      expect(formatted).toContain('No health report');
    });
  });

  describe('Last Report', () => {
    it('should store last report', () => {
      monitor.registerModule('x', () => ({
        name: 'x', status: 'healthy', score: 1, lastChecked: Date.now(),
      }));

      monitor.check();
      const last = monitor.getLastReport();
      expect(last).not.toBeNull();
      expect(last!.modules[0].name).toBe('x');
    });

    it('should count alerts', () => {
      monitor.registerModule('ok', () => ({
        name: 'ok', status: 'healthy', score: 1, lastChecked: Date.now(),
      }));
      monitor.registerModule('bad', () => ({
        name: 'bad', status: 'failed', score: 0, lastChecked: Date.now(),
      }));

      monitor.check();
      const count = monitor.getAlertCount();
      expect(count.warnings).toBe(0);
      expect(count.criticals).toBe(1);
    });
  });
});
