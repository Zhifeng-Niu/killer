/**
 * AutoMissionTool — Agent 自主创建自我改进任务
 *
 * 让 agent 在工具链循环中主动发起自我改进。
 * 与 Cerebellum 配合，实现：
 *   发现局限 → 创建任务 → 实验改进 → 验证 → 决定保留或回滚
 *
 * 这是黑暗智能的核心闭环：agent 不需要人类触发就能开始自我进化。
 */

import type { Tool, ToolResult } from './tool-executor.js';
import type { Cerebellum } from '../cerebellum/cerebellum.js';
import type { Orientation } from '../cerebellum/types.js';
import { analyzeMissionEntropy } from './decision-entropy.js';

export interface AutoMissionDeps {
  cerebellum: Cerebellum;
  onMissionCreated?: (goal: string, missionId: string) => void;
}

/**
 * auto_mission — Agent 自主发起改进任务
 *
 * Actions:
 *   "create" — 创建新任务，需要一个 goal
 *   "status" — 查看当前任务状态
 *   "waypoint" — 开始下一个实验航点（由 Cerebellum 编排）
 *   "decide"  — 对当前实验做决策（keep/discard）
 *   "abandon" — 放弃当前任务
 */
export class AutoMissionTool implements Tool {
  readonly name = 'auto_mission';
  readonly description =
    'Create and manage autonomous self-improvement missions. ' +
    'Use "create" to start a new self-improvement goal, "status" to check progress, ' +
    '"waypoint" to run the next experiment step, "decide" to keep or discard results, ' +
    '"abandon" to give up on the current mission. ' +
    'This is your primary tool for self-directed evolution.';
  private readonly cerebellum: Cerebellum;
  private readonly onMissionCreated?: (goal: string, missionId: string) => void;

  constructor(deps: AutoMissionDeps) {
    this.cerebellum = deps.cerebellum;
    this.onMissionCreated = deps.onMissionCreated;
  }

  async execute(params: unknown): Promise<ToolResult> {
    const { action, goal, orientation, hypothesis, decision, metric_values } = params as {
      action?: string;
      goal?: string;
      orientation?: Orientation;
      hypothesis?: string;
      decision?: 'keep' | 'discard';
      metric_values?: Record<string, number>;
    };

    const effectiveAction = action ?? 'status';

    switch (effectiveAction) {
      case 'create':
        return this.handleCreate(goal, orientation);
      case 'status':
        return this.handleStatus();
      case 'waypoint':
        return this.handleWaypoint(hypothesis);
      case 'decide':
        return this.handleDecide(decision, metric_values);
      case 'abandon':
        return this.handleAbandon();
      default:
        return { success: false, error: `Unknown action: ${effectiveAction}. Use: create, status, waypoint, decide, abandon` };
    }
  }

  private handleCreate(goal?: string, orientation?: Orientation): ToolResult {
    if (!goal) {
      return { success: false, error: 'Parameter "goal" is required for create action. Describe what you want to improve about yourself.' };
    }

    if (this.cerebellum.hasActiveMission()) {
      const current = this.cerebellum.getActiveMission();
      return {
        success: false,
        error: `A mission is already active: "${current?.goal}". Use "abandon" to cancel it first, or "status" to check progress.`,
      };
    }

    const mission = this.cerebellum.createMission({
      goal,
      orientation: orientation ?? 'engineer',
      guard: 'pnpm build 2>&1',
      metrics: [{
        name: 'type_error_count',
        unit: 'errors',
        measureCommand: 'npx tsc --noEmit 2>&1 | grep -c "error TS" || echo 0',
        direction: 'lower',
      }],
    });

    this.cerebellum.activateMission(mission);
    this.onMissionCreated?.(goal, mission.id);

    return {
      success: true,
      data: {
        missionId: mission.id,
        goal: mission.goal,
        orientation: mission.orientation,
        guard: 'pnpm build',
        metric: 'type_error_count (lower is better)',
        message: `Mission created: "${goal}". Build verification enabled. Use "waypoint" to start experimenting.`,
      },
    };
  }

