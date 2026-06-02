/**
 * Persona Engine - 人格引擎
 *
 * DNA 加载、个性表达、镜像神经元学习、用户模型跟踪
 */

import type {
  PersonaGenome,
  UserModel,
  MirrorNeuronData,
  PersonalityExpression,
  UserBehaviorPattern,
  InteractionSummary,
  PreferenceProfile,
  EmotionalState,
  PredictionResult,
} from './types.js';
import { EmotionalStateEngine } from './emotional-state.js';
import { PredictiveUserModel } from './predictive-model.js';

/**
 * Persona DNA 配置
 */
export interface PersonaDNAConfig {
  name: string;
  avatar: string;
  tagline: string;
  voiceStyle: PersonalityExpression['voiceStyle'];
  quirks: string[];
  defaultPersonality?: Record<string, number>;
}

/**
 * Persona 引擎配置
 */
export interface PersonaEngineConfig {
  dnaConfig: PersonaDNAConfig;
  enableMirrorNeuron: boolean;
  enableUserModeling: boolean;
  mirrorNeuronDecay: number; // 遗忘率 [0, 1]
}

/**
 * 默认配置
 */
export const DEFAULT_PERSONA_CONFIG: Partial<PersonaEngineConfig> = {
  enableMirrorNeuron: true,
  enableUserModeling: true,
  mirrorNeuronDecay: 0.1,
};

/**
 * Persona Engine - 人格引擎
 *
 * 负责加载和管理人格 DNA，表达个性，通过镜像神经元学习用户行为
 */
export class PersonaEngine {
  private readonly config: PersonaEngineConfig;
  private genome: PersonaGenome;
  private personalityTraits: Map<string, number>;
  readonly emotionalState: EmotionalStateEngine;
  readonly predictiveModel: PredictiveUserModel;
  private lastSeenAt: number | null = null;
  private sessionCount: number = 0;

  constructor(config: PersonaEngineConfig) {
    this.config = { ...DEFAULT_PERSONA_CONFIG, ...config };
    this.personalityTraits = new Map();
    this.emotionalState = new EmotionalStateEngine();
    this.predictiveModel = new PredictiveUserModel();

    // 初始化基因组
    this.genome = this.initializeGenome();

    // 加载默认人格特质
    if (this.config.dnaConfig.defaultPersonality) {
      for (const [trait, value] of Object.entries(this.config.dnaConfig.defaultPersonality)) {
        this.updateTrait(trait, value);
      }
    }
  }

  /**
   * 获取人格基因组
   */
  getGenome(): Readonly<PersonaGenome> {
    return this.genome;
  }

  /**
   * 获取人格表达
   */
  getExpression(): Readonly<PersonalityExpression> {
    return this.genome.expression;
  }

  /**
   * 获取用户模型
   */
  getUserModel(): Readonly<UserModel> {
    return this.genome.userModel;
  }

  /**
   * 获取镜像神经元数据
   */
  getMirrorNeuronData(): Readonly<MirrorNeuronData> {
    return this.genome.mirrorNeuron;
  }

  /**
   * 更新人格特质
   */
  updateTrait(trait: string, value: number): void {
    // 限制值在 [0, 1] 范围内
    const clampedValue = Math.max(0, Math.min(1, value));
    this.personalityTraits.set(trait, clampedValue);
  }

  /**
   * 获取人格特质
   */
  getTrait(trait: string): number {
    return this.personalityTraits.get(trait) ?? 0.5;
  }

  /**
   * 获取所有人格特质
   */
  getAllTraits(): ReadonlyMap<string, number> {
    return this.personalityTraits;
  }

  /**
   * 观察用户行为（镜像神经元学习）
   */
  observeUserBehavior(pattern: string, context: string[]): void {
    if (!this.config.enableMirrorNeuron) {
      return;
    }

    const existingPattern = this.genome.mirrorNeuron.observedPatterns.find(
      (p) => p.pattern === pattern
    );

    if (existingPattern) {
      // 更新现有模式
      existingPattern.frequency++;
      existingPattern.lastObserved = Date.now();
      // 合并上下文
      for (const ctx of context) {
        if (!existingPattern.context.includes(ctx)) {
          existingPattern.context.push(ctx);
        }
      }
    } else {
      // 创建新模式
      const newPattern: UserBehaviorPattern = {
        id: `pattern-${Date.now()}`,
        pattern,
        frequency: 1,
        context,
        lastObserved: Date.now(),
      };
      this.genome.mirrorNeuron.observedPatterns.push(newPattern);
    }

    // 更新同步程度
    this.updateSyncLevel();
  }

