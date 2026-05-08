/**
 * Predictive User Model - 预测性用户模型
 *
 * 从交互历史和观察模式中挖掘洞察，
 * 预测用户下一步可能的需求。
 */

import type {
  UserModel,
  MirrorNeuronData,
  PredictedNeed,
  CommunicationPattern,
  PsychologicalProfile,
  PredictionResult,
  InteractionSummary,
  UserBehaviorPattern,
} from './types.js';

/**
 * 默认心理画像
 */
const DEFAULT_PSYCHOLOGICAL_PROFILE: PsychologicalProfile = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  decisionStyle: 'balanced',
  informationPreference: 'summary',
  riskTolerance: 0.5,
};

/**
 * 预测性用户模型
 *
 * 分析交互历史和行为模式，生成需求预测和心理画像。
 */
export class PredictiveUserModel {
  private predictions: PredictionResult;
  private predictionAccuracy: Map<string, { correct: number; total: number }> = new Map();

  constructor() {
    this.predictions = {
      predictedNeeds: [],
      communicationPatterns: [],
      psychologicalProfile: { ...DEFAULT_PSYCHOLOGICAL_PROFILE },
      lastUpdated: Date.now(),
    };
  }

  /**
   * 获取当前预测结果
   */
  getPredictions(): Readonly<PredictionResult> {
    return this.predictions;
  }

  /**
   * 更新预测（从用户模型和镜像数据中提取洞察）
   */
  updatePredictions(userModel: UserModel, mirrorData: MirrorNeuronData): PredictionResult {
    // 1. 更新心理画像
    this.predictions.psychologicalProfile = this.inferPsychologicalProfile(
      userModel,
      mirrorData.observedPatterns,
    );

    // 2. 检测交流模式
    this.predictions.communicationPatterns = this.detectCommunicationPatterns(
      userModel.interactionSummary,
      mirrorData.observedPatterns,
    );

    // 3. 生成需求预测
    this.predictions.predictedNeeds = this.predictNeeds(
      userModel,
      mirrorData.observedPatterns,
    );

    this.predictions.lastUpdated = Date.now();
    return this.predictions;
  }

  /**
   * 验证预测是否命中
   */
  validatePrediction(needDescription: string, wasRelevant: boolean): void {
    const existing = this.predictionAccuracy.get(needDescription);
    if (existing) {
      existing.total++;
      if (wasRelevant) existing.correct++;
    } else {
      this.predictionAccuracy.set(needDescription, {
        total: 1,
        correct: wasRelevant ? 1 : 0,
      });
    }

    // 裁剪历史
    if (this.predictionAccuracy.size > 50) {
      const entries = Array.from(this.predictionAccuracy.entries());
      entries.sort((a, b) => b[1].total - a[1].total);
      this.predictionAccuracy = new Map(entries.slice(0, 30));
    }
  }

  /**
   * 获取预测准确率
   */
  getPredictionAccuracy(): { overall: number; count: number } {
    let totalCorrect = 0;
    let totalAll = 0;
    for (const stats of this.predictionAccuracy.values()) {
      totalCorrect += stats.correct;
      totalAll += stats.total;
    }
    return {
      overall: totalAll > 0 ? totalCorrect / totalAll : 0,
      count: totalAll,
    };
  }

  /**
   * 获取预测提示片段（用于系统提示）
   */
  getPredictionPromptFragment(): string {
    const { predictedNeeds, psychologicalProfile } = this.predictions;

    if (predictedNeeds.length === 0) {
      return '';
    }

    const parts: string[] = ['Anticipated user needs:'];
    for (const need of predictedNeeds.slice(0, 3)) {
      const confidenceLabel = need.confidence > 0.7 ? 'a strong sense' : need.confidence > 0.4 ? 'an inkling' : 'a hint';
      parts.push(`  - I have ${confidenceLabel} they might ${need.description}`);
    }

    parts.push(`Communication insight: They tend toward ${psychologicalProfile.decisionStyle} decisions, prefer ${psychologicalProfile.informationPreference} information.`);

    return parts.join('\n');
  }

  /**
   * 导出状态
   */
  exportState(): PredictionResult {
    return JSON.parse(JSON.stringify(this.predictions));
  }

  /**
   * 导入状态
   */
  importState(state: PredictionResult): void {
    this.predictions = state;
  }