  private handleStatus(): ToolResult {
    const mission = this.cerebellum.getActiveMission();
    if (!mission) {
      return {
        success: true,
        data: {
          activeMission: null,
          message: 'No active mission. Use "create" to start a self-improvement mission.',
        },
      };
    }

    const history = this.cerebellum.getHistory();
    const compass = this.cerebellum.readCompass(history);

    return {
      success: true,
      data: {
        missionId: mission.id,
        goal: mission.goal,
        orientation: mission.orientation,
        totalWaypoints: history.totalWaypoints,
        wins: history.wins.length,
        deadEnds: history.deadEnds.length,
        consecutiveDiscards: history.consecutiveDiscards,
        surprises: history.surprises.length,
        compass: {
          divergence: compass.divergence,
          stuckLevel: compass.stuckLevel,
          recommendedStrategy: compass.recommendedStrategy,
          noveltyScore: compass.noveltyScore,
        },
      },
    };
  }

  private async handleWaypoint(hypothesis?: string): Promise<ToolResult> {
    if (!this.cerebellum.hasActiveMission()) {
      return { success: false, error: 'No active mission. Use "create" to start one first.' };
    }

    const mission = this.cerebellum.getActiveMission()!;
    if (!hypothesis) {
      return {
        success: false,
        error: 'Parameter "hypothesis" is required for waypoint action. Describe what you want to try and why.',
      };
    }

    try {
      const experiment = await this.cerebellum.beginExperiment(hypothesis);

      // Entropy-Cut分析：从历史hypothesis中识别决策点（论①）
      const history = this.cerebellum.getHistory();
      const pastHypotheses = history.wins
        .concat(history.deadEnds)
        .map(e => e.hypothesis);
      const entropyAnalysis = analyzeMissionEntropy(pastHypotheses);

      const entropyHint = entropyAnalysis.topDecisionPoints.length > 0
        ? `\nEntropy-Cut hint: ${entropyAnalysis.recommendation}`
        : '';

      return {
        success: true,
        data: {
          experimentId: experiment.id,
          waypoint: experiment.waypoint,
          hypothesis: experiment.hypothesis,
          missionGoal: mission.goal,
          entropyDecisionPoints: entropyAnalysis.topDecisionPoints.length,
          message: `Experiment waypoint ${experiment.waypoint} started.${entropyHint} Now: use self_read/self_modify to implement your hypothesis, then use "decide" to keep or discard.`,
        },
      };
    } catch (err) {
      return { success: false, error: `Failed to start waypoint: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  private async handleDecide(
    decision?: 'keep' | 'discard',
    metricValues?: Record<string, number>,
  ): Promise<ToolResult> {
    if (!this.cerebellum.hasActiveMission()) {
      return { success: false, error: 'No active mission.' };
    }

    const effectiveDecision = decision ?? 'keep';

    try {
      const experiment = this.cerebellum.getActiveExperiment();
      if (!experiment) {
        return { success: false, error: 'No active experiment. Use "waypoint" to start one.' };
      }

      // Get verification result (基础验证)
      const verification = await this.cerebellum.verify(experiment);

      // STV增强验证（论②）：对比改造前后的状态快照
      // 验证 > 生成 的不对称性：先看build是否通过，再对比关键指标
      const stvEnhanced = this.enhanceWithSTVVerification(verification, experiment);

      // Update with external metric values if provided
      const finalVerification = metricValues
        ? this.cerebellum.updateVerification(experiment, stvEnhanced, metricValues)
        : stvEnhanced;

      // Record outcome
      this.cerebellum.recordOutcome(experiment, effectiveDecision, finalVerification);

      // MOSS Health-Probe检查（论⑤）
      const healthProbe = this.cerebellum.runHealthProbe();

      // Check termination
      const history = this.cerebellum.getHistory();
      const mission = this.cerebellum.getActiveMission();
      const termination = this.cerebellum.checkTermination(history, mission ?? undefined);

      return {
        success: true,
        data: {
          decision: effectiveDecision,
          waypoint: experiment.waypoint,
          hypothesis: experiment.hypothesis,
          overallResult: finalVerification.overall,
          terminated: termination.terminated,
          terminationReason: termination.reason,
          totalWaypoints: history.totalWaypoints,
          healthProbe: healthProbe.healthy
            ? { healthy: true, score: healthProbe.healthScore }
            : {
                healthy: false,
                score: healthProbe.healthScore,
                warnings: healthProbe.warnings,
                rollbackRecommended: healthProbe.rollbackRecommended,
              },
          consecutiveDiscards: history.consecutiveDiscards,
        },
      };
    } catch (err) {
      return { success: false, error: `Decision failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  private handleAbandon(): ToolResult {
    const mission = this.cerebellum.getActiveMission();
    if (!mission) {
      return { success: false, error: 'No active mission to abandon.' };
    }

    this.cerebellum.activateMission(null as never);
    return {
      success: true,
      data: {
        abandonedGoal: mission.goal,
        message: 'Mission abandoned. You can create a new one anytime.',
      },
    };
  }

  /**
   * STV增强验证 — Self-Trained Verification
   *
   * 灵感: "STV: Self-Trained Verification" (arXiv:2605.30290)
   * 核心洞察：模型看到参考解后能诊断自身错误，验证比生成容易。
   *
   * 在auto_mission中：
   * - 如果基础verification通过（build OK），加入STV信心分
   * - 如果基础verification失败，明确标记为"需要参考解辅助诊断"
   * - 利用验证 > 生成的不对称性：不重新生成，而是检查已有的验证信号
   */
  private enhanceWithSTVVerification(
    baseVerification: Awaited<ReturnType<Cerebellum['verify']>>,
    experiment: Awaited<ReturnType<Cerebellum['getActiveExperiment']>>,
  ): typeof baseVerification {
    if (!experiment) return baseVerification;

    const stvConfidence = this.computeSTVConfidence(baseVerification, experiment);

    return {
      ...baseVerification,
      overall: baseVerification.overall === 'pass'
        ? (stvConfidence > 0.8 ? 'pass' : baseVerification.overall)
        : baseVerification.overall,
      // 附加STV分析
      ...(typeof baseVerification === 'object' ? {
        stvConfidence,
        stvNote: stvConfidence > 0.8
          ? 'High verification confidence — change is likely beneficial'
          : stvConfidence > 0.5
            ? 'Moderate confidence — consider additional testing'
            : 'Low confidence — verify manually or get reference solution',
      } : {}),
    };
  }

  /**
   * 计算STV信心分
   *
   * 综合多个验证维度：
   * 1. 基础build验证结果
   * 2. hypothesis清晰度（越具体越可信）
   * 3. 历史连续成功/失败模式
   */
  private computeSTVConfidence(
    verification: Awaited<ReturnType<Cerebellum['verify']>>,
    experiment: { hypothesis: string },
  ): number {
    let confidence = 0.5;

    // 1. 基础验证通过
    if (typeof verification === 'object' && verification?.overall === 'pass') {
      confidence += 0.25;
    }

    // 2. Hypothesis清晰度（长度适中、有具体动作）
    const h = experiment.hypothesis ?? '';
    if (h.length > 20 && h.length < 500) confidence += 0.1;
    if (/\b(add|fix|refactor|remove|update|optimize)\b/i.test(h)) confidence += 0.1;

    // 3. 历史模式
    const history = this.cerebellum.getHistory();
    if (history.wins.length > history.deadEnds.length) {
      confidence += 0.05;
    }

    return Math.min(1, confidence);
  }
}
