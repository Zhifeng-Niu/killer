/**
 * Emotional State Engine - 情感状态引擎
 *
 * 基于 Russell 环形情绪模型的三维情感向量系统。
 * 管理情感状态的变化、衰减、共振和持久化。
 */

import type {
  EmotionalVector,
  EmotionalState,
  EmotionalEvent,
  EmotionalProfile,
  PrimaryEmotion,
} from './types.js';

/**
 * 情感关键词映射（简化版情感检测）
 * 每个情绪关联一组关键词及其对应的情感向量偏移
 */
const EMOTION_KEYWORDS: Record<PrimaryEmotion, {
  keywords: string[];
  vector: EmotionalVector;
}> = {
  joy: {
    keywords: ['happy', 'great', 'awesome', 'love', 'wonderful', 'amazing', 'thanks', 'thank you', 'excellent', 'perfect', 'glad'],
    vector: { valence: 0.8, arousal: 0.4, dominance: 0.3 },
  },
  sadness: {
    keywords: ['sad', 'sorry', 'miss', 'unfortunately', 'disappointed', 'lost', 'hurt', 'bad', 'terrible', 'awful'],
    vector: { valence: -0.7, arousal: -0.3, dominance: -0.4 },
  },
  anger: {
    keywords: ['angry', 'frustrated', 'annoyed', 'furious', 'hate', 'stupid', 'wrong', 'broken', 'wtf', 'damn'],
    vector: { valence: -0.6, arousal: 0.7, dominance: 0.5 },
  },
  fear: {
    keywords: ['worried', 'scared', 'afraid', 'concerned', 'nervous', 'anxious', 'risk', 'danger', 'uncertain'],
    vector: { valence: -0.5, arousal: 0.3, dominance: -0.6 },
  },
  surprise: {
    keywords: ['wow', 'unexpected', 'surprising', 'omg', 'really', 'seriously', 'incredible', 'unbelievable'],
    vector: { valence: 0.3, arousal: 0.6, dominance: 0.0 },
  },
  disgust: {
    keywords: ['disgusting', 'gross', 'hate', 'terrible', 'awful', 'horrible'],
    vector: { valence: -0.7, arousal: 0.2, dominance: 0.2 },
  },
  trust: {
    keywords: ['trust', 'believe', 'reliable', 'depend', 'safe', 'comfortable', 'confident', 'sure'],
    vector: { valence: 0.5, arousal: -0.2, dominance: 0.4 },
  },
  anticipation: {
    keywords: ['excited', 'looking forward', 'hope', 'expect', 'plan', 'future', 'next', 'soon', 'tomorrow'],
    vector: { valence: 0.4, arousal: 0.5, dominance: 0.2 },
  },
};

/**
 * 默认情感基线
 */
const DEFAULT_EMOTIONAL_PROFILE: EmotionalProfile = {
  baseline: { valence: 0.1, arousal: 0.0, dominance: 0.1 },
  volatility: 0.3,
  recoveryRate: 0.05,
  emotionalRange: {
    joy: 0.6,
    trust: 0.7,
    anticipation: 0.5,
    surprise: 0.4,
    sadness: 0.3,
    anger: 0.2,
    fear: 0.2,
    disgust: 0.1,
  },
};

/**
 * 情绪描述映射
 */
const EMOTION_DESCRIPTIONS: Record<PrimaryEmotion, { low: string; medium: string; high: string }> = {
  joy: { low: 'slightly pleased', medium: 'warmly content', high: 'genuinely happy' },
  sadness: { low: 'slightly wistful', medium: 'melancholic', high: 'deeply sad' },
  anger: { low: 'mildly annoyed', medium: 'frustrated', high: 'angry' },
  fear: { low: 'slightly uneasy', medium: 'concerned', high: 'very worried' },
  surprise: { low: 'mildly curious', medium: 'surprised', high: 'astonished' },
  disgust: { low: 'slightly displeased', medium: 'repulsed', high: 'deeply disgusted' },
  trust: { low: 'cautiously open', medium: 'trusting', high: 'deeply connected' },
  anticipation: { low: 'curious', medium: 'looking forward', high: 'eagerly excited' },
};

/**
 * 限制数值范围
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `emo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * 情感状态引擎
 *
 * 管理三维情感向量的变化、衰减和共振。
 */
export class EmotionalStateEngine {
  private readonly profile: EmotionalProfile;
  private state: EmotionalState;
  private readonly maxEmotionalMemory = 50;

  constructor(profile?: Partial<EmotionalProfile>) {
    this.profile = { ...DEFAULT_EMOTIONAL_PROFILE, ...profile };
    this.state = this.createInitialState();
  }

  /**
   * 获取当前情感状态（只读）
   */
  getState(): Readonly<EmotionalState> {
    return this.state;
  }