  /**
   * 推断心理画像
   */
  private inferPsychologicalProfile(
    userModel: UserModel,
    patterns: UserBehaviorPattern[],
  ): PsychologicalProfile {
    const base = { ...DEFAULT_PSYCHOLOGICAL_PROFILE };

    // 从话题推断开放性
    const diverseTopics = userModel.interactionSummary.commonTopics.length;
    base.openness = Math.min(1, diverseTopics / 8);

    // 从满意度趋势推断尽责性
    base.conscientiousness = Math.min(1, userModel.interactionSummary.satisfactionScore * 1.2);

    // 从交流频率推断外向性
    const interactionCount = userModel.interactionSummary.totalInteractions;
    base.extraversion = Math.min(1, interactionCount / 50);

    // 从行为模式推断决策风格
    const analyticalPatterns = patterns.filter(p =>
      p.pattern.includes('detail') ||
      p.pattern.includes('analysis') ||
      p.pattern.includes('research'),
    );
    const intuitivePatterns = patterns.filter(p =>
      p.pattern.includes('quick') ||
      p.pattern.includes('intuition') ||
      p.pattern.includes('fast'),
    );

    if (analyticalPatterns.length > intuitivePatterns.length + 2) {
      base.decisionStyle = 'analytical';
    } else if (intuitivePatterns.length > analyticalPatterns.length + 2) {
      base.decisionStyle = 'intuitive';
    }

    // 从偏好推断信息处理偏好
    if (userModel.preferenceProfile.verbosity === 'detailed') {
      base.informationPreference = 'detailed';
    } else if (userModel.preferenceProfile.verbosity === 'concise') {
      base.informationPreference = 'summary';
    }

    // 从信任度推断风险偏好
    base.riskTolerance = userModel.trustLevel * 0.7 + 0.15;

    return base;
  }

  /**
   * 检测交流模式
   */
  private detectCommunicationPatterns(
    summary: InteractionSummary,
    patterns: UserBehaviorPattern[],
  ): CommunicationPattern[] {
    const commPatterns: CommunicationPattern[] = [];

    // 基于观察模式提取交流模式
    const stylePatterns = patterns.filter(p =>
      p.pattern.includes('short') ||
      p.pattern.includes('long') ||
      p.pattern.includes('formal') ||
      p.pattern.includes('casual') ||
      p.pattern.includes('technical'),
    );

    if (stylePatterns.length > 0) {
      const dominant = stylePatterns.sort((a, b) => b.frequency - a.frequency)[0]!;
      commPatterns.push({
        name: `Communication style: ${dominant.pattern}`,
        frequency: dominant.frequency,
        typicalTimes: [],
        avgLength: dominant.pattern.includes('short') ? 'short' : dominant.pattern.includes('long') ? 'long' : 'medium',
        emotionalTone: 'neutral',
      });
    }

    return commPatterns;
  }

  /**
   * 预测用户需求
   */
  private predictNeeds(
    userModel: UserModel,
    patterns: UserBehaviorPattern[],
  ): PredictedNeed[] {
    const needs: PredictedNeed[] = [];
    const topics = userModel.interactionSummary.commonTopics;
    const satisfaction = userModel.interactionSummary.satisfactionScore;

    // 低满意度 → 预测需要调整
    if (satisfaction < 0.4 && userModel.interactionSummary.totalInteractions > 3) {
      needs.push({
        description: 'User may need approach adjustment or clarification',
        confidence: 0.7,
        triggerConditions: ['satisfaction below threshold'],
        suggestedResponse: 'Ask for feedback and adjust communication style',
        timeHorizon: 'immediate',
      });
    }

    // 热门话题 → 预测深度需求
    for (const topic of topics.slice(0, 3)) {
      needs.push({
        description: `Follow-up or deeper exploration of ${topic}`,
        confidence: 0.5,
        triggerConditions: [`topic: ${topic}`],
        suggestedResponse: `Proactively share relevant ${topic} insights`,
        timeHorizon: 'short',
      });
    }

    // 高频模式 → 预测习惯性需求
    const frequentPatterns = patterns
      .filter(p => p.frequency >= 3)
      .sort((a, b) => b.frequency - a.frequency);

    for (const pattern of frequentPatterns.slice(0, 2)) {
      needs.push({
        description: `Anticipated: ${pattern.pattern}`,
        confidence: Math.min(0.9, 0.3 + pattern.frequency * 0.1),
        triggerConditions: pattern.context,
        suggestedResponse: `Prepare for ${pattern.pattern} interaction`,
        timeHorizon: 'immediate',
      });
    }

    return needs;
  }
}
