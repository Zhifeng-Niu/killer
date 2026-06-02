/**
 * Cerebellum - 实验策略编排器
 *
 * 将 Odyssey Engine 的自主迭代能力内化为大脑区域。
 * Cerebellum 编排完整的实验航点循环：
 *   compass → checkpoint → act → verify → decide → record
 */

import type {
  AttemptHistory,
  CompassReading,
  Experiment,
  ExperimentDecision,
  ExperimentResult,
  Mission,
  MissionConfig,
  StateSnapshot,
  Surprise,
  TerminationCondition,
  VerificationResult,
} from './types.js';
import { DEFAULT_MISSION_CONFIG } from './types.js';
import type { CommandExecutor } from './command-executor.js';
import { Compass } from './compass.js';
import { Evaluator } from './evaluator.js';
import { ExperimentTracker } from './experiment-tracker.js';

/**
 * Cerebellum - 实验策略编排器
 *
 * 用法（低门槛）：
 * ```typescript
 * const cerebellum = new Cerebellum();
 * const mission = cerebellum.createMission({ goal: '优化 API 延迟低于 200ms' });
 * // Cerebellum 自动接管循环
 * ```
 */
/**
 * 实验结果反馈回调 — 用于将成功的实验发现反馈到进化系统
 */
export type ExperimentFeedbackCallback = (
  experiment: Experiment,
  decision: ExperimentDecision,
  lessons: string[],
) => void;

export class Cerebellum {
  private readonly compass: Compass;
  private readonly tracker: ExperimentTracker;
  private readonly evaluators: Map<string, Evaluator> = new Map();
  private readonly executor: CommandExecutor | null;
  private readonly onExperimentComplete?: ExperimentFeedbackCallback;

  private activeMission: Mission | null = null;
  private activeExperiment: Experiment | null = null;
  private waypointCounter: number = 0;

  constructor(executor?: CommandExecutor, onExperimentComplete?: ExperimentFeedbackCallback) {
    this.compass = new Compass();
    this.tracker = new ExperimentTracker();
    this.executor = executor ?? null;
    this.onExperimentComplete = onExperimentComplete;
  }

  // ── Mission Management ──

