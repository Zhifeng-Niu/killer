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
    });

    this.cerebellum.activateMission(mission);
    this.onMissionCreated?.(goal, mission.id);

    return {
      success: true,
      data: {
        missionId: mission.id,
        goal: mission.goal,
        orientation: mission.orientation,
        message: `Mission created: "${goal}". Use "waypoint" to start experimenting.`,
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

      return {
        success: true,
        data: {
          experimentId: experiment.id,
          waypoint: experiment.waypoint,
          hypothesis: experiment.hypothesis,
          missionGoal: mission.goal,
          message: `Experiment waypoint ${experiment.waypoint} started. Now: use self_read/self_modify to implement your hypothesis, then use "decide" to keep or discard.`,
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

      // Get verification result
      const verification = await this.cerebellum.verify(experiment);

      // Update with external metric values if provided
      const finalVerification = metricValues
        ? this.cerebellum.updateVerification(experiment, verification, metricValues)
        : verification;

      // Record outcome
      this.cerebellum.recordOutcome(experiment, effectiveDecision, finalVerification);

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
}