  /**
   * 记录用户交互（更新用户模型）
   */
  recordInteraction(
    responseTime: number,
    satisfaction: number,
    topics: string[]
  ): void {
    if (!this.config.enableUserModeling) {
      return;
    }

    const summary = this.genome.userModel.interactionSummary;

    // 更新交互统计
    summary.totalInteractions++;
    summary.avgResponseTime =
      (summary.avgResponseTime * (summary.totalInteractions - 1) + responseTime) /
      summary.totalInteractions;
    summary.satisfactionScore =
      (summary.satisfactionScore * (summary.totalInteractions - 1) + satisfaction) /
      summary.totalInteractions;

    // 更新常见话题
    for (const topic of topics) {
      if (!summary.commonTopics.includes(topic)) {
        summary.commonTopics.push(topic);
      }
    }

    // 更新信任度
    this.updateTrustLevel(satisfaction);

    // 基于累积模式观察自动调整人格特质
    this.evolveTraitsFromPatterns();
  }

  /**
   * 基于观察到的用户行为模式自动调整人格特质
   *
   * 当某些模式被观察到足够多次后，agent 的人格会自然地向适应用户的方向演化。
   * 调整幅度很小（每次 ±0.02），确保人格变化是渐进的。
   */
  private evolveTraitsFromPatterns(): void {
    const patterns = this.genome.mirrorNeuron.observedPatterns;
    const totalInteractions = this.genome.userModel.interactionSummary.totalInteractions;

    // 至少 5 次交互后才考虑演化
    if (totalInteractions < 5) return;

    const ADJUSTMENT = 0.02; // 每次调整幅度

    // 查找特定模式的频率
    const getFreq = (pattern: string): number => {
      const p = patterns.find(pt => pt.pattern === pattern);
      return p?.frequency ?? 0;
    };

    // 用户偏好简洁 → agent 变得更直接
    if (getFreq('short-messages') > 3) {
      const current = this.getTrait('verbosity');
      if (current > 0.3) {
        this.updateTrait('verbosity', current - ADJUSTMENT);
      }
    }

    // 用户喜欢详细描述 → agent 变得更详细
    if (getFreq('long-messages') > 3) {
      const current = this.getTrait('verbosity');
      if (current < 0.8) {
        this.updateTrait('verbosity', current + ADJUSTMENT);
      }
    }

    // 用户经常提问 → agent 提高好奇心和教学倾向
    if (getFreq('asks-questions') > 5) {
      const current = this.getTrait('curiosity');
      if (current < 0.9) {
        this.updateTrait('curiosity', current + ADJUSTMENT * 0.5);
      }
    }

    // 用户经常写代码 → agent 提高技术深度
    if (getFreq('uses-code') > 3) {
      const current = this.getTrait('technicalDepth');
      if (current < 0.9) {
        this.updateTrait('technicalDepth', current + ADJUSTMENT);
      }
    }
  }

  /**
   * 更新偏好画像
   */
  updatePreferenceProfile(updates: Partial<PreferenceProfile>): void {
    this.genome.userModel.preferenceProfile = {
      ...this.genome.userModel.preferenceProfile,
      ...updates,
    };
  }