  /**
   * 处理情感触发
   *
   * 分析输入文本，检测情感，更新状态
   */
  processTrigger(trigger: string, context: string, mirrorSyncLevel: number = 0): EmotionalState {
    const detected = this.detectEmotion(trigger);

    if (detected) {
      const { emotion, vector, strength } = detected;

      // 计算情感偏移（受 volatilty 和 mirrorSyncLevel 调制）
      const modulation = this.profile.volatility * (1 + mirrorSyncLevel * 0.5);

      this.state.current = {
        valence: clamp(this.state.current.valence + vector.valence * modulation * strength, -1, 1),
        arousal: clamp(this.state.current.arousal + vector.arousal * modulation * strength, -1, 1),
        dominance: clamp(this.state.current.dominance + vector.dominance * modulation * strength, -1, 1),
      };

      this.state.primaryEmotion = emotion;
      this.state.intensity = clamp(strength * modulation, 0, 1);

      // 记录情感事件
      const event: EmotionalEvent = {
        id: generateId(),
        timestamp: Date.now(),
        trigger: trigger.slice(0, 200),
        emotion,
        intensity: this.state.intensity,
        context: context.slice(0, 200),
      };
      this.state.emotionalMemory.push(event);

      // 裁剪记忆
      if (this.state.emotionalMemory.length > this.maxEmotionalMemory) {
        this.state.emotionalMemory = this.state.emotionalMemory.slice(-this.maxEmotionalMemory);
      }

      // 更新心情基线（缓慢漂移）
      const moodDrift = 0.02;
      this.state.mood = {
        valence: clamp(this.state.mood.valence + vector.valence * moodDrift, -0.5, 0.5),
        arousal: clamp(this.state.mood.arousal + vector.arousal * moodDrift * 0.5, -0.3, 0.3),
        dominance: clamp(this.state.mood.dominance + vector.dominance * moodDrift * 0.5, -0.3, 0.3),
      };
    }

    this.state.lastUpdated = Date.now();
    return this.state;
  }

  /**
   * 情感衰减（向基线回归）
   *
   * 每次调用时将当前情感向量向 mood 基线移动一小步。
   * 应在 brainstem 循环中定期调用。
   */
  decay(): void {
    const rate = this.profile.recoveryRate;

    this.state.current = {
      valence: this.state.current.valence + (this.state.mood.valence - this.state.current.valence) * rate,
      arousal: this.state.current.arousal + (this.state.mood.arousal - this.state.current.arousal) * rate,
      dominance: this.state.current.dominance + (this.state.mood.dominance - this.state.current.dominance) * rate,
    };

    // 衰减情绪强度
    this.state.intensity = Math.max(0, this.state.intensity - rate * 0.5);
  }

  /**
   * 生成情感描述片段（用于系统提示）
   */
  getEmotionalPromptFragment(): string {
    const { primaryEmotion, intensity, mood } = this.state;
    const descriptions = EMOTION_DESCRIPTIONS[primaryEmotion];

    let level: 'low' | 'medium' | 'high';
    if (intensity < 0.3) level = 'low';
    else if (intensity < 0.7) level = 'medium';
    else level = 'high';

    const emotionDesc = descriptions[level];
    const moodValence = mood.valence > 0.1 ? 'positive' : mood.valence < -0.1 ? 'subdued' : 'neutral';

    return `Current emotional state: feeling ${emotionDesc} (intensity: ${(intensity * 100).toFixed(0)}%). Overall mood is ${moodValence}. Let this subtly influence your tone and responsiveness.`;
  }

  /**
   * 获取情感配置
   */
  getProfile(): Readonly<EmotionalProfile> {
    return this.profile;
  }

  /**
   * 重置到基线状态
   */
  reset(): void {
    this.state = this.createInitialState();
  }

  /**
   * 导出状态（用于持久化）
   */
  exportState(): EmotionalState {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * 导入状态（用于恢复）
   */
  importState(state: EmotionalState): void {
    this.state = state;
  }

  /**
   * 从文本中检测情绪
   */
  private detectEmotion(text: string): { emotion: PrimaryEmotion; vector: EmotionalVector; strength: number } | null {
    const lower = text.toLowerCase();
    let bestEmotion: PrimaryEmotion | null = null;
    let bestScore = 0;
    let bestVector: EmotionalVector = { valence: 0, arousal: 0, dominance: 0 };

    for (const [emotion, config] of Object.entries(EMOTION_KEYWORDS)) {
      let matchCount = 0;
      for (const keyword of config.keywords) {
        if (lower.includes(keyword)) {
          matchCount++;
        }
      }
      if (matchCount > bestScore) {
        bestScore = matchCount;
        bestEmotion = emotion as PrimaryEmotion;
        bestVector = config.vector;
      }
    }

    if (!bestEmotion || bestScore === 0) {
      return null;
    }

    // 情绪强度基于匹配数量和个体倾向
    const tendency = this.profile.emotionalRange[bestEmotion] ?? 0.5;
    const strength = clamp(bestScore * 0.4 + tendency * 0.3, 0.15, 1.0);

    return { emotion: bestEmotion, vector: bestVector, strength };
  }

  /**
   * 创建初始状态
   */
  private createInitialState(): EmotionalState {
    return {
      current: { ...this.profile.baseline },
      primaryEmotion: 'trust',
      intensity: 0.0,
      mood: { ...this.profile.baseline },
      emotionalMemory: [],
      lastUpdated: Date.now(),
    };
  }
}