  /**
   * 创建新任务 — 简化的低门槛接口
   *
   * 只需要 goal，其他参数全部有合理默认值
   */
  createMission(config: MissionConfig): Mission {
    const merged = { ...DEFAULT_MISSION_CONFIG, ...config };

    const mission: Mission = {
      id: `mission_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      goal: config.goal,
      context: config.context,
      orientation: merged.orientation,
      metrics: merged.metrics,
      guard: merged.guard
        ? { command: merged.guard, timeout: 120_000 }
        : undefined,
      termination: this.buildTerminationConditions(merged),
      scope: merged.scope,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.tracker.registerMission(mission);

    // 创建对应的 evaluator
    this.evaluators.set(
      mission.id,
      new Evaluator(
        mission.metrics,
        mission.guard?.command,
        mission.guard?.timeout,
        this.executor ?? undefined,
      ),
    );

    return mission;
  }

  /**
   * 激活任务 — 开始实验循环
   */
  activateMission(mission: Mission): void {
    this.activeMission = mission;
    this.waypointCounter = 0;
  }

  getActiveMission(): Mission | null {
    return this.activeMission;
  }

  getActiveExperiment(): Experiment | null {
    return this.activeExperiment;
  }

  hasActiveMission(): boolean {
    return this.activeMission !== null;
  }

  // ── Experiment Lifecycle ──

  /**
   * 开始新的实验航点
   */
  async beginExperiment(hypothesis: string): Promise<Experiment> {
    if (!this.activeMission) {
      throw new Error('No active mission. Call activateMission() first.');
    }

    this.waypointCounter++;

    const experiment: Experiment = {
      id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      missionId: this.activeMission.id,
      waypoint: this.waypointCounter,
      hypothesis,
      orientation: this.activeMission.orientation,
      checkpoint: await this.checkpoint(),
      status: 'running',
      changes: [],
      timestamp: Date.now(),
    };

    this.activeExperiment = experiment;
    return experiment;
  }

  /**
   * 创建状态快照 — 实验前的安全点
   */
  async checkpoint(): Promise<StateSnapshot> {
    return {
      id: `snap_${Date.now()}`,
      label: `waypoint-${this.waypointCounter}`,
      timestamp: Date.now(),
      description: `Checkpoint before waypoint ${this.waypointCounter}`,
      state: {},
    };
  }

  /**
   * 回滚到快照 — 实验失败时恢复
   */
  async rollback(_snapshot: StateSnapshot): Promise<void> {
    // 实际回滚逻辑由外部执行器实现（如 git reset --hard）
    // Cerebellum 只负责编排决策，不直接操作文件系统
  }

  /**
   * 验证实验结果 — 4 层管道
   */
  async verify(experiment: Experiment): Promise<VerificationResult> {
    const evaluator = this.evaluators.get(experiment.missionId);
    if (!evaluator) {
      throw new Error(`No evaluator for mission ${experiment.missionId}`);
    }

    const history = this.tracker.getHistory(experiment.missionId);
    return evaluator.verify(history.currentBest);
  }

  /**
   * 用外部测量值更新验证结果
   */
  updateVerification(
    experiment: Experiment,
    baseVerification: VerificationResult,
    measuredValues: Record<string, number>,
  ): VerificationResult {
    const evaluator = this.evaluators.get(experiment.missionId);
    if (!evaluator) return baseVerification;

    const history = this.tracker.getHistory(experiment.missionId);
    return evaluator.updateMetricValues(
      baseVerification,
      measuredValues,
      history.currentBest,
    );
  }

  /**
   * 决策 — 保留还是丢弃
   */
  decide(
    experiment: Experiment,
    verification: VerificationResult,
    history: AttemptHistory,
  ): ExperimentDecision {
    const evaluator = this.evaluators.get(experiment.missionId);
    if (!evaluator) return 'discard';

    const reading = this.compass.read(
      experiment.orientation,
      history,
      experiment.hypothesis,
    );

    return evaluator.decide(
      verification,
      experiment.orientation,
      reading.noveltyScore,
    );
  }

  // ── Compass ──

  /**
   * 读取策略指南针
   */
  readCompass(history: AttemptHistory): CompassReading {
    return this.compass.read(
      this.activeMission?.orientation ?? 'engineer',
      history,
      '',
    );
  }

  /**
   * 为给定的假设生成指南针读数
   */
  readCompassForHypothesis(
    history: AttemptHistory,
    hypothesis: string,
  ): CompassReading {
    return this.compass.read(
      this.activeMission?.orientation ?? 'engineer',
      history,
      hypothesis,
    );
  }

  // ── Tracking ──

  /**
   * 记录实验结果
   */
  recordOutcome(
    experiment: Experiment,
    decision: ExperimentDecision,
    verification: VerificationResult,
  ): void {
    experiment.status =
      decision === 'surprise' ? 'surprise' : decision === 'keep' ? 'kept' : 'discarded';

    this.tracker.record(experiment, decision, verification);
    this.activeExperiment = null;

    // 检测意外发现
    const surprise = this.detectSurprise(experiment, verification);
    if (surprise) {
      this.tracker.recordSurprise(surprise);
    }

    // 反馈成功的实验结果（kept 或 surprise）
    if (decision !== 'discard' && this.onExperimentComplete) {
      const lessons = experiment.result?.lessonsLearned ?? [];
      this.onExperimentComplete(experiment, decision, lessons);
    }
  }

  /**
   * MOSS风格Health-Probe检查
   *
   * 灵感: "MOSS: Self-Evolution through Source-Level Rewriting" (arXiv:2605.22794)
   * 核心机制：ephemeral trial worker验证 → health-probe-gated promote + rollback
   *
   * 在Odysseus中：
   * - 每次keep后自动运行health probe
   * - 如果health退化超过阈值，触发自动rollback警告
   * - health指标：连续失败率、指标退化趋势、stagnation信号
   */
  runHealthProbe(missionId?: string): {
    healthy: boolean;
    healthScore: number;
    warnings: string[];
    rollbackRecommended: boolean;
  } {
    const history = this.getHistory(missionId ?? this.activeMission?.id ?? '');
    const warnings: string[] = [];
    let healthScore = 1.0;

    // 1. 连续失败率
    if (history.consecutiveDiscards >= 3) {
      const penalty = Math.min(0.5, history.consecutiveDiscards * 0.1);
      healthScore -= penalty;
      warnings.push(`${history.consecutiveDiscards} consecutive discards detected`);
    }

    // 2. 成功率
    if (history.totalWaypoints > 0) {
      const successRate = history.wins.length / history.totalWaypoints;
      if (successRate < 0.3) {
        healthScore -= 0.3;
        warnings.push(`Low success rate: ${(successRate * 100).toFixed(0)}%`);
      }
    }

    // 3. Stagnation检测：最近N次没有改善
    if (history.deadEnds.length >= 5) {
      const recentDeadEnds = history.deadEnds.slice(-5);
      const allRecent = recentDeadEnds.every(d =>
        d.waypoint >= (history.totalWaypoints - 5)
      );
      if (allRecent && history.wins.length > 0) {
        healthScore -= 0.2;
        warnings.push('Recent stagnation: no success in last 5 attempts');
      }
    }

    // 4. 意外过多（可能是错误路径）
    if (history.surprises.length > history.wins.length * 2) {
      healthScore -= 0.15;
      warnings.push('High surprise-to-win ratio — possible wrong direction');
    }

    healthScore = Math.max(0, Math.min(1, healthScore));

    return {
      healthy: healthScore >= 0.5,
      healthScore,
      warnings,
      rollbackRecommended: healthScore < 0.3,
    };
  }

  /**
   * 获取尝试历史
   */
  getHistory(missionId?: string): AttemptHistory {
    return this.tracker.getHistory(missionId ?? this.activeMission?.id ?? '');
  }

  // ── Surprise Detection ──

  /**
   * 检测意外发现
   *
   * 当指标变化方向与假设预期不符时标记为意外
   */
  detectSurprise(
    experiment: Experiment,
    verification: VerificationResult,
  ): Surprise | null {
    const metricValues = verification.metric.values;
    const improved = verification.metric.improved;

    // 如果所有指标都没有改善，也不是完全失败 → 可能是意外
    const someImproved = Object.values(improved).some(v => v);
    const allFailed = Object.values(improved).every(v => !v);

    if (allFailed && experiment.orientation !== 'creative') return null;

    // 在创意模式下，任何反直觉结果都是意外
    if (experiment.orientation === 'creative' && someImproved) {
      // 检查是否与最近的成功模式不同
      const history = this.tracker.getHistory(experiment.missionId);
      const recentWins = history.wins.slice(-3);
      const isDifferentApproach = recentWins.every(
        w => w.hypothesis !== experiment.hypothesis,
      );

      if (isDifferentApproach) {
        return {
          id: `surprise_${Date.now()}`,
          experimentId: experiment.id,
          missionId: experiment.missionId,
          expectedOutcome: 'unknown — exploratory',
          actualOutcome: `Metric improved with novel approach: ${experiment.hypothesis}`,
          contradiction: 'novel approach succeeded where established ones may not',
          insight: experiment.hypothesis,
          noveltyScore: this.compass.read(
            experiment.orientation,
            history,
            experiment.hypothesis,
          ).noveltyScore,
          timestamp: Date.now(),
        };
      }
    }

    return null;
  }

  // ── Termination ──

  /**
   * 检查是否应该终止任务
   */
  checkTermination(
    history?: AttemptHistory,
    mission?: Mission,
  ): { terminated: boolean; reason?: string } {
    const m = mission ?? this.activeMission;
    if (!m) return { terminated: true, reason: 'no active mission' };

    const h = history ?? this.tracker.getHistory(m.id);

    for (const condition of m.termination) {
      switch (condition.type) {
        case 'max_waypoints':
          if (h.totalWaypoints >= Number(condition.value)) {
            return { terminated: true, reason: `max waypoints reached (${h.totalWaypoints})` };
          }
          break;

        case 'time_budget': {
          const elapsed = Date.now() - m.createdAt;
          if (elapsed >= Number(condition.value) * 1000) {
            return { terminated: true, reason: `time budget exceeded (${Math.round(elapsed / 1000)}s)` };
          }
          break;
        }

        case 'all_pass': {
          const allGuardsPass = h.wins.length > 0 && h.deadEnds.length === 0;
          const hasImprovement = Object.keys(h.currentBest).length > 0;
          if (allGuardsPass && hasImprovement) {
            return { terminated: true, reason: 'all checks pass and metric improved' };
          }
          break;
        }

        case 'metric_threshold': {
          const metricName = condition.metricName;
          if (metricName && h.currentBest[metricName] !== undefined) {
            const threshold = Number(condition.value);
            const current = h.currentBest[metricName];
            if (current !== null && current <= threshold) {
              return { terminated: true, reason: `${metricName} reached threshold: ${current} <= ${threshold}` };
            }
          }
          break;
        }
      }
    }

    // 卡住检测：10 次连续失败
    if (h.consecutiveDiscards >= 10) {
      return { terminated: true, reason: `stuck: ${h.consecutiveDiscards} consecutive discards` };
    }

    return { terminated: false };
  }

  // ── Helpers ──

  private buildTerminationConditions(
    config: Required<Omit<MissionConfig, 'goal'>>,
  ): TerminationCondition[] {
    const conditions: TerminationCondition[] = [];

    if (config.maxWaypoints > 0) {
      conditions.push({
        type: 'max_waypoints',
        value: config.maxWaypoints,
      });
    }

    if (config.timeBudgetSeconds > 0) {
      conditions.push({
        type: 'time_budget',
        value: config.timeBudgetSeconds,
      });
    }

    conditions.push({ type: 'all_pass', value: 'all_pass' });

    return conditions;
  }
}
