/**
 * Health Monitor - 全局健康监控
 *
 * 定期检查所有模块状态，计算综合健康评分，
 * 检测退化模式，提供可操作的告警。
 */

import { MetricsCollector } from './types.js';

/**
 * 单个模块的健康状态
 */
export interface ModuleHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'failed' | 'unknown';
  score: number; // [0, 1]
  message?: string;
  lastChecked: number;
}

/**
 * 综合健康报告
 */
export interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'booting';
  overallScore: number; // [0, 1]
  modules: ModuleHealth[];
  alerts: HealthAlert[];
  uptime: number;
  checkedAt: number;
}

/**
 * 健康告警
 */
export interface HealthAlert {
  severity: 'warning' | 'critical';
  module: string;
  message: string;
  suggestion: string;
}

/**
 * 模块健康检查函数
 */
export type ModuleHealthChecker = () => ModuleHealth;

/**
 * 模块恢复动作
 */
export type RecoveryAction = () => boolean;

/**
 * Agent 模块状态接口（与 agent.getStatus() 兼容）
 */
interface AgentModuleStatus {
  brainstem: { phase: string; loopCount: number };
  hippocampus: { episodes: number; semanticNodes: number };
  prefrontal: { activePlans: number; completedGoals: number };
  synapse: { cells: number; cellTypes?: string[] };
  sensory: { connected: boolean; channels?: string[] };
}

/**
 * 全局健康监控器
 *
 * 从 agent 各模块收集状态，计算综合健康评分。
 * 不主动轮询——由外部按需调用 check()。
 */
export class HealthMonitor {
  private readonly checkers: Map<string, ModuleHealthChecker> = new Map();
  private readonly recoveries: Map<string, RecoveryAction> = new Map();
  private readonly metrics: MetricsCollector;
  private lastReport: HealthReport | null = null;
  private startTime = Date.now();
  private recoveryLog: Array<{ module: string; timestamp: number; success: boolean }> = [];

  constructor() {
    this.metrics = MetricsCollector.getInstance();
  }

  /**
   * 注册模块健康检查器
   */
  registerModule(name: string, checker: ModuleHealthChecker): void {
    this.checkers.set(name, checker);
  }

  /**
   * 注册模块恢复动作
   *
   * 当模块状态为 degraded 或 failed 时，自动调用恢复动作。
   * 恢复动作返回 true 表示成功恢复。
   */
  registerRecovery(name: string, action: RecoveryAction): void {
    this.recoveries.set(name, action);
  }

  /**
   * 从 agent 状态批量注册所有内置模块检查器
   */
  registerAgentModules(
    getStatus: () => { running: boolean; modules: AgentModuleStatus },
    getPersona: () => { name: string; traits: string[]; bio: string },
    getMemoryStats: () => { totalEpisodes: number; shortTermCount: number; longTermCount: number; associationCount: number },
  ): void {
    // Brainstem
    this.registerModule('brainstem', () => {
      const status = getStatus();
      if (!status.running) {
        return { name: 'brainstem', status: 'unknown', score: 0, message: 'Agent not running', lastChecked: Date.now() };
      }
      const phase = status.modules.brainstem.phase;
      const loopCount = status.modules.brainstem.loopCount;
      const isHealthy = ['perceive', 'reason', 'act', 'reflect', 'evolve'].includes(phase);
      return {
        name: 'brainstem',
        status: isHealthy ? 'healthy' : 'degraded',
        score: isHealthy ? 1 : 0.5,
        message: `Phase: ${phase}, Loops: ${loopCount}`,
        lastChecked: Date.now(),
      };
    });

    // Hippocampus (Memory)
    this.registerModule('hippocampus', () => {
      const memStats = getMemoryStats();
      const total = memStats.totalEpisodes;
      // Healthy if we have episodes stored (system is active)
      const score = total > 0 ? Math.min(1, 0.5 + total / 100) : 0.3;
      return {
        name: 'hippocampus',
        status: score > 0.5 ? 'healthy' : score > 0.2 ? 'degraded' : 'unknown',
        score,
        message: `${total} episodes, ${memStats.associationCount} associations`,
        lastChecked: Date.now(),
      };
    });

    // Synapse (Cells)
    this.registerModule('synapse', () => {
      const status = getStatus();
      const cellCount = status.modules.synapse.cells;
      return {
        name: 'synapse',
        status: 'healthy',
        score: 1,
        message: `${cellCount} cells active`,
        lastChecked: Date.now(),
      };
    });

    // Sensory
    this.registerModule('sensory', () => {
      const status = getStatus();
      const connected = status.modules.sensory.connected;
      return {
        name: 'sensory',
        status: connected ? 'healthy' : 'failed',
        score: connected ? 1 : 0,
        message: connected ? 'Connected' : 'Disconnected',
        lastChecked: Date.now(),
      };
    });

    // Persona
    this.registerModule('persona', () => {
      const persona = getPersona();
      const hasTraits = persona.traits.length > 0;
      return {
        name: 'persona',
        status: 'healthy',
        score: hasTraits ? 1 : 0.7,
        message: `${persona.name} (${persona.traits.length} traits)`,
        lastChecked: Date.now(),
      };
    });

    // LLM (from metrics)
    this.registerModule('llm', () => {
      const health = this.metrics.healthCheck();
      const errorRate = health.llm.errorRate;
      const score = Math.max(0, 1 - errorRate * 2);
      return {
        name: 'llm',
        status: score > 0.7 ? 'healthy' : score > 0.3 ? 'degraded' : 'failed',
        score,
        message: `${health.llm.calls} calls, ${(errorRate * 100).toFixed(1)}% error rate`,
        lastChecked: Date.now(),
      };
    });
  }

