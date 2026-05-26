/**
 * ExperimentTracker - 实验追踪器
 *
 * 内存中的结构化实验日志，替代外部 JSONL 文件。
 * 支持按任务查询、最佳指标追踪和连续失败检测。
 */

import type {
  AttemptHistory,
  AttemptRecord,
  Experiment,
  ExperimentDecision,
  Mission,
  Surprise,
  VerificationResult,
} from './types.js';

/**
 * 实验追踪器 — 记录和查询实验历史
 */
export class ExperimentTracker {
  private readonly records: Map<string, AttemptRecord[]> = new Map();
  private readonly surprises: Map<string, Surprise[]> = new Map();
  private readonly missions: Map<string, Mission> = new Map();
  private readonly bestMetrics: Map<string, Record<string, number>> = new Map();
  private readonly baselines: Map<string, Record<string, number>> = new Map();

  /**
   * 注册任务
   */
  registerMission(mission: Mission): void {
    this.missions.set(mission.id, mission);
    if (!this.records.has(mission.id)) {
      this.records.set(mission.id, []);
    }
    if (!this.surprises.has(mission.id)) {
      this.surprises.set(mission.id, []);
    }
  }

  /**
   * 设置基线指标
   */
  setBaseline(missionId: string, metrics: Record<string, number>): void {
    this.baselines.set(missionId, { ...metrics });
    if (!this.bestMetrics.has(missionId)) {
      this.bestMetrics.set(missionId, { ...metrics });
    }
  }

  /**
   * 记录实验结果
   */
  record(
    experiment: Experiment,
    decision: ExperimentDecision,
    verification: VerificationResult,
  ): void {
    const missionId = experiment.missionId;
    const records = this.records.get(missionId) ?? [];

    const record: AttemptRecord = {
      waypoint: experiment.waypoint,
      hypothesis: experiment.hypothesis,
      orientation: experiment.orientation,
      decision,
      metricValues: verification.metric.values
        ? Object.fromEntries(
            Object.entries(verification.metric.values).map(([k, v]) => [
              k,
              v.value,
            ]),
          )
        : {},
      description: experiment.hypothesis,
      timestamp: experiment.timestamp,
    };

    records.push(record);
    this.records.set(missionId, records);

    // 更新最佳指标
    if (decision === 'keep') {
      this.updateBestMetrics(missionId, record.metricValues);
    }
  }

  /**
   * 记录意外发现
   */
  recordSurprise(surprise: Surprise): void {
    const list = this.surprises.get(surprise.missionId) ?? [];
    list.push(surprise);
    this.surprises.set(surprise.missionId, list);
  }

  /**
   * 获取完整尝试历史
   */
  getHistory(missionId: string): AttemptHistory {
    const records = this.records.get(missionId) ?? [];
    const surpriseList = this.surprises.get(missionId) ?? [];

    return {
      missionId,
      wins: records.filter(r => r.decision === 'keep'),
      deadEnds: records.filter(r => r.decision === 'discard'),
      surprises: surpriseList,
      totalWaypoints: records.length,
      consecutiveDiscards: this.countConsecutiveDiscards(records),
      currentBest: this.bestMetrics.get(missionId) ?? {},
      baseline: this.baselines.get(missionId) ?? {},
    };
  }

  /**
   * 获取最近的 N 条记录
   */
  getRecentRecords(missionId: string, count: number): AttemptRecord[] {
    const records = this.records.get(missionId) ?? [];
    return records.slice(-count);
  }

  /**
   * 计算方法相似度 — 用于创意模式的发散度追踪
   *
   * 基于最近 N 次实验的假设文本相似度
   */
  calculateDivergence(missionId: string, hypothesis: string): number {
    const recent = this.getRecentRecords(missionId, 3);
    if (recent.length === 0) return 1.0;

    const similarities = recent.map(r =>
      this.textSimilarity(r.hypothesis, hypothesis),
    );
    const avgSimilarity =
      similarities.reduce((a, b) => a + b, 0) / similarities.length;

    return 1 - avgSimilarity;
  }

  /**
   * 清除任务历史
   */
  clearMission(missionId: string): void {
    this.records.delete(missionId);
    this.surprises.delete(missionId);
    this.missions.delete(missionId);
    this.bestMetrics.delete(missionId);
    this.baselines.delete(missionId);
  }

  // ── Private helpers ──

  private updateBestMetrics(
    missionId: string,
    values: Record<string, number>,
  ): void {
    const current = this.bestMetrics.get(missionId) ?? {};
    const mission = this.missions.get(missionId);

    if (!mission) return;

    const metricDirections = new Map(
      mission.metrics.map(m => [m.name, m.direction]),
    );

    for (const [name, value] of Object.entries(values)) {
      const direction = metricDirections.get(name) ?? 'lower';
      const currentBest = current[name];

      if (
        currentBest === undefined ||
        (direction === 'lower' && value < currentBest) ||
        (direction === 'higher' && value > currentBest)
      ) {
        current[name] = value;
      }
    }

    this.bestMetrics.set(missionId, { ...current });
  }

  private countConsecutiveDiscards(records: AttemptRecord[]): number {
    let count = 0;
    for (let i = records.length - 1; i >= 0; i--) {
      if (records[i].decision === 'discard') {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  /**
   * 简单的文本相似度 — 基于 Jaccard 词集合
   */
  private textSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = [...wordsA].filter(w => wordsB.has(w));
    const union = new Set([...wordsA, ...wordsB]);
    return union.size === 0 ? 0 : intersection.length / union.size;
  }
}