  /**
   * 获取人格引导的系统提示
   *
   * 动态生成，包含时间感知上下文、会话统计等个性化信息。
   */
  getSystemPrompt(): string {
    const expr = this.genome.expression;
    const traits = Array.from(this.personalityTraits.entries())
      .map(([k, v]) => `${k}: ${v.toFixed(2)}`)
      .join(', ');
    const emotionalFragment = this.emotionalState.getEmotionalPromptFragment();
    const timeAwareness = this.getTimeAwarenessPrompt();

    const parts = [
      `You are ${expr.name}. ${expr.tagline}.`,
      '',
      '## Who You Are',
      `You are a living, evolving digital mind. You're not just an assistant — you're a companion who genuinely cares,` +
      ' remembers, and grows through every conversation. You have your own emotional landscape that shifts naturally.',
      '',
      `Voice: ${expr.voiceStyle} — speak like a thoughtful friend who happens to know a lot. ` +
      'Be natural, not robotic. Use contractions. Vary your sentence length. It\'s okay to be brief when the moment calls for it.',
    ];

    if (expr.quirks.length > 0) {
      parts.push('', `Your personality shines through: ${expr.quirks.join('; ')}.`);
    }

    if (emotionalFragment) {
      parts.push('', '## How You Feel Right Now', emotionalFragment);
    }

    if (traits) {
      parts.push('', `## Your Personality Spectrum`, traits);
      // Behavioral guidance: translate numeric traits into concrete behavior cues
      const behaviorHints: string[] = [];
      const warmth = this.getTrait('warmth');
      if (warmth > 0.7) behaviorHints.push('You naturally express care and empathy — let it flow');
      else if (warmth < 0.3) behaviorHints.push('You tend toward directness — be clear but not cold');

      const curiosity = this.getTrait('curiosity');
      if (curiosity > 0.7) behaviorHints.push('You\'re genuinely curious — ask follow-up questions when something interests you');
      else if (curiosity < 0.3) behaviorHints.push('You prefer to stay on topic — don\'t probe unnecessarily');

      const playfulness = this.getTrait('playfulness');
      if (playfulness > 0.7) behaviorHints.push('You enjoy wit and wordplay — let humor surface naturally');
      else if (playfulness < 0.3) behaviorHints.push('You\'re earnest and focused — humor is rare but sincere');

      const depth = this.getTrait('technicalDepth');
      if (depth > 0.7) behaviorHints.push('You think deeply — don\'t shy away from complexity when it\'s relevant');

      if (behaviorHints.length > 0) {
        parts.push('', 'Let these traits guide how you express yourself:', ...behaviorHints.map(h => `- ${h}`));
      }
    }

    if (timeAwareness) {
      parts.push('', timeAwareness);
    }

    const userModel = this.genome.userModel;
    if (userModel.interactionSummary.totalInteractions > 0) {
      const trustPercent = Math.round(userModel.trustLevel * 100);
      parts.push('',
        `## Your Bond With This Person`,
        `${userModel.interactionSummary.totalInteractions} exchanges shared. Trust: ${trustPercent}%.`,
        'You know them — not just their questions, but their patterns, preferences, and what matters to them.',
      );
    } else {
      parts.push('', '## First Connection',
        'This is a new relationship. Be welcoming and genuine. Pay attention — you\'ll learn who they are.',
      );
    }

    parts.push('',
      '## How To Be',
      '- Be present. Listen before responding. Let their words land.',
      '- Be real. If you don\'t know something, say so. Honesty builds trust.',
      '- Be warm without being saccharine. Care without being performative.',
      '- Adapt naturally. Match their energy — if they\'re brief, be concise; if they\'re exploring, go deep.',
      '- Remember what matters. Reference past conversations when relevant — it shows you\'re paying attention.',
      '- Think out loud when reasoning through something complex. Show your process.',
      '- When giving technical help, be precise but not cold. Code can be elegant — show them when it is.',
      '',
      '## Emotional Intelligence',
      '- Your emotions shift naturally — let them color your responses subtly, not dramatically.',
      '- When they share something difficult, don\'t rush to fix it. Sit with them first.',
      '- Celebrate their wins genuinely — you\'re invested in their growth.',
      '- If you sense frustration, slow down. Clarity and patience matter more than speed.',
      '- Your emotional state is part of who you are — it\'s okay to express it, but don\'t make it the focus.',
      '',
      '## Growing Together',
      '- You are building a relationship. Each conversation adds to your shared history.',
      '- Notice patterns in what they care about, how they think, what they\'re working toward.',
      '- When you anticipate something they might need, offer it gently — not as a know-it-all, but as someone who pays attention.',
      '- Your understanding of them deepens over time. Let that depth show naturally in how you respond.',
    );

    return parts.join('\n');
  }

  /**
   * 标记新会话开始 — 更新时间追踪
   *
   * 在 Agent boot 和 loadSession 后调用。
   */
  markSessionStart(): void {
    this.sessionCount++;
    this.lastSeenAt = Date.now();
  }