  /**
   * 执行健康检查并生成报告
   */
  check(): HealthReport {
    const modules: ModuleHealth[] = [];
    const alerts: HealthAlert[] = [];

    for (const [name, checker] of this.checkers) {
      try {
        const health = checker();
        modules.push(health);

        // Generate alerts for degraded/failed modules + auto-recovery
        if (health.status === 'failed' || health.status === 'degraded') {
          const recovered = this.tryRecover(name);
          const prefix = recovered ? '[Auto-recovered] ' : '';

          if (health.status === 'failed') {
            alerts.push({
              severity: 'critical',
              module: name,
              message: `${prefix}${name} is in failed state: ${health.message ?? 'unknown'}`,
              suggestion: `Investigate ${name} module. Check logs for errors.`,
            });
          } else {
            alerts.push({
              severity: 'warning',
              module: name,
              message: `${prefix}${name} is degraded: ${health.message ?? 'performance below threshold'}`,
              suggestion: `Monitor ${name}. Consider restart if condition persists.`,
            });
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        modules.push({
          name,
          status: 'failed',
          score: 0,
          message: `Check failed: ${msg}`,
          lastChecked: Date.now(),
        });
        alerts.push({
          severity: 'critical',
          module: name,
          message: `Health check threw: ${msg}`,
          suggestion: `Fix the error in ${name} module checker.`,
        });
      }
    }

    // Calculate overall score (average of all module scores)
    const overallScore = modules.length > 0
      ? modules.reduce((sum, m) => sum + m.score, 0) / modules.length
      : 0;

    // Determine overall status
    let status: HealthReport['status'];
    if (modules.length === 0) {
      status = 'booting';
    } else if (overallScore >= 0.8) {
      status = 'healthy';
    } else if (overallScore >= 0.5) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    const report: HealthReport = {
      status,
      overallScore: Math.round(overallScore * 100) / 100,
      modules,
      alerts,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checkedAt: Date.now(),
    };

    this.lastReport = report;
    return report;
  }

  /**
   * 获取上次报告
   */
  getLastReport(): HealthReport | null {
    return this.lastReport;
  }

  /**
   * 获取告警数量
   */
  getAlertCount(): { warnings: number; criticals: number } {
    if (!this.lastReport) {
      return { warnings: 0, criticals: 0 };
    }
    return {
      warnings: this.lastReport.alerts.filter(a => a.severity === 'warning').length,
      criticals: this.lastReport.alerts.filter(a => a.severity === 'critical').length,
    };
  }

  /**
   * 尝试恢复退化/失败的模块
   *
   * 限制恢复频率（同一模块 60 秒内只尝试一次），避免恢复风暴。
   * 返回 true 表示尝试了恢复（不保证成功）。
   */
  private tryRecover(moduleName: string): boolean {
    const recovery = this.recoveries.get(moduleName);
    if (!recovery) return false;

    // 频率限制：60 秒内不重复恢复同一模块
    const lastAttempt = this.recoveryLog
      .filter(r => r.module === moduleName)
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    if (lastAttempt && Date.now() - lastAttempt.timestamp < 60_000) {
      return false;
    }

    try {
      const success = recovery();
      this.recoveryLog.push({ module: moduleName, timestamp: Date.now(), success });
      // 保留最近 100 条记录
      if (this.recoveryLog.length > 100) {
        this.recoveryLog = this.recoveryLog.slice(-100);
      }
      return success;
    } catch {
      this.recoveryLog.push({ module: moduleName, timestamp: Date.now(), success: false });
      return false;
    }
  }

  /**
   * 获取恢复日志
   */
  getRecoveryLog(): ReadonlyArray<{ module: string; timestamp: number; success: boolean }> {
    return this.recoveryLog;
  }

  /**
   * 格式化报告为可读字符串
   */
  formatReport(report?: HealthReport): string {
    const r = report ?? this.lastReport;
    if (!r) {
      return 'No health report available.';
    }

    const lines: string[] = [];
    const icon = r.status === 'healthy' ? '✅' : r.status === 'degraded' ? '⚠️' : r.status === 'unhealthy' ? '❌' : '🔄';

    lines.push(`${icon} System Health: ${r.status} (${(r.overallScore * 100).toFixed(0)}%)`);
    lines.push(`   Uptime: ${Math.floor(r.uptime / 60)}m ${r.uptime % 60}s`);
    lines.push('');

    for (const mod of r.modules) {
      const modIcon = mod.status === 'healthy' ? '✓' : mod.status === 'degraded' ? '!' : mod.status === 'failed' ? '✗' : '?';
      lines.push(`   ${modIcon} ${mod.name.padEnd(12)} ${mod.score.toFixed(2)}  ${mod.message ?? ''}`);
    }

    if (r.alerts.length > 0) {
      lines.push('');
      lines.push(`   Alerts (${r.alerts.length}):`);
      for (const alert of r.alerts) {
        lines.push(`     ${alert.severity === 'critical' ? '🔴' : '🟡'} ${alert.message}`);
      }
    }

    return lines.join('\n');
  }
}