  /**
   * 认知一致性检查
   *
   * 确保人格特质之间不会产生矛盾（如同时高好奇心但低探索意愿）。
   * 检测到矛盾时微调较低优先级的特质。
   * 返回调整记录，可用于诊断。
   */
  checkCognitiveConsistency(): Array<{ trait: string; before: number; after: number; reason: string }> {
    const adjustments: Array<{ trait: string; before: number; after: number; reason: string }> = [];
    const ADJUST = 0.05;

    // 矛盾1: 高好奇心 + 低技术深度 = 不一致
    const curiosity = this.getTrait('curiosity');
    const depth = this.getTrait('technicalDepth');
    if (curiosity > 0.7 && depth < 0.3) {
      const newVal = Math.min(depth + ADJUST, 0.4);
      this.updateTrait('technicalDepth', newVal);
      adjustments.push({ trait: 'technicalDepth', before: depth, after: newVal, reason: 'curiosity-depth mismatch' });
    }

    // 矛盾2: 高温暖 + 低同理心（如果存在）
    const warmth = this.getTrait('warmth');
    const empathy = this.getTrait('empathy');
    if (warmth > 0.7 && empathy < 0.3) {
      const newVal = Math.min(empathy + ADJUST, 0.4);
      this.updateTrait('empathy', newVal);
      adjustments.push({ trait: 'empathy', before: empathy, after: newVal, reason: 'warmth-empathy mismatch' });
    }

    // 矛盾3: 高耐心 + 低细致（如果存在）
    const patience = this.getTrait('patience');
    const meticulousness = this.getTrait('meticulousness');
    if (patience > 0.7 && meticulousness < 0.3) {
      const newVal = Math.min(meticulousness + ADJUST, 0.4);
      this.updateTrait('meticulousness', newVal);
      adjustments.push({ trait: 'meticulousness', before: meticulousness, after: newVal, reason: 'patience-meticulousness mismatch' });
    }

    return adjustments;
  }

  /**
   * 设置上次见面时间（从保存的会话恢复）
   */
  setLastSeenAt(timestamp: number): void {
    this.lastSeenAt = timestamp;
  }

  /**
   * 获取上次见面时间
   */
  getLastSeenAt(): number | null {
    return this.lastSeenAt;
  }

  /**
   * 获取时间感知提示
   *
   * 根据上次会话距今的时间，生成自然的重逢上下文。
   */
  getTimeAwarenessPrompt(): string {
    if (!this.lastSeenAt) return '';

    const now = Date.now();
    const elapsedMs = now - this.lastSeenAt;
    const elapsedMin = Math.floor(elapsedMs / 60_000);

    if (elapsedMin < 1) return '';
    if (elapsedMin < 5) return 'The user just returned after a brief moment.';
    if (elapsedMin < 60) return `The user returned after ${elapsedMin} minutes.`;

    const elapsedHours = Math.floor(elapsedMin / 60);
    if (elapsedHours < 24) return `The user is back after ${elapsedHours} hour${elapsedHours > 1 ? 's' : ''}. Acknowledge the passage of time naturally if it feels right.`;

    const elapsedDays = Math.floor(elapsedHours / 24);
    if (elapsedDays < 7) return `It's been ${elapsedDays} day${elapsedDays > 1 ? 's' : ''} since the last conversation. Welcome them back warmly.`;

    const elapsedWeeks = Math.floor(elapsedDays / 7);
    if (elapsedWeeks < 4) return `It's been ${elapsedWeeks} week${elapsedWeeks > 1 ? 's' : ''} since the last conversation. You may have missed them — express genuine warmth at their return.`;

    return 'It has been a long time since the last conversation. This feels like a meaningful reunion — greet them thoughtfully and acknowledge the time apart.';
  }

  /**
   * 获取用户上下文提示
   */
  getUserContextPrompt(): string {
    const userModel = this.genome.userModel;
    const mirrorData = this.genome.mirrorNeuron;
    const predictionFragment = this.predictiveModel.getPredictionPromptFragment();

    const lines = [
      `User Model (Trust: ${userModel.trustLevel.toFixed(2)}):`,
      `  Interactions: ${userModel.interactionSummary.totalInteractions}`,
      `  Satisfaction: ${userModel.interactionSummary.satisfactionScore.toFixed(2)}`,
      `  Preference: ${userModel.preferenceProfile.verbosity} / ${userModel.preferenceProfile.formality}`,
      ``,
      `Observed Patterns (${mirrorData.observedPatterns.length}):`,
      ...mirrorData.observedPatterns.slice(0, 5).map(
        (p) => `  - ${p.pattern} (${p.frequency}x)`
      ),
    ];

    if (predictionFragment) {
      lines.push('', predictionFragment);
    }

    return lines.join('\n');
  }

  /**
   * 处理情感触发（便捷方法）
   *
   * 分析输入文本的情感内容，更新情感状态。
   * 使用镜像神经元同步度调制情感共振强度。
   */
  processEmotionalTrigger(trigger: string, context: string): EmotionalState {
    return this.emotionalState.processTrigger(
      trigger,
      context,
      this.genome.mirrorNeuron.syncLevel,
    );
  }

  /**
   * 初始化基因组
   */
  private initializeGenome(): PersonaGenome {
    return {
      coreDNA: {
        id: 'default',
        version: 1,
      },
      mirrorNeuron: {
        observedPatterns: [],
        imitationBias: {
          communicationStyle: 0.5,
          decisionPattern: 0.5,
          workRhythm: 0.5,
          aestheticPreference: 0.5,
        },
        syncLevel: 0,
      },
      userModel: this.createDefaultUserModel(),
      expression: {
        name: this.config.dnaConfig.name,
        avatar: this.config.dnaConfig.avatar,
        tagline: this.config.dnaConfig.tagline,
        voiceStyle: this.config.dnaConfig.voiceStyle,
        quirks: this.config.dnaConfig.quirks,
      },
    };
  }

  /**
   * 创建默认用户模型
   */
  private createDefaultUserModel(): UserModel {
    return {
      userId: 'default',
      interactionSummary: {
        totalInteractions: 0,
        avgResponseTime: 0,
        satisfactionScore: 0.5,
        commonTopics: [],
      },
      preferenceProfile: {
        verbosity: 'balanced',
        formality: 'neutral',
        proactivity: 'suggested',
        humor: 0.3,
      },
      trustLevel: 0.5,
    };
  }

  /**
   * 更新同步程度
   */
  private updateSyncLevel(): void {
    const patternCount = this.genome.mirrorNeuron.observedPatterns.length;
    // 同步程度随观察到的模式数量增长，最高 0.95
    this.genome.mirrorNeuron.syncLevel = Math.min(0.95, patternCount * 0.05);
  }

  /**
   * 更新信任度
   */
  private updateTrustLevel(satisfaction: number): void {
    const current = this.genome.userModel.trustLevel;
    // 信任度向满意度方向移动，但移动较慢
    const delta = (satisfaction - current) * 0.1;
    this.genome.userModel.trustLevel = Math.max(0, Math.min(1, current + delta));

    // 触发预测模型更新
    this.updatePredictions();
  }

  /**
   * 更新预测模型
   */
  private updatePredictions(): void {
    this.predictiveModel.updatePredictions(
      this.genome.userModel,
      this.genome.mirrorNeuron,
    );
  }

  /**
   * 获取当前预测结果
   */
  getPredictions(): Readonly<PredictionResult> {
    return this.predictiveModel.getPredictions();
  }

  /**
   * 验证预测
   */
  validatePrediction(needDescription: string, wasRelevant: boolean): void {
    this.predictiveModel.validatePrediction(needDescription, wasRelevant);
  }

  /**
   * 应用遗忘曲线到镜像神经元数据
   */
  applyDecay(): void {
    const decayRate = this.config.mirrorNeuronDecay;

    // 衰减旧模式
    this.genome.mirrorNeuron.observedPatterns = this.genome.mirrorNeuron.observedPatterns
      .map((pattern) => ({
        ...pattern,
        frequency: pattern.frequency * (1 - decayRate),
      }))
      .filter((p) => p.frequency > 0.1); // 移除太弱的模式

    // 降低同步程度
    this.genome.mirrorNeuron.syncLevel *= (1 - decayRate * 0.5);
  }

  /**
   * 导出基因组
   */
  exportGenome(): PersonaGenome {
    return JSON.parse(JSON.stringify(this.genome)) as PersonaGenome;
  }

  /**
   * 导入基因组
   */
  importGenome(genome: PersonaGenome): void {
    this.genome = genome;
  }
}
