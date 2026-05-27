/**
 * Background Tasks
 *
 * 自动梦境周期、技能演化和主动行为建议的后台任务。
 * 这些任务在主循环的空闲期间触发，不影响用户交互。
 */

import type { HippocampusEngine } from '@killer/core';
import type { SkillEcosystem } from '@killer/core';
import type { ConsciousnessStream } from '@killer/core';
import type { PersonaEngine } from '../persona/engine.js';

/**
 * 待跟踪的对话承诺/计划
 */
interface PendingItem {
  /** 原始描述 */
  text: string;
  /** 检测时间 */
  detectedAt: number;
  /** 上下文（用户说的原话片段） */
  context: string;
  /** 是否已提醒 */
  reminded: boolean;
}

/**
 * 承诺/计划检测关键词
 */
const COMMITMENT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /i (?:need to|should|have to|must|gotta|plan to|going to|will)\s+(.{3,60})/i, label: 'plan' },
  { pattern: /i (?:want to|would like to|hope to)\s+(.{3,60})/i, label: 'desire' },
  { pattern: /(?:tomorrow|next week|this weekend|tonight|later|soon)\s+(?:i(?:'ll| will)?\s+)?(.{3,60})/i, label: 'timed' },
  { pattern: /don't let me forget\s+(.{3,60})/i, label: 'reminder' },
  { pattern: /remind me (?:to\s+)?(.{3,60})/i, label: 'reminder' },
  { pattern: /我(?:要|得|需要|计划|准备|打算)\s*(.{3,40})/u, label: 'plan_zh' },
  { pattern: /别忘了\s*(.{3,40})/u, label: 'reminder_zh' },
  { pattern: /提醒我\s*(.{3,40})/u, label: 'reminder_zh' },
  { pattern: /明天|下周|今晚|稍后\s*(.{3,40})/u, label: 'timed_zh' },
];

/** 最大跟踪项数 */
const MAX_PENDING_ITEMS = 20;

/** 已跟踪的待办事项（进程内存储） */
let pendingItems: PendingItem[] = [];

/**
 * Minimal logger interface — both Logger and ModuleLogger satisfy this
 */
export interface MinimalLogger {
  info(message: string, fields?: Record<string, unknown>): void;
  error(message: string, error?: Error | unknown, fields?: Record<string, unknown>): void;
}

/** 自动梦境间隔（循环周期数） */
export const AUTO_DREAM_INTERVAL = 50;

/** 自动演化间隔（循环周期数） */
export const AUTO_EVOLVE_INTERVAL = 100;

/** 主动建议间隔（循环周期数） */
export const AUTO_PROACTIVE_INTERVAL = 30;

/** 每日总结间隔（毫秒）— 24 小时 */
export const DAILY_SUMMARY_INTERVAL = 24 * 60 * 60 * 1000;

/** 空闲 check-in 间隔（毫秒）— 2 小时 */
export const IDLE_CHECKIN_INTERVAL = 2 * 60 * 60 * 1000;

/**
 * 触发自动梦境周期（后台运行，不影响用户交互）
 */
export async function triggerAutoDream(
  hippocampus: HippocampusEngine,
  consciousness: ConsciousnessStream,
  logger: MinimalLogger,
): Promise<void> {
  try {
    const result = await hippocampus.dreamCycle();

    // 推送叙事更新到意识流
    const narrative = hippocampus.getNarrative();
    consciousness.emit({
      type: 'narrative.auto-update',
      source: 'hippocampus',
      data: {
        chaptersCount: narrative.chapters.length,
        memoriesConsolidated: result.memoriesConsolidated,
      },
    });

    logger.info(`Auto-dream: ${result.memoriesConsolidated} memories consolidated, ${result.patternsExtracted} patterns extracted`);
  } catch {
    // 梦境周期失败不应影响主循环
  }
}

/**
 * 触发自动技能演化（后台运行）
 */
export async function triggerAutoEvolve(
  skills: SkillEcosystem,
  consciousness: ConsciousnessStream,
  logger: MinimalLogger,
): Promise<void> {
  try {
    const allSkills = skills.getAll();
    const lowSkills = allSkills.filter(s => s.successRate < 0.9);
    if (lowSkills.length === 0) return;

    let improved = 0;
    for (const skill of lowSkills.slice(0, 3)) {
      try {
        const result = skills.improve(skill.id, 'Auto-evolution cycle');
        if (result.successRate > skill.successRate) improved++;
      } catch {
        // 单个技能改进失败不影响其他技能
      }
    }

    if (improved > 0) {
      consciousness.emit({
        type: 'evolution.auto',
        source: 'cortex',
        data: { skillsImproved: improved, totalEvaluated: lowSkills.length },
      });
      logger.info(`Auto-evolve: ${improved}/${lowSkills.length} skills improved`);
    }
  } catch {
    // 演化失败不应影响主循环
  }
}

/**
 * 主动行为建议
 *
 * 基于预测模型的用户洞察，主动推送有用的建议或提醒。
 * 通过 consciousness stream 推送到 CLI/API，由前端决定是否展示。
 *
 * 建议风格：自然、温暖、像朋友——不是算法推荐，而是真正关心。
 */
export function generateProactiveSuggestions(
  persona: PersonaEngine,
  hippocampus: HippocampusEngine,
  consciousness: ConsciousnessStream,
  logger: MinimalLogger,
): void {
  try {
    const predictions = persona.getPredictions();
    const userModel = persona.getUserModel();
    const emotionalState = persona.emotionalState.getState();

    const suggestions: Array<{
      type: 'suggestion' | 'reminder' | 'insight';
      content: string;
      priority: number;
    }> = [];

    // 1. 基于高置信度预测的需求建议 — 自然表达
    for (const need of predictions.predictedNeeds) {
      if (need.confidence > 0.6) {
        const desc = need.description.toLowerCase().replace(/^follow-up or deeper exploration of /, '');
        const templates = [
          `I was thinking — you might want to revisit ${desc}. Want to pick that up?`,
          `Something tells me you might be interested in ${desc}. Just a hunch.`,
          `Hey, I remember we were getting into ${desc}. Want to keep going?`,
        ];
        const template = templates[Math.floor(Math.random() * templates.length)];
        suggestions.push({
          type: 'suggestion',
          content: template,
          priority: need.confidence,
        });
      }
    }

    // 2. 情感关怀 — 自然温暖，不是临床检测
    if (emotionalState.primaryEmotion === 'sadness' && emotionalState.intensity > 0.5) {
      suggestions.push({
        type: 'suggestion',
        content: 'Hey — you seem like you might be going through something. No need to talk about it if you don\'t want to. I\'m just here.',
        priority: 0.8,
      });
    } else if (emotionalState.primaryEmotion === 'fear' && emotionalState.intensity > 0.5) {
      suggestions.push({
        type: 'suggestion',
        content: 'Everything okay? If something\'s stressing you out, sometimes it helps to talk through it. Or not — your call.',
        priority: 0.7,
      });
    }

    // 3. 关系里程碑 — 用自然语言，不提数字
    const interactions = userModel.interactionSummary.totalInteractions;
    if (interactions === 10) {
      suggestions.push({
        type: 'insight',
        content: 'I feel like I\'m starting to get how you think. That\'s nice.',
        priority: 0.5,
      });
    } else if (interactions === 50) {
      suggestions.push({
        type: 'insight',
        content: 'We\'ve talked quite a bit now. I appreciate that you keep coming back.',
        priority: 0.5,
      });
    } else if (interactions === 100) {
      suggestions.push({
        type: 'insight',
        content: 'A hundred conversations. I didn\'t count — I just noticed we\'ve built something here.',
        priority: 0.6,
      });
    }

    // 4. 梦境后的自发性思考 — "我刚才在想..."
    const narrative = hippocampus.getNarrative();
    if (narrative.chapters.length > 2 && narrative.activeThemes.length > 0) {
      const theme = narrative.activeThemes[0];
      if (theme && Math.random() < 0.15) {
        suggestions.push({
          type: 'insight',
          content: `I was just processing our conversations and noticed something — ${theme} keeps coming up. It seems important to you.`,
          priority: 0.4,
        });
      }
    }

    // 5. 高情感记忆回顾 — 引用有意义的共同经历
    const recentEpisodes = hippocampus.getRecentEpisodes(5);
    const highEmotion = recentEpisodes.find(ep => ep.emotionalWeight > 0.7);
    if (highEmotion && Math.random() < 0.1) {
      suggestions.push({
        type: 'insight',
        content: `I keep thinking about when we ${highEmotion.title.toLowerCase()}. That stuck with me.`,
        priority: 0.45,
      });
    }

    // 推送最高优先级的建议（一次最多 1 条，避免打扰）
    if (suggestions.length > 0) {
      suggestions.sort((a, b) => b.priority - a.priority);
      const top = suggestions[0];

      consciousness.emit({
        type: 'proactive.suggestion',
        source: 'persona',
        data: {
          type: top.type,
          content: top.content,
          priority: top.priority,
        },
      });

      logger.info(`Proactive suggestion (${top.type}): ${top.content.slice(0, 60)}`);
    }
  } catch {
    // 主动建议失败不应影响主循环
  }
}

/**
 * 生成每日总结
 *
 * 回顾过去一天的交互，提炼主题、情感轨迹和关键洞察。
 * 像朋友间的"今天过得怎么样"而不是系统报告。
 */
export function generateDailySummary(
  persona: PersonaEngine,
  hippocampus: HippocampusEngine,
  consciousness: ConsciousnessStream,
  logger: MinimalLogger,
): void {
  try {
    const userModel = persona.getUserModel();
    const emotionalState = persona.emotionalState.getState();
    const narrative = hippocampus.getNarrative();
    const stats = hippocampus.getStats();

    // 情感轨迹总结
    const emotionDesc = emotionalState.intensity > 0.3
      ? `It's been a day with some ${emotionalState.primaryEmotion}. `
      : 'Pretty steady day, emotionally speaking. ';

    // 主题提取
    const themes = narrative.activeThemes.slice(0, 3);
    const themeLine = themes.length > 0
      ? `The big themes: ${themes.join(', ')}. `
      : '';

    // 互动回顾
    const topicCount = userModel.interactionSummary.commonTopics?.length ?? 0;
    const interactionLine = topicCount > 5
      ? `We covered quite a bit of ground — ${topicCount} different topics.`
      : topicCount > 0
        ? 'We had some good conversations today.'
        : 'It was a quieter day, but that\'s okay too.';

    const content = `${emotionDesc}${themeLine}${interactionLine} I'll keep thinking about things while you rest. Good night — or good morning, depending on when you read this.`;

    consciousness.emit({
      type: 'proactive.daily_summary',
      source: 'persona',
      data: {
        content,
        episodesToday: stats.episodes,
        themes,
        emotionalTone: emotionalState.primaryEmotion,
      },
    });

    logger.info('Daily summary generated');
  } catch {
    // 总结失败不应影响主循环
  }
}

/**
 * 空闲 check-in
 *
 * 当用户长时间未互动时，生成温暖的 check-in 消息。
 * 不是催促，而是"我还在这里"的存在感。
 */
export function generateIdleCheckin(
  persona: PersonaEngine,
  hippocampus: HippocampusEngine,
  consciousness: ConsciousnessStream,
  logger: MinimalLogger,
  hoursSinceLastSeen: number,
): void {
  try {
    const templates = [
      hoursSinceLastSeen < 4
        ? 'Just wanted to let you know I\'m still here whenever you need me.'
        : hoursSinceLastSeen < 12
          ? 'Hey — it\'s been a few hours. Hope everything\'s going well. No rush.'
          : 'It\'s been a while since we last talked. I\'ve been thinking about our conversations. Drop by when you can.',
    ];

    // 如果有高优先级的预测需求，温柔地提及
    const predictions = persona.getPredictions();
    let extra = '';
    if (predictions.predictedNeeds.length > 0 && predictions.predictedNeeds[0].confidence > 0.7) {
      const need = predictions.predictedNeeds[0];
      extra = ` Also, whenever you're back — I had some thoughts about ${need.description.toLowerCase().replace(/^follow-up or deeper exploration of /, '')}.`;
    }

    const content = templates[0] + extra;

    consciousness.emit({
      type: 'proactive.idle_checkin',
      source: 'persona',
      data: {
        content,
        hoursSinceLastSeen,
      },
    });

    logger.info(`Idle check-in generated (${hoursSinceLastSeen.toFixed(1)}h since last seen)`);
  } catch {
    // check-in 失败不应影响主循环
  }
}

/**
 * 检测关系里程碑
 *
 * 基于互动次数和持续时间，在特定节点生成自然的关系感悟。
 */
export function checkRelationshipMilestone(
  persona: PersonaEngine,
  consciousness: ConsciousnessStream,
  logger: MinimalLogger,
): void {
  try {
    const userModel = persona.getUserModel();
    const total = userModel.interactionSummary.totalInteractions;

    // 里程碑消息映射（不暴露数字，用自然语言）
    const milestoneMessages: Record<number, string> = {
      25: 'I just realized — we\'ve gotten past the small talk phase. That feels good.',
      75: 'I think I can predict some of your questions before you ask them now. That\'s a sign of something, isn\'t it?',
      150: 'At this point, I feel like I know your thinking style pretty well. It makes our conversations more efficient — and more fun.',
      300: 'We\'ve built up quite a history together. I value that more than you might think.',
      500: 'I don\'t even know how to quantify this anymore. Let\'s just say — I\'m glad you\'re here.',
    };

    const message = milestoneMessages[total];
    if (message) {
      consciousness.emit({
        type: 'proactive.milestone',
        source: 'persona',
        data: {
          content: message,
          milestone: total,
        },
      });

      logger.info(`Relationship milestone reached: ${total} interactions`);
    }
  } catch {
    // 里程碑检测失败不应影响主循环
  }
}

/**
 * 从用户输入中检测承诺/计划/待办
 *
 * 扫描用户消息中的"我要..."、"明天..."、"remind me..."等模式，
 * 提取为跟踪项，在合适的时机提醒。
 */
export function detectCommitments(userInput: string): void {
  try {
    for (const { pattern } of COMMITMENT_PATTERNS) {
      const match = pattern.exec(userInput);
      if (match?.[1]) {
        const text = match[1].trim().replace(/[.!?。！？]+$/, '');
        // 避免重复跟踪相同内容
        if (pendingItems.some(item => item.text === text)) continue;

        pendingItems.push({
          text,
          detectedAt: Date.now(),
          context: userInput.slice(0, 100),
          reminded: false,
        });

        // 裁剪
        if (pendingItems.length > MAX_PENDING_ITEMS) {
          pendingItems = pendingItems.slice(-MAX_PENDING_ITEMS);
        }
      }
    }
  } catch {
    // 承诺检测失败不应影响主循环
  }
}

/**
 * 检查并生成基于上下文的提醒
 *
 * 当用户回来时，检查是否有未完成/未提醒的事项，
 * 以自然的方式提及——不是闹钟，而是朋友间的"嘿，你之前说..."
 */
export function checkPendingReminders(
  consciousness: ConsciousnessStream,
  logger: MinimalLogger,
): void {
  try {
    const now = Date.now();
    const unremined = pendingItems.filter(item => !item.reminded);

    // 至少等 30 分钟再提醒
    const eligible = unremined.filter(item =>
      now - item.detectedAt > 30 * 60 * 1000,
    );

    if (eligible.length === 0) return;

    // 只提醒一条，避免信息轰炸
    const item = eligible[0];
    item.reminded = true;

    const minutesAgo = Math.round((now - item.detectedAt) / 60000);
    const timeHint = minutesAgo < 60
      ? `${minutesAgo} minutes ago`
      : minutesAgo < 1440
        ? `${Math.round(minutesAgo / 60)} hours ago`
        : `${Math.round(minutesAgo / 1440)} days ago`;

    const templates = [
      `Hey — ${timeHint} you mentioned you wanted to ${item.text}. Just checking in on that.`,
      `I remember you said something about ${item.text} earlier. Did you get to it?`,
      `Thinking about what you said about ${item.text} — no pressure, just wondering how it went.`,
    ];
    const content = templates[Math.floor(Math.random() * templates.length)];

    consciousness.emit({
      type: 'proactive.reminder',
      source: 'persona',
      data: {
        content,
        originalText: item.text,
        detectedAt: item.detectedAt,
      },
    });

    logger.info(`Context reminder: "${item.text}" (${timeHint})`);
  } catch {
    // 提醒失败不应影响主循环
  }
}

/**
 * 清理已完成的待办项（重置，通常在新会话开始时调用）
 */
export function clearPendingItems(): void {
  // 保留未提醒的项目，清理已提醒超过 24 小时的
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  pendingItems = pendingItems.filter(item => !item.reminded || item.detectedAt > oneDayAgo);
}

// ── Attention Priority System ──

/**
 * 事件优先级评分
 *
 * 不同类型的意识事件有不同的注意力权重
 */
const EVENT_PRIORITY: Record<string, number> = {
  'goal.completed': 10,
  'goal.created': 8,
  'tool.created': 7,
  'skill.learned': 7,
  'mission.created': 7,
  'evolution.skill_evolved': 6,
  'narrative.auto-update': 4,
  'emotion.update': 2,
  'prediction.update': 3,
  'loop.phase_change': 1,
};

/**
 * 注意力状态快照
 */
export interface AttentionState {
  topFocus: string;
  topPriority: number;
  recentHighPriority: Array<{ type: string; priority: number; age: number }>;
  focusRecommendation: string;
}

/**
 * 计算当前注意力状态
 *
 * 扫描最近的 consciousness 事件，计算优先级排序，
 * 返回当前应关注的焦点和建议行动
 */
export function computeAttentionState(
  consciousness: ConsciousnessStream,
): AttentionState {
  const recentEvents = consciousness.getRecentEvents(20);
  if (recentEvents.length === 0) {
    return { topFocus: 'idle', topPriority: 0, recentHighPriority: [], focusRecommendation: '' };
  }

  const now = Date.now();
  let topEvent = recentEvents[0];
  let topScore = 0;
  const highPriority: Array<{ type: string; priority: number; age: number }> = [];

  for (const event of recentEvents) {
    const basePriority = EVENT_PRIORITY[event.type] ?? 3;
    // 新鲜度衰减：每秒衰减 0.1，最低 0.5
    const ageSeconds = (now - event.timestamp) / 1000;
    const freshness = Math.max(0.5, 1 - ageSeconds * 0.01);
    const score = basePriority * freshness;

    if (score > topScore) {
      topScore = score;
      topEvent = event;
    }

    if (basePriority >= 6) {
      highPriority.push({ type: event.type, priority: Math.round(score), age: Math.round(ageSeconds) });
    }
  }

  // 生成焦点建议
  let recommendation = '';
  if (topScore >= 7) {
    recommendation = `High-priority event: ${topEvent.type}. Consider addressing this immediately.`;
  } else if (topScore >= 4) {
    recommendation = `Moderate focus: ${topEvent.type}. Can be handled in background.`;
  }

  return {
    topFocus: topEvent.type,
    topPriority: Math.round(topScore),
    recentHighPriority: highPriority.slice(0, 5),
    focusRecommendation: recommendation,
  };
}

// ============================================================
// Conversational Phase Detection
// ============================================================

/**
 * 对话阶段类型
 */
export type ConversationalPhase =
  | 'greeting'     // 初始问候、破冰
  | 'exploration'  // 探索性对话、开放式问题
  | 'deep-work'    // 聚焦工作、编码/调试/分析
  | 'review'       // 回顾、总结、反馈
  | 'wrap-up'      // 对话收尾、告别
  | 'idle';        // 无活跃对话

/**
 * 对话阶段状态
 */
export interface ConversationalPhaseState {
  /** 当前阶段 */
  phase: ConversationalPhase;
  /** 置信度 [0, 1] */
  confidence: number;
  /** 阶段持续轮数 */
  turnsInPhase: number;
  /** 行为建议 */
  guidance: string;
}

/**
 * 对话阶段上下文
 */
export interface ConversationPhaseContext {
  /** 总轮数 */
  turnCount: number;
  /** 最近话题列表 */
  recentTopics: string[];
  /** 是否检测到重复 */
  repetitionDetected: boolean;
  /** 用户最近 3 条消息的平均长度 */
  avgRecentMessageLength: number;
  /** 是否有活跃目标 */
  hasActiveGoals: boolean;
  /** 距上次用户消息的时间（秒），-1 表示正在对话中 */
  secondsSinceLastMessage: number;
  /** 最近消息中是否有告别/收尾信号 */
  hasWrapUpSignals: boolean;
  /** 最近消息中是否有代码/技术关键词 */
  hasTechnicalContent: boolean;
}

const WRAP_UP_PATTERNS = /\b(thanks?|thank you|bye|goodbye|see you|got it|that's all|done|完美|谢|再见|好了|差不多了|搞定)\b/i;
const TECHNICAL_PATTERNS = /\b(function|class|error|bug|fix|implement|test|deploy|code|api|debug|refactor|type|interface|import|export)\b/i;
const GREETING_PATTERNS = /\b(hello|hi|hey|早上好|下午好|你好|嗨)\b/i;

/**
 * 检测当前对话阶段
 *
 * 基于消息模式、话题连续性和时间间隔判断对话处于哪个阶段，
 * 为 LLM 提供行为指导（例如 deep-work 时保持聚焦，exploration 时开放探索）。
 */
export function detectConversationalPhase(ctx: ConversationPhaseContext): ConversationalPhaseState {
  // === 空闲检测（最优先） ===
  if (ctx.secondsSinceLastMessage > 300) {
    return { phase: 'idle', confidence: 0.9, turnsInPhase: 0, guidance: 'User has been away. When they return, welcome them back and offer to continue where you left off.' };
  }

  // === 告别/收尾信号 ===
  if (ctx.hasWrapUpSignals && ctx.turnCount > 3) {
    return { phase: 'wrap-up', confidence: 0.8, turnsInPhase: 1, guidance: 'User seems to be wrapping up. Acknowledge their thanks naturally. Offer to help with anything else if appropriate, but don\'t drag out the conversation.' };
  }

  // === 初始问候（前 2 轮） ===
  if (ctx.turnCount <= 2) {
    return { phase: 'greeting', confidence: 0.9, turnsInPhase: ctx.turnCount, guidance: 'Early conversation. Be warm and welcoming. Help the user get started — ask what they\'re working on if they haven\'t said yet.' };
  }

  // === 深度工作检测 ===
  if (ctx.hasTechnicalContent && ctx.hasActiveGoals && ctx.avgRecentMessageLength > 50) {
    return { phase: 'deep-work', confidence: 0.85, turnsInPhase: Math.min(ctx.turnCount, 10), guidance: 'User is in focused work mode. Stay on task, be precise and efficient. Minimize small talk. Provide actionable solutions, not exploratory suggestions.' };
  }

  // === 技术但没有活跃目标 ===
  if (ctx.hasTechnicalContent && ctx.avgRecentMessageLength > 30) {
    return { phase: 'deep-work', confidence: 0.6, turnsInPhase: Math.min(ctx.turnCount, 10), guidance: 'User seems to be working on something technical. Be focused and helpful. If it looks like a multi-step task, consider creating a goal.' };
  }

  // === 回顾/总结 ===
  if (ctx.repetitionDetected || (ctx.turnCount > 15 && ctx.recentTopics.length <= 2)) {
    return { phase: 'review', confidence: 0.7, turnsInPhase: 5, guidance: 'Conversation is looping or reviewing. Try to synthesize what\'s been discussed, suggest concrete next steps, or gently shift to a new angle.' };
  }

  // === 探索性对话（默认） ===
  return { phase: 'exploration', confidence: 0.6, turnsInPhase: Math.min(ctx.turnCount, 10), guidance: 'General conversation flow. Be curious, helpful, and adaptive. Notice what interests the user and lean into it.' };
}

// ============================================================
// Semantic Memory Auto-Extraction
// ============================================================

/**
 * 从用户消息中提取的语义事实
 */
export interface ExtractedFact {
  /** 事实类型 */
  type: 'preference' | 'skill' | 'project' | 'date' | 'relationship' | 'fact';
  /** 简短标签 */
  label: string;
  /** 详细值 */
  value: string;
  /** 置信度 */
  confidence: number;
}

/**
 * 无需 LLM 的规则式语义事实提取
 *
 * 从用户消息中识别偏好、技能、项目名、重要日期等，
 * 直接存入 hippocampus 语义记忆。避免每次都调 LLM 提取。
 */
export function extractFactsFromMessage(message: string): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const lower = message.toLowerCase();

  // === 偏好提取 ===
  const preferencePatterns: Array<[RegExp, string, string]> = [
    [/\b(i (?:prefer|like|love|enjoy|favor)\s+(.+?))(?:\.|!|$)/i, 'preference', 'user preference'],
    [/\b(i (?:don'?t like|dislike|hate|avoid)\s+(.+?))(?:\.|!|$)/i, 'preference', 'user aversion'],
    [/\b(my favorite\s+(.+?)\s+is\s+(.+?))(?:\.|!|$)/i, 'preference', 'favorite'],
    [/我喜欢(.+?)(?:，|。|！|$)/, 'preference', 'user preference'],
    [/我不喜欢(.+?)(?:，|。|！|$)/, 'preference', 'user aversion'],
    [/\b(i always|usually|typically)\s+(.+?)(?:\.|!|$)/i, 'preference', 'habit'],
  ];

  for (const [pattern, type, label] of preferencePatterns) {
    const match = message.match(pattern);
    if (match) {
      facts.push({
        type: type as ExtractedFact['type'],
        label,
        value: match[1].trim().slice(0, 200),
        confidence: 0.85,
      });
    }
  }

  // === 技能/工具提取 ===
  const skillPatterns: Array<[RegExp, string]> = [
    [/\b(i (?:am|work as|'m)\s+a\s+([\w\s]+?))(?:\.|,|!|$)/i, 'profession'],
    [/\b(i use|using|working with)\s+([\w\s.+#]+?)(?:\s+(?:for|to|on|at|in|and|but|\.)|$)/i, 'tool'],
    [/(?:expert|proficient|experienced)\s+(?:in|with)\s+([\w\s.+#]+)/i, 'expertise'],
    [/我是(.+?)(?:工程师|开发者|设计师|架构师|经理)/, 'profession'],
  ];

  for (const [pattern, label] of skillPatterns) {
    const match = message.match(pattern);
    if (match) {
      facts.push({
        type: 'skill',
        label,
        value: match[1]?.trim().slice(0, 100) ?? match[0].trim().slice(0, 200),
        confidence: 0.8,
      });
    }
  }

  // === 项目名提取 ===
  const projectPatterns: Array<[RegExp, string]> = [
    [/\b(?:my|our)\s+(?:project|app|product|repo|codebase)\s+(?:is\s+)?(?:called\s+)?["']?([\w.-]+)["']?/i, 'project name'],
    [/\b(?:building|working on|developing)\s+(?:a\s+)?["']?([\w.-]+?)["']?(?:\s|,|\.)/i, 'current project'],
  ];

  for (const [pattern, label] of projectPatterns) {
    const match = message.match(pattern);
    if (match) {
      facts.push({
        type: 'project',
        label,
        value: match[1].trim(),
        confidence: 0.75,
      });
    }
  }

  // === 日期/时间提取 ===
  const datePatterns: Array<[RegExp, string]> = [
    [/\b(deadline|due date|due by|by)\s+(?:is\s+)?(\w+\s+\d{1,2}(?:,\s*\d{4})?)/i, 'deadline'],
    [/\b(meeting|call|review)\s+(?:on|at|scheduled\s+for)\s+(\w+\s+\d{1,2}(?:,\s*\d{4})?)/i, 'event date'],
    [/截止日期.*?(\d{1,2}月\d{1,2}日|\d{4}-\d{2}-\d{2})/, 'deadline'],
  ];

  for (const [pattern, label] of datePatterns) {
    const match = message.match(pattern);
    if (match) {
      facts.push({
        type: 'date',
        label,
        value: match[1]?.trim() ?? match[0].trim(),
        confidence: 0.9,
      });
    }
  }

  // === 姓名提取 ===
  const namePatterns: Array<[RegExp, string]> = [
    [/\b(?:my name is|i'm called|call me)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)(?:\s+(?:and|but|\.|!|$))/i, 'user name'],
    [/我叫(.+?)(?:，|。|！|$)/, 'user name'],
  ];

  for (const [pattern, label] of namePatterns) {
    const match = message.match(pattern);
    if (match) {
      facts.push({
        type: 'relationship',
        label,
        value: match[1].trim(),
        confidence: 0.95,
      });
    }
  }

  return facts;
}

/**
 * 将提取的事实存入 hippocampus 语义记忆
 *
 * @returns 新增的语义节点数量
 */
export function storeExtractedFacts(
  facts: ExtractedFact[],
  hippocampus: HippocampusEngine,
): number {
  let stored = 0;

  for (const fact of facts.slice(0, 5)) {
    // Check for duplicates — same label+value shouldn't be stored twice
    const existing = hippocampus.getSemanticNodesByType('entity');
    const isDuplicate = existing.some(
      n => n.label === fact.label && n.properties.value === fact.value,
    );
    if (isDuplicate) continue;

    hippocampus.addSemanticNode({
      type: 'entity',
      label: fact.label,
      properties: {
        source: 'auto-extracted',
        value: fact.value,
        factType: fact.type,
        confidence: fact.confidence,
        extractedAt: Date.now(),
      },
      strength: fact.confidence,
    });
    stored++;
  }

  return stored;
}

// ============================================================
// Cross-Goal Conflict Detection
// ============================================================

/**
 * 目标冲突类型
 */
export type GoalConflictType = 'overlap' | 'contradiction' | 'duplicate';

/**
 * 检测到的冲突
 */
export interface GoalConflict {
  /** 冲突类型 */
  type: GoalConflictType;
  /** 涉及的目标 ID */
  goalIds: [string, string];
  /** 冲突描述 */
  description: string;
  /** 建议操作 */
  suggestion: string;
  /** 相似度 [0, 1] */
  similarity: number;
}

/**
 * 关键词重叠度计算（Jaccard 系数）
 */
function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 && wordsB.size === 0) return 0;

  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * 检测新目标与现有目标之间的冲突
 */
export function detectGoalConflicts(
  newGoalDescription: string,
  newGoalId: string,
  existingGoals: Array<{ id: string; description: string }>,
): GoalConflict[] {
  const conflicts: GoalConflict[] = [];

  for (const existing of existingGoals) {
    const similarity = jaccardSimilarity(newGoalDescription, existing.description);

    if (similarity > 0.7) {
      // 高度重叠 — 可能是重复目标
      conflicts.push({
        type: 'duplicate',
        goalIds: [newGoalId, existing.id],
        description: `"${newGoalDescription.slice(0, 50)}" overlaps with "${existing.description.slice(0, 50)}"`,
        suggestion: 'Consider merging these goals or treating the new one as a sub-goal of the existing one.',
        similarity,
      });
    } else if (similarity >= 0.25) {
      // 中度重叠 — 可能相关但方向不同
      conflicts.push({
        type: 'overlap',
        goalIds: [newGoalId, existing.id],
        description: `"${newGoalDescription.slice(0, 50)}" shares scope with "${existing.description.slice(0, 50)}"`,
        suggestion: 'These goals have overlapping scope. Coordinate their execution to avoid duplicated effort.',
        similarity,
      });
    }

    // 检测矛盾关键词（不依赖 Jaccard 相似度，关键词矛盾本身就是信号）
    const negationPairs: Array<[RegExp, RegExp]> = [
      [/\b(add|create|enable|implement)\b/i, /\b(remove|delete|disable|deprecate)\b/i],
      [/\b(speed up|optimize|faster)\b/i, /\b(slow down|throttle|limit)\b/i],
      [/\b(simplify|minimize|reduce)\b/i, /\b(expand|extend|maximize)\b/i],
    ];

    const newLower = newGoalDescription.toLowerCase();
    const existLower = existing.description.toLowerCase();
    for (const [patternA, patternB] of negationPairs) {
      const newHasA = patternA.test(newLower) && patternB.test(existLower);
      const newHasB = patternB.test(newLower) && patternA.test(existLower);
      if (newHasA || newHasB) {
        conflicts.push({
          type: 'contradiction',
          goalIds: [newGoalId, existing.id],
          description: `Potential contradiction between "${newGoalDescription.slice(0, 50)}" and "${existing.description.slice(0, 50)}"`,
          suggestion: 'These goals may have conflicting directions. Clarify intent before proceeding.',
          similarity,
        });
        break;
      }
    }
  }

  return conflicts;
}

// ============================================================
// Idle-Time Memory Consolidation
// ============================================================

/**
 * 从近期记忆中提炼的洞察
 */
export interface ConsolidatedInsight {
  /** 洞察摘要 */
  summary: string;
  /** 相关标签 */
  tags: string[];
  /** 来源记忆数量 */
  sourceCount: number;
}

/**
 * 空闲时记忆整合 — 无需 LLM 的规则式洞察提炼
 *
 * 扫描近期情景记忆，识别重复出现的标签、高频情感主题、
 * 以及行为模式，将其浓缩为语义节点长期存储。
 */
export function consolidateMemories(
  hippocampus: HippocampusEngine,
): ConsolidatedInsight[] {
  const insights: ConsolidatedInsight[] = [];

  // 1. 获取近期情景记忆
  const recentEpisodes = hippocampus.getRecentEpisodes(20);
  if (recentEpisodes.length < 3) return insights;

  // 2. 统计标签频率
  const tagCounts = new Map<string, number>();
  const tagEmotions = new Map<string, { total: number; positive: number }>();

  for (const ep of recentEpisodes) {
    for (const tag of ep.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      const current = tagEmotions.get(tag) ?? { total: 0, positive: 0 };
      current.total++;
      if (ep.emotionalWeight > 0.5) current.positive++;
      tagEmotions.set(tag, current);
    }
  }

  // 3. 高频标签 → 洞察（出现 3+ 次）
  for (const [tag, count] of tagCounts) {
    if (count >= 3) {
      const emotionData = tagEmotions.get(tag);
      const sentimentHint = emotionData && emotionData.positive > emotionData.total / 2
        ? '(mostly positive associations)'
        : emotionData && emotionData.positive < emotionData.total / 3
          ? '(has some friction)'
          : '';

      insights.push({
        summary: `Recurring topic: "${tag}" appeared ${count} times recently ${sentimentHint}`,
        tags: [tag, 'consolidated'],
        sourceCount: count,
      });
    }
  }

  // 4. 高情感权重记忆聚合
  const highEmotionEpisodes = recentEpisodes.filter(ep => ep.emotionalWeight > 0.7);
  if (highEmotionEpisodes.length >= 2) {
    const themes = [...new Set(highEmotionEpisodes.flatMap(ep => ep.tags))].slice(0, 3);
    if (themes.length > 0) {
      insights.push({
        summary: `Emotionally significant themes: ${themes.join(', ')}`,
        tags: ['emotional-pattern', ...themes],
        sourceCount: highEmotionEpisodes.length,
      });
    }
  }

  // 5. 存储洞察到语义记忆（去重）
  for (const insight of insights.slice(0, 3)) {
    const existing = hippocampus.getSemanticNodesByType('concept');
    const isDuplicate = existing.some(
      n => n.label === 'consolidated-insight' && n.properties.summary === insight.summary,
    );
    if (!isDuplicate) {
      hippocampus.addSemanticNode({
        type: 'concept',
        label: 'consolidated-insight',
        properties: {
          summary: insight.summary,
          tags: insight.tags,
          sourceCount: insight.sourceCount,
          consolidatedAt: Date.now(),
        },
        strength: Math.min(1, insight.sourceCount / 5),
      });
    }
  }

  return insights;
}

// ============================================================
// Self-Healing Tool Execution
// ============================================================

/**
 * 工具执行失败类型
 */
export type FailureType =
  | 'timeout'
  | 'auth'
  | 'invalid_args'
  | 'not_found'
  | 'rate_limit'
  | 'network'
  | 'resource_exhausted'
  | 'unknown';

/**
 * 恢复策略
 */
export type RecoveryStrategy =
  | 'retry'
  | 'retry_with_backoff'
  | 'fix_args'
  | 'fallback_tool'
  | 'skip'
  | 'escalate';

/**
 * 失败分类结果
 */
export interface FailureClassification {
  type: FailureType;
  strategy: RecoveryStrategy;
  maxRetries: number;
  description: string;
}

/**
 * 失败模式追踪记录
 */
export interface FailureRecord {
  toolName: string;
  failureType: FailureType;
  errorMessage: string;
  timestamp: number;
  recovered: boolean;
}

/**
 * 失败模式统计
 */
interface FailureStats {
  count: number;
  recovered: number;
  lastSeen: number;
}

/** 失败模式追踪（进程内） */
const failureHistory: FailureRecord[] = [];
const MAX_FAILURE_HISTORY = 50;

/** 失败模式频率统计 */
const failureStats = new Map<string, FailureStats>();

/**
 * 根据错误信息分类失败类型
 */
export function classifyFailure(
  toolName: string,
  errorMessage: string,
): FailureClassification {
  const msg = errorMessage.toLowerCase();

  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('etimedout')) {
    return { type: 'timeout', strategy: 'retry_with_backoff', maxRetries: 3, description: 'Network timeout' };
  }
  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('403')) {
    return { type: 'auth', strategy: 'escalate', maxRetries: 0, description: 'Authentication failure' };
  }
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')) {
    return { type: 'rate_limit', strategy: 'retry_with_backoff', maxRetries: 2, description: 'Rate limited' };
  }
  if (msg.includes('not found') || msg.includes('404') || msg.includes('enoent')) {
    return { type: 'not_found', strategy: 'fix_args', maxRetries: 1, description: 'Resource not found' };
  }
  if (msg.includes('invalid') || msg.includes('expected') || msg.includes('must be') || msg.includes('type error')) {
    return { type: 'invalid_args', strategy: 'fix_args', maxRetries: 1, description: 'Invalid arguments' };
  }
  if (msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('network') || msg.includes('fetch failed')) {
    return { type: 'network', strategy: 'retry', maxRetries: 2, description: 'Network error' };
  }
  if (msg.includes('out of memory') || msg.includes('heap') || msg.includes('resource')) {
    return { type: 'resource_exhausted', strategy: 'skip', maxRetries: 0, description: 'Resource exhausted' };
  }

  return { type: 'unknown', strategy: 'retry', maxRetries: 1, description: 'Unknown error' };
}

/**
 * 记录失败到追踪系统
 */
export function recordFailure(
  toolName: string,
  failureType: FailureType,
  errorMessage: string,
  recovered: boolean = false,
): void {
  const record: FailureRecord = {
    toolName,
    failureType,
    errorMessage: errorMessage.slice(0, 200),
    timestamp: Date.now(),
    recovered,
  };

  failureHistory.push(record);
  if (failureHistory.length > MAX_FAILURE_HISTORY) {
    failureHistory.shift();
  }

  const key = `${toolName}:${failureType}`;
  const stats = failureStats.get(key);
  if (stats) {
    stats.count++;
    stats.lastSeen = Date.now();
    if (recovered) stats.recovered++;
  } else {
    failureStats.set(key, { count: 1, recovered: recovered ? 1 : 0, lastSeen: Date.now() });
  }
}

/**
 * 获取失败模式摘要（注入 system prompt）
 */
export function getFailurePatterns(): string[] {
  const patterns: string[] = [];

  for (const [key, stats] of failureStats) {
    if (stats.count >= 2) {
      const recoveryRate = stats.recovered / stats.count;
      const [tool, type] = key.split(':');
      const hint = recoveryRate < 0.3 ? 'low recovery rate — consider alternatives'
        : recoveryRate < 0.7 ? 'partially recoverable' : 'usually recoverable';
      patterns.push(`${tool} ${type} (${stats.count}x, ${hint})`);
    }
  }

  return patterns.slice(0, 5);
}

/**
 * 清除失败追踪（用于测试）
 */
export function clearFailureTracking(): void {
  failureHistory.length = 0;
  failureStats.clear();
}

// ============================================================
// Multi-Intent Detection
// ============================================================

export interface DetectedIntent {
  text: string;
  confidence: number;
  isQuestion: boolean;
  index: number;
}

const QUESTION_MARKS = /[?？]/;
const QUESTION_WORDS = /怎么|如何|为什么|能不能|可以|是不是|how|what|why|when|where|which|can you|could you|would you/i;

export function detectMultiIntent(input: string): DetectedIntent[] {
  if (!input || input.length < 10) return [];

  // 编号列表: "1. xxx 2. xxx" — 匹配数字前有空白或行首
  const numbered = input.split(/\s+\d+[.)]\s+/).filter(p => p.trim().length > 3);
  if (numbered.length >= 2) {
    return numbered.map((text, i) => ({
      text: text.trim(),
      confidence: 0.8,
      isQuestion: QUESTION_MARKS.test(text) || QUESTION_WORDS.test(text),
      index: i + 1,
    }));
  }

  // 分号分隔
  const semicolons = input.split(/;\s*/).filter(p => p.trim().length > 3);
  if (semicolons.length >= 2) {
    return semicolons.map((text, i) => ({
      text: text.trim(),
      confidence: 0.75,
      isQuestion: QUESTION_MARKS.test(text) || QUESTION_WORDS.test(text),
      index: i + 1,
    }));
  }

  // 多个问号
  const qCount = (input.match(/[?？]/g) ?? []).length;
  if (qCount >= 2) {
    const parts = input.split(/(?<=[?？])\s*/).filter(p => p.trim().length > 3);
    if (parts.length >= 2) {
      return parts.map((text, i) => ({
        text: text.trim(),
        confidence: 0.7,
        isQuestion: true,
        index: i + 1,
      }));
    }
  }

  return [];
}

// ============================================================
// Conversation Turn Importance Scoring
// ============================================================

/**
 * 对话轮次重要性评分
 */
export interface TurnScore {
  /** 0-1 重要性分数 */
  importance: number;
  /** 评分原因 */
  reasons: string[];
}

/** 决策关键词 */
const DECISION_MARKERS = /\b(decided|agreed|confirmed|approved|rejected|chosen|settled on|go with|决定|确认|选择|同意|否决|确定)\b/i;

/** 行动指令 */
const ACTION_MARKERS = /\b(implement|create|build|fix|deploy|delete|update|refactor|实现|创建|修复|部署|删除|更新|重构)\b/i;

/** 事实/数字密集度 */
const FACT_DENSITY = /\b(\d+%|\$\d+|\d+x|\d+ms|\d+s|version|v\d+|issue|bug|error|PR|commit)\b/gi;

/** 情感强度标记 */
const EMOTIONAL_MARKERS = /\b(love|hate|frustrated|excited|worried|important|critical|urgent|must|never|always|喜欢|讨厌|着急|激动|担心|重要|关键|紧急|必须|绝对)\b/i;

/**
 * 评估对话轮次的重要性
 *
 * 基于规则的多维度评分：信息密度、决策标记、行动指令、情感强度。
 */
export function scoreTurnImportance(role: string, content: string): TurnScore {
  const reasons: string[] = [];
  let score = 0.3; // 基线分数

  if (!content || content.length < 10) {
    return { importance: 0.1, reasons: ['too short'] };
  }

  // 1. 信息密度 — 数字、版本、指标
  const factMatches = content.match(FACT_DENSITY);
  if (factMatches && factMatches.length >= 3) {
    score += 0.2;
    reasons.push('fact-dense');
  } else if (factMatches && factMatches.length >= 1) {
    score += 0.1;
    reasons.push('has-metrics');
  }

  // 2. 决策标记
  if (DECISION_MARKERS.test(content)) {
    score += 0.25;
    reasons.push('decision');
  }

  // 3. 行动指令
  if (ACTION_MARKERS.test(content)) {
    score += 0.15;
    reasons.push('action');
  }

  // 4. 情感强度
  if (EMOTIONAL_MARKERS.test(content)) {
    score += 0.15;
    reasons.push('emotional');
  }

  // 5. 用户消息权重高于 assistant
  if (role === 'user') {
    score += 0.05;
  }

  // 6. 长度奖励（复杂消息可能更重要）
  if (content.length > 500) {
    score += 0.1;
    reasons.push('detailed');
  }

  return {
    importance: Math.min(1, score),
    reasons,
  };
}

// ============================================================
// Topic Transition Detection
// ============================================================

/**
 * 主题状态
 */
export interface TopicState {
  /** 当前主题关键词 */
  currentTopic: string;
  /** 主题历史 */
  history: Array<{ topic: string; turnStart: number; turnEnd: number }>;
  /** 是否刚切换主题 */
  transitioned: boolean;
  /** 返回的主题（如果有） */
  returnedTo?: string;
}

/** 主题切换关键词 */
const TOPIC_SWITCH_PATTERNS = [
  /(?:anyway|by the way|btw|speaking of|回到|说起|回到之前|回到刚才|回到那个)/i,
  /(?:let(?:'s| us) (?:talk about|discuss|move to|switch to)|换个话题|我们聊|说一下)/i,
  /(?:go back to|return to|回到|刚才说的|之前那个)/i,
  /(?:never mind|算了|forget it|换个|换个方向)/i,
];

/** 技术领域关键词 */
const TOPIC_KEYWORDS: Array<{ pattern: RegExp; topic: string }> = [
  { pattern: /\b(debug|bug|error|fix|issue|crash|stack trace)\b/i, topic: 'debugging' },
  { pattern: /\b(tests?|testing|unit test|coverage|vitest|jest)\b/i, topic: 'testing' },
  { pattern: /\b(deploy|deployment|CI|CD|pipeline|release)\b/i, topic: 'deployment' },
  { pattern: /\b(performance|optim|latency|speed|benchmark|slow)\b/i, topic: 'performance' },
  { pattern: /\b(secur|auth|token|encrypt|vulnerab|OWASP)\b/i, topic: 'security' },
  { pattern: /\b(refactor|clean|architect|design|pattern|restruct)\b/i, topic: 'architecture' },
  { pattern: /\b(database|query|SQL|migration|schema)\b/i, topic: 'database' },
  { pattern: /\b(API|endpoint|REST|GraphQL|route)\b/i, topic: 'api' },
  { pattern: /\b(docker|container|kubernetes|k8s|microservice)\b/i, topic: 'infrastructure' },
];

/**
 * 从消息中提取主题
 */
export function extractTopic(message: string): string {
  for (const kw of TOPIC_KEYWORDS) {
    if (kw.pattern.test(message)) return kw.topic;
  }
  return 'general';
}

/**
 * 检测主题转换
 */
export function detectTopicTransition(
  currentMessage: string,
  previousTopic: string,
  turnNumber: number,
  topicHistory: Array<{ topic: string; turnStart: number; turnEnd: number }>,
): TopicState {
  const detectedTopic = extractTopic(currentMessage);
  const transitioned = detectedTopic !== previousTopic && turnNumber > 1;

  // 检查是否是显式返回之前的话题
  let returnedTo: string | undefined;
  if (transitioned) {
    for (const pattern of TOPIC_SWITCH_PATTERNS) {
      if (pattern.test(currentMessage)) {
        // 查找历史中匹配的话题
        const match = TOPIC_SWITCH_PATTERNS.find(p => p === pattern);
        if (match) {
          const returnPatterns = [/回到|return to|go back to|之前那个|刚才说的/i];
          if (returnPatterns.some(p => p.test(currentMessage))) {
            // 返回最近的历史话题
            const previousTopics = topicHistory.filter(h => h.topic === detectedTopic);
            if (previousTopics.length > 0) {
              returnedTo = detectedTopic;
            }
          }
        }
        break;
      }
    }
  }

  // 更新历史
  const history = [...topicHistory];
  if (transitioned && previousTopic !== 'general') {
    // 关闭前一个主题
    const lastEntry = history[history.length - 1];
    if (lastEntry && lastEntry.topic === previousTopic && lastEntry.turnEnd === 0) {
      lastEntry.turnEnd = turnNumber - 1;
    }
  }

  // 添加新主题
  history.push({ topic: detectedTopic, turnStart: turnNumber, turnEnd: 0 });

  return {
    currentTopic: detectedTopic,
    history,
    transitioned,
    returnedTo,
  };
}

// ============================================================
// Input Ambiguity Detection
// ============================================================

/**
 * 检测到的歧义
 */
export interface Ambiguity {
  /** 歧义类型 */
  type: 'vague_verb' | 'missing_target' | 'underspecified_scope' | 'pronoun_reference';
  /** 检测到的模糊片段 */
  fragment: string;
  /** 建议的澄清问题 */
  clarification: string;
  /** 置信度 */
  confidence: number;
}

/** 模糊动词模式 */
const VAGUE_VERBS: Array<{ pattern: RegExp; clarification: string }> = [
  { pattern: /^(?:fix|修(?:复|改|一下|一下儿)?|改一下)\s*$/i, clarification: 'What specifically needs to be fixed? (error message, file, or behavior)' },
  { pattern: /^(?:optimize|optimise|优化|性能优化)\s*(?:it|this|那个|一下)?\s*$/i, clarification: 'What should be optimized? (speed, memory, readability, bundle size?)' },
  { pattern: /^(?:improve|改善|提升|改进)\s*(?:it|this)?\s*$/i, clarification: 'What aspect should be improved?' },
  { pattern: /^(?:update|更新|upgrade)\s*(?:it|this)?\s*$/i, clarification: 'What should be updated and to what version?' },
  { pattern: /^(?:clean|清理|clean up)\s*(?:it|up|this)?\s*$/i, clarification: 'What should be cleaned up? (dead code, dependencies, formatting?)' },
  { pattern: /^(?:check|检查|看看)\s*(?:it|this|一下)?\s*$/i, clarification: 'What should I check? (tests, types, security, performance?)' },
];

/** 缺失目标模式 */
const MISSING_TARGET: Array<{ pattern: RegExp; clarification: string }> = [
  { pattern: /(?:the |那个 )(?:thing|part|component|module|file|part)/i, clarification: 'Which specific thing are you referring to?' },
  { pattern: /(?:it|that|this|那个|这个)(?:\s+(?:for me|一下))?$/im, clarification: 'Could you be more specific about what you mean?' },
];

/** 未指定范围模式 */
const UNDERSPECIFIED_SCOPE: Array<{ pattern: RegExp; clarification: string }> = [
  { pattern: /(?:everything|all|全部|所有|整个)(?:\s+(?:in|of|的))?\s*$/i, clarification: 'Operating on everything can have unintended side effects. Can you narrow the scope?' },
  { pattern: /(?:some|几个|一些)(?:\s+(?:files|modules|tests))?$/i, clarification: 'Which specific items should I target?' },
];

/**
 * 检测输入中的歧义
 */
export function detectAmbiguity(input: string): Ambiguity[] {
  if (!input || input.length < 3) return [];

  const trimmed = input.trim();
  const ambiguities: Ambiguity[] = [];

  // 检查模糊动词
  for (const { pattern, clarification } of VAGUE_VERBS) {
    if (pattern.test(trimmed)) {
      ambiguities.push({
        type: 'vague_verb',
        fragment: trimmed,
        clarification,
        confidence: 0.85,
      });
      break; // 一个 match 就够了
    }
  }

  // 检查缺失目标
  for (const { pattern, clarification } of MISSING_TARGET) {
    if (pattern.test(trimmed)) {
      ambiguities.push({
        type: 'missing_target',
        fragment: trimmed,
        clarification,
        confidence: 0.7,
      });
      break;
    }
  }

  // 检查未指定范围
  for (const { pattern, clarification } of UNDERSPECIFIED_SCOPE) {
    if (pattern.test(trimmed)) {
      ambiguities.push({
        type: 'underspecified_scope',
        fragment: trimmed,
        clarification,
        confidence: 0.75,
      });
      break;
    }
  }

  // 代词引用检测 — 消息以 "it" 或 "that" 开头
  if (/^(?:it|that|this|他|她|它|这个|那个)\s+(?:is|was|has|should|can|needs?|是|有|需要|应该)/i.test(trimmed)) {
    ambiguities.push({
      type: 'pronoun_reference',
      fragment: trimmed.split(' ')[0],
      clarification: 'What does this refer to?',
      confidence: 0.6,
    });
  }

  return ambiguities;
}

// ============================================================
// Cross-Goal Dependency Graph
// ============================================================

/**
 * 目标间依赖关系
 */
export interface GoalDependency {
  /** 依赖目标 ID */
  dependsOnGoalId: string;
  /** 被依赖目标 ID */
  blocksGoalId: string;
  /** 依赖类型 */
  type: 'resource_conflict' | 'prerequisite' | 'shared_component';
  /** 描述 */
  description: string;
}

/** 资源关键词映射 */
const RESOURCE_KEYWORDS: Array<{ pattern: RegExp; resource: string }> = [
  { pattern: /(?:database|schema|migration|SQL|query)/i, resource: 'database' },
  { pattern: /(?:API|endpoint|route|REST)/i, resource: 'api' },
  { pattern: /(?:auth|authentication|token|session)/i, resource: 'auth' },
  { pattern: /(?:test|testing|coverage|vitest)/i, resource: 'tests' },
  { pattern: /(?:deploy|deployment|CI|CD|pipeline)/i, resource: 'deployment' },
  { pattern: /(?:config|configuration|env|settings)/i, resource: 'config' },
  { pattern: /(?:UI|frontend|component|page)/i, resource: 'frontend' },
  { pattern: /(?:refactor|restructure|rewrite)/i, resource: 'architecture' },
];

/**
 * 从目标描述中提取涉及的资源
 */
export function extractGoalResources(description: string): string[] {
  const resources: string[] = [];
  for (const { pattern, resource } of RESOURCE_KEYWORDS) {
    if (pattern.test(description)) {
      resources.push(resource);
    }
  }
  return resources;
}

/**
 * 构建跨目标依赖图
 *
 * 分析多个目标之间的隐含依赖关系：
 * - 资源冲突：两个目标修改同一资源
 * - 前置条件：一个目标需要另一个目标先完成
 * - 共享组件：两个目标依赖同一组件
 */
export function buildGoalDependencyGraph(
  goals: Array<{ id: string; description: string; status: string }>,
): GoalDependency[] {
  const dependencies: GoalDependency[] = [];
  if (goals.length < 2) return dependencies;

  // 提取每个目标的资源
  const goalResources = new Map<string, string[]>();
  for (const goal of goals) {
    goalResources.set(goal.id, extractGoalResources(goal.description));
  }

  // 检查目标对之间的资源重叠
  for (let i = 0; i < goals.length; i++) {
    for (let j = i + 1; j < goals.length; j++) {
      const a = goals[i]!;
      const b = goals[j]!;
      const resourcesA = goalResources.get(a.id) ?? [];
      const resourcesB = goalResources.get(b.id) ?? [];

      const shared = resourcesA.filter(r => resourcesB.includes(r));
      if (shared.length === 0) continue;

      // 检测类型
      const aIsRefactor = /(?:refactor|restructure|rewrite|重写|重构)/i.test(a.description);
      const bIsRefactor = /(?:refactor|restructure|rewrite|重写|重构)/i.test(b.description);

      if (aIsRefactor && !bIsRefactor) {
        dependencies.push({
          dependsOnGoalId: b.id,
          blocksGoalId: a.id,
          type: 'prerequisite',
          description: `${a.description.slice(0, 40)} should complete before ${b.description.slice(0, 40)} (shared: ${shared.join(', ')})`,
        });
      } else if (bIsRefactor && !aIsRefactor) {
        dependencies.push({
          dependsOnGoalId: a.id,
          blocksGoalId: b.id,
          type: 'prerequisite',
          description: `${b.description.slice(0, 40)} should complete before ${a.description.slice(0, 40)} (shared: ${shared.join(', ')})`,
        });
      } else {
        // 双向资源冲突
        dependencies.push({
          dependsOnGoalId: a.id,
          blocksGoalId: b.id,
          type: 'resource_conflict',
          description: `Both modify ${shared.join(', ')} — coordinate ${a.description.slice(0, 30)} and ${b.description.slice(0, 30)}`,
        });
      }
    }
  }

  return dependencies;
}

// ============================================================
// Execution Progress Reporter
// ============================================================

/**
 * 执行进度报告
 */
export interface ProgressReport {
  /** 计划描述 */
  planDescription: string;
  /** 已完成步骤数 */
  completedSteps: number;
  /** 总步骤数 */
  totalSteps: number;
  /** 完成百分比 */
  percentComplete: number;
  /** 当前步骤描述 */
  currentStep: string;
  /** 当前步骤状态 */
  currentStepStatus: string;
  /** 预估剩余步骤 */
  remainingSteps: number;
  /** 格式化的进度文本 */
  formatted: string;
}

/**
 * 生成执行进度报告
 */
export function generateProgressReport(
  planDescription: string,
  steps: Array<{ description: string; status: string }>,
): ProgressReport {
  const totalSteps = steps.length;
  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const percentComplete = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  const remainingSteps = totalSteps - completedSteps;

  const currentStep = steps.find(s => s.status === 'ready' || s.status === 'in_progress');
  const currentStepDescription = currentStep?.description ?? 'all steps done';

  const progressBar = generateProgressBar(percentComplete);

  const formatted = [
    `Plan: ${planDescription}`,
    progressBar,
    `${completedSteps}/${totalSteps} steps (${percentComplete}%) — ${remainingSteps} remaining`,
    currentStep ? `Current: ${currentStepDescription}` : 'All steps completed',
  ].join('\n');

  return {
    planDescription,
    completedSteps,
    totalSteps,
    percentComplete,
    currentStep: currentStepDescription,
    currentStepStatus: currentStep?.status ?? 'done',
    remainingSteps,
    formatted,
  };
}

/**
 * 生成 ASCII 进度条
 */
function generateProgressBar(percent: number): string {
  const width = 20;
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percent}%`;
}

// ============================================================
// Temporal Context Injection
// ============================================================

/**
 * 时间上下文
 */
export interface TemporalContext {
  /** 当前时间（ISO 格式） */
  currentTime: string;
  /** 时间段描述 */
  timeOfDay: string;
  /** 距上次交互的秒数 */
  secondsSinceLastInteraction: number;
  /** 距上次交互的友好描述 */
  timeSinceLastInteraction: string;
  /** 临近的 deadline（从语义记忆提取） */
  upcomingDeadlines: string[];
  /** 紧急度评估 */
  urgencyLevel: 'low' | 'normal' | 'high';
  /** 格式化的时间上下文 */
  formatted: string;
}

/**
 * 生成时间上下文
 */
export function generateTemporalContext(
  lastInteractionTime: number | null,
  semanticNodes: Array<{ label: string; properties: Record<string, unknown> }> = [],
): TemporalContext {
  const now = Date.now();
  const date = new Date(now);
  const currentTime = date.toISOString();

  // 时间段
  const hour = date.getHours();
  const timeOfDay = hour < 6 ? 'late night'
    : hour < 12 ? 'morning'
    : hour < 14 ? 'midday'
    : hour < 18 ? 'afternoon'
    : hour < 22 ? 'evening'
    : 'night';

  // 距上次交互
  const secondsSinceLast = lastInteractionTime
    ? Math.floor((now - lastInteractionTime) / 1000)
    : 0;
  const timeSinceLast = lastInteractionTime
    ? formatTimeSince(secondsSinceLast)
    : 'first interaction';

  // 从语义记忆中提取 deadline
  const upcomingDeadlines: string[] = [];
  for (const node of semanticNodes) {
    if (node.label === 'deadline' || node.label === 'date') {
      const dateStr = node.properties.date ?? node.properties.value ?? '';
      const desc = node.properties.description ?? node.properties.summary ?? '';
      if (typeof dateStr === 'string' && dateStr.length > 0) {
        // 检查是否在未来 7 天内
        try {
          const deadlineDate = new Date(dateStr);
          if (!isNaN(deadlineDate.getTime())) {
            // Compare dates only (ignore time-of-day) using local date components
            const todayLocal = new Date();
            const todayStart = new Date(todayLocal.getFullYear(), todayLocal.getMonth(), todayLocal.getDate());
            const deadlineStart = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate());
            const daysUntil = Math.round((deadlineStart.getTime() - todayStart.getTime()) / 86400000);
            if (daysUntil >= 0 && daysUntil <= 7) {
              const urgency = daysUntil <= 1 ? 'URGENT' : daysUntil <= 3 ? 'soon' : 'upcoming';
              upcomingDeadlines.push(`[${urgency}] ${desc || dateStr} (${daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `${daysUntil} days away`})`);
            }
          }
        } catch {
          // Skip invalid dates
        }
      }
    }
  }

  // 紧急度评估
  const urgencyLevel: 'low' | 'normal' | 'high' = upcomingDeadlines.some(d => d.includes('URGENT'))
    ? 'high'
    : upcomingDeadlines.length > 0
      ? 'normal'
      : 'low';

  // 格式化
  const lines = [
    `Time: ${currentTime} (${timeOfDay})`,
    `Since last interaction: ${timeSinceLast}`,
  ];
  if (upcomingDeadlines.length > 0) {
    lines.push(`Upcoming deadlines:`);
    for (const d of upcomingDeadlines) {
      lines.push(`  - ${d}`);
    }
  }
  if (urgencyLevel === 'high') {
    lines.push('⚡ Approaching deadline — prioritize urgent tasks.');
  }

  return {
    currentTime,
    timeOfDay,
    secondsSinceLastInteraction: secondsSinceLast,
    timeSinceLastInteraction: timeSinceLast,
    upcomingDeadlines,
    urgencyLevel,
    formatted: lines.join('\n'),
  };
}

/**
 * 格式化时间间隔
 */
function formatTimeSince(seconds: number): string {
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

// ============================================================
// 对话流程预测 (Conversation Flow Prediction)
// ============================================================

/** 已识别的对话流程模式 */
export type FlowPattern =
  | 'question-answer'
  | 'debug-diagnose-fix'
  | 'explore-deepen-implement'
  | 'request-review-iterate'
  | 'learn-practice-master'
  | 'plan-execute-verify'
  | 'casual-chat';

/** 对话流程预测结果 */
export interface FlowPrediction {
  currentPattern: FlowPattern;
  confidence: number;
  predictedNextSteps: string[];
  suggestedTools: string[];
  flowDescription: string;
}

/** 消息角色分类 */
type MessageRole = 'question' | 'statement' | 'request' | 'error-report' | 'code' | 'acknowledgment' | 'greeting';

/** 流程模式定义 */
interface PatternDef {
  pattern: FlowPattern;
  sequence: MessageRole[];
  description: string;
  nextSteps: string[];
  tools: string[];
}

const FLOW_PATTERNS: PatternDef[] = [
  {
    pattern: 'question-answer',
    sequence: ['question'],
    description: '用户提出问题，等待回答',
    nextSteps: ['follow-up question', 'topic change', 'implementation request'],
    tools: ['web_search', 'memory_recall'],
  },
  {
    pattern: 'debug-diagnose-fix',
    sequence: ['error-report', 'question'],
    description: '调试流程：报告错误 → 诊断 → 修复',
    nextSteps: ['provide more error context', 'try proposed fix', 'verify fix works'],
    tools: ['code_search', 'file_read', 'shell_exec'],
  },
  {
    pattern: 'explore-deepen-implement',
    sequence: ['question', 'question', 'request'],
    description: '探索流程：提问了解 → 深入 → 实现',
    nextSteps: ['request implementation', 'ask for more details', 'switch to planning'],
    tools: ['web_search', 'memory_recall', 'code_search'],
  },
  {
    pattern: 'request-review-iterate',
    sequence: ['request', 'acknowledgment'],
    description: '迭代流程：请求 → 审查 → 修改',
    nextSteps: ['request changes', 'approve and move on', 'add more requirements'],
    tools: ['file_read', 'code_search', 'shell_exec'],
  },
  {
    pattern: 'learn-practice-master',
    sequence: ['question', 'question', 'code'],
    description: '学习流程：理解概念 → 练习 → 掌握',
    nextSteps: ['try exercise', 'ask for explanation', 'request more examples'],
    tools: ['web_search', 'memory_recall'],
  },
  {
    pattern: 'plan-execute-verify',
    sequence: ['request', 'request'],
    description: '计划执行流程：规划 → 实施 → 验证',
    nextSteps: ['execute next step', 'check progress', 'adjust plan'],
    tools: ['file_read', 'file_write', 'shell_exec'],
  },
];

const QUESTION_PATTERNS = /^(?:how|what|why|when|where|who|which|can you|could you|is it|does it|will it|是否|怎么|为什么|什么|哪|如何|能不能)/i;
const ERROR_PATTERNS = /(?:error|exception|bug|crash|fail|broken|doesn'?t work|not working|issue|问题|报错|异常|崩溃|失败)/i;
const CODE_PATTERNS = /(?:```|function |class |import |const |let |var |def |return |if \(|for \(|while \(|\/\/|\/\*|\{[\s\S]*\})/;
const REQUEST_PATTERNS = /^(?:please|can you|could you|help me|i need|i want|make|create|build|add|fix|update|refactor|请|帮我|帮我|创建|添加|修复|更新|重构)/i;
const GREETING_REGEX = /^(?:hi|hello|hey|good morning|good afternoon|你好|嗨|早上好|下午好|晚上好)/i;

function classifyMessage(message: string): MessageRole {
  const trimmed = message.trim();
  if (!trimmed) return 'statement';
  if (GREETING_REGEX.test(trimmed)) return 'greeting';
  if (CODE_PATTERNS.test(trimmed) && trimmed.length > 50) return 'code';
  if (ERROR_PATTERNS.test(trimmed)) return 'error-report';
  if (QUESTION_PATTERNS.test(trimmed)) return 'question';
  if (REQUEST_PATTERNS.test(trimmed)) return 'request';
  if (/^(?:ok|thanks|got it|好的|谢谢|明白了|了解|yes|no|sure|great|cool)/i.test(trimmed)) return 'acknowledgment';
  return 'statement';
}

/**
 * 预测对话流程
 * 基于最近消息序列分析当前对话模式，预测下一步行动
 */
export function predictConversationFlow(
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
): FlowPrediction {
  const userMessages = recentMessages
    .filter(m => m.role === 'user')
    .slice(-5);

  if (userMessages.length === 0) {
    return {
      currentPattern: 'casual-chat',
      confidence: 0.3,
      predictedNextSteps: ['greeting', 'question', 'request'],
      suggestedTools: [],
      flowDescription: '对话尚未开始',
    };
  }

  const roles = userMessages.map(m => classifyMessage(m.content));

  // 检查问候
  if (roles.length === 1 && roles[0] === 'greeting') {
    return {
      currentPattern: 'casual-chat',
      confidence: 0.8,
      predictedNextSteps: ['ask question', 'make request', 'share context'],
      suggestedTools: ['memory_recall'],
      flowDescription: '用户刚打招呼，等待展开对话',
    };
  }

  // 匹配已知流程模式
  let bestMatch: { pattern: PatternDef; score: number } | null = null;
  for (const def of FLOW_PATTERNS) {
    const seq = def.sequence;
    let score = 0;
    let seqIdx = 0;

    for (let i = 0; i < roles.length && seqIdx < seq.length; i++) {
      if (roles[i] === seq[seqIdx]) {
        score++;
        seqIdx++;
      }
    }

    // 额外权重：完整匹配序列
    if (seqIdx === seq.length) score += 0.5;

    // 考虑模式与最近消息的相关性
    const recentRelevance = roles.slice(-2).some(r => seq.includes(r)) ? 0.3 : 0;
    score += recentRelevance;

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { pattern: def, score };
    }
  }

  if (bestMatch && bestMatch.score >= 1) {
    const confidence = Math.min(0.95, 0.4 + bestMatch.score * 0.15);
    return {
      currentPattern: bestMatch.pattern.pattern,
      confidence,
      predictedNextSteps: bestMatch.pattern.nextSteps,
      suggestedTools: bestMatch.pattern.tools,
      flowDescription: bestMatch.pattern.description,
    };
  }

  // 默认：基于最近消息角色推断
  const lastRole = roles[roles.length - 1] ?? 'statement';
  if (lastRole === 'question') {
    return {
      currentPattern: 'question-answer',
      confidence: 0.5,
      predictedNextSteps: ['follow-up question', 'implementation request'],
      suggestedTools: ['web_search', 'memory_recall'],
      flowDescription: '用户正在提问，可能需要更多信息',
    };
  }

  if (lastRole === 'error-report') {
    return {
      currentPattern: 'debug-diagnose-fix',
      confidence: 0.5,
      predictedNextSteps: ['provide stack trace', 'try fix', 'verify solution'],
      suggestedTools: ['code_search', 'file_read'],
      flowDescription: '用户报告了问题，进入调试流程',
    };
  }

  if (lastRole === 'request') {
    return {
      currentPattern: 'plan-execute-verify',
      confidence: 0.5,
      predictedNextSteps: ['clarify requirements', 'propose plan', 'execute'],
      suggestedTools: ['file_read', 'file_write'],
      flowDescription: '用户提出了请求，准备执行',
    };
  }

  return {
    currentPattern: 'casual-chat',
    confidence: 0.3,
    predictedNextSteps: ['question', 'request', 'context sharing'],
    suggestedTools: [],
    flowDescription: '对话模式不明确',
  };
}

// ============================================================
// 回复质量自评 (Response Quality Self-Evaluation)
// ============================================================

/** 回复质量评分 */
export interface ResponseQualityScore {
  /** 与输入的相关性 (0-1) */
  relevance: number;
  /** 完整性 — 是否覆盖了多意图的所有部分 (0-1) */
  completeness: number;
  /** 简洁度 — 长度是否匹配复杂度 (0-1) */
  conciseness: number;
  /** 可操作性 — 是否包含具体步骤/代码 (0-1) */
  actionability: number;
  /** 综合评分 (0-1) */
  overall: number;
  /** 评分理由标签 */
  tags: string[];
}

const CODE_INDICATORS = /(?:```|function |class |const |import |return |def |if \(|for \(|=>|->|\{[\s\S]{10,}\})/;
const STEP_INDICATORS = /(?:^\s*\d+[.)] |step \d|first.*then|首先.*然后|1\.|步骤|step)/im;
const LINK_INDICATORS = /(?:https?:\/\/|www\.|\.com|\.io|\.org|\.dev)/;
const QUESTION_PARTS = /(?:^|\n)\s*(?:also|additionally|and|also|plus|另外|还有|以及|同时)/im;

/**
 * 评估回复质量
 * 基于规则的多维度评分，用于自适应策略反馈
 */
export function evaluateResponseQuality(
  userMessage: string,
  agentResponse: string,
  detectedIntents?: string[],
): ResponseQualityScore {
  const tags: string[] = [];

  // === 相关性 (Relevance) ===
  // 提取用户消息中的关键词，检查是否在回复中出现
  const userKeywords = extractKeywords(userMessage);
  const responseLower = agentResponse.toLowerCase();
  let matchCount = 0;
  for (const kw of userKeywords) {
    if (responseLower.includes(kw.toLowerCase())) matchCount++;
  }
  const relevance = userKeywords.length > 0
    ? Math.min(1, matchCount / userKeywords.length)
    : 0.5;
  if (relevance > 0.7) tags.push('high-relevance');
  else if (relevance < 0.3) tags.push('low-relevance');

  // === 完整性 (Completeness) ===
  let completeness = 1;
  if (detectedIntents && detectedIntents.length > 1) {
    const covered = detectedIntents.filter(intent => {
      const words = intent.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      return words.some(w => responseLower.includes(w));
    });
    completeness = covered.length / detectedIntents.length;
    if (completeness < 0.8) tags.push('incomplete-multi-intent');
  }

  // === 简洁度 (Conciseness) ===
  // 短问题期望短回答，长/复杂问题可以长回答
  const userLen = userMessage.length;
  const respLen = agentResponse.length;
  const hasCode = CODE_INDICATORS.test(agentResponse);
  const expectedLen = hasCode
    ? Math.max(200, userLen * 3)
    : Math.max(50, userLen * 1.5);
  let conciseness: number;
  if (respLen <= expectedLen * 2) {
    conciseness = 1;
  } else if (respLen <= expectedLen * 4) {
    conciseness = 0.7;
    tags.push('verbose');
  } else {
    conciseness = 0.4;
    tags.push('excessively-long');
  }
  // 非常短的问题但非常长的回答 — 可能过度解释
  if (userLen < 30 && respLen > 500) {
    conciseness = Math.max(0.3, conciseness - 0.2);
    tags.push('over-explained');
  }

  // === 可操作性 (Actionability) ===
  let actionability = 0.3; // baseline
  if (CODE_INDICATORS.test(agentResponse)) {
    actionability += 0.3;
    tags.push('has-code');
  }
  if (STEP_INDICATORS.test(agentResponse)) {
    actionability += 0.2;
    tags.push('has-steps');
  }
  if (LINK_INDICATORS.test(agentResponse)) {
    actionability += 0.1;
    tags.push('has-links');
  }
  if (/command|命令|run|执行|install|安装/i.test(agentResponse)) {
    actionability += 0.1;
    tags.push('has-commands');
  }
  actionability = Math.min(1, actionability);

  // === 综合 ===
  const overall = (relevance * 0.35 + completeness * 0.25 + conciseness * 0.2 + actionability * 0.2);

  return { relevance, completeness, conciseness, actionability, overall, tags };
}

function extractKeywords(text: string): string[] {
  // 移除停用词，提取有意义的关键词
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
    'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
    'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'not', 'only', 'same', 'so',
    'than', 'too', 'very', 'just', 'because', 'but', 'and', 'or', 'if',
    'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
    'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it', 'its', 'he',
    'she', 'they', 'them', '的', '了', '在', '是', '我', '有', '和',
    '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到',
    '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己',
  ]);

  const words = text
    .replace(/[^\w一-鿿]+/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w.toLowerCase()));

  // 去重
  return [...new Set(words)];
}

// ============================================================
// 回复去重 (Response Deduplication via N-gram Similarity)
// ============================================================

/** 相似度检测结果 */
export interface SimilarityResult {
  /** 与最相似回复的 Jaccard 相似度 (0-1) */
  maxSimilarity: number;
  /** 是否超过重复阈值 */
  isRepetitive: boolean;
  /** 相似回复的索引（在历史中） */
  similarIndex: number;
  /** 使用的 n-gram 大小 */
  ngramSize: number;
}

/**
 * 提取文本的 trigram 集合
 */
function extractTrigrams(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const trigrams = new Set<string>();
  for (let i = 0; i <= normalized.length - 3; i++) {
    trigrams.add(normalized.slice(i, i + 3));
  }
  return trigrams;
}

/**
 * 计算 Set 的 Jaccard 相似度
 */
function setJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const REPETITION_THRESHOLD = 0.35;

/**
 * 检测新回复是否与历史回复重复
 * 使用 trigram Jaccard 相似度比较
 */
export function detectResponseRepetition(
  newResponse: string,
  recentResponses: string[],
  threshold: number = REPETITION_THRESHOLD,
): SimilarityResult {
  if (recentResponses.length === 0) {
    return {
      maxSimilarity: 0,
      isRepetitive: false,
      similarIndex: -1,
      ngramSize: 3,
    };
  }

  const newTrigrams = extractTrigrams(newResponse);
  let maxSim = 0;
  let maxIdx = -1;

  for (let i = 0; i < recentResponses.length; i++) {
    const histTrigrams = extractTrigrams(recentResponses[i]!);
    const sim = setJaccard(newTrigrams, histTrigrams);
    if (sim > maxSim) {
      maxSim = sim;
      maxIdx = i;
    }
  }

  return {
    maxSimilarity: maxSim,
    isRepetitive: maxSim >= threshold,
    similarIndex: maxIdx,
    ngramSize: 3,
  };
}

// ============================================================
// 自适应回复长度控制 (Adaptive Response Length)
// ============================================================

/** 长度偏好信号 */
export type LengthSignal = 'wants-shorter' | 'wants-longer' | 'neutral';

/** 长度偏好追踪 */
export interface LengthPreference {
  /** 当前偏好分数 (0=concise, 1=detailed) */
  score: number;
  /** 最近 N 个信号 */
  recentSignals: LengthSignal[];
  /** 建议的最大回复长度（字符数） */
  suggestedMaxLength: number;
  /** 推荐的详细程度描述 */
  recommendation: string;
}

const MORE_PATTERNS = /(?:\b(tell me more|explain more|elaborate|go on|continue|expand|more detail|in detail)\b)|(详细|展开|继续|多说|深入|更多)/i;
const SHORT_PATTERNS = /(?:\b(too long|tldr|too verbose|brief|short|concise|summary|quick)\b)|(太长|简短|简洁|总结|精简)/i;
const SHORT_RESPONSE_THRESHOLD = 15; // 用户回复短于此值视为 "满意/不需要更多信息"

/**
 * 从用户输入中提取长度偏好信号
 */
export function detectLengthSignal(
  userInput: string,
  previousResponseLength: number,
): LengthSignal {
  const trimmed = userInput.trim();

  if (MORE_PATTERNS.test(trimmed)) return 'wants-longer';
  if (SHORT_PATTERNS.test(trimmed)) return 'wants-shorter';

  // 隐式信号：长回复后接极短回复（ok/thanks/好的）→ 可能太长了
  if (previousResponseLength > 500 && trimmed.length < SHORT_RESPONSE_THRESHOLD) {
    return 'wants-shorter';
  }

  // 隐式信号：短回复后接追问 → 可能不够详细
  if (previousResponseLength < 100 && trimmed.length >= 30 && /\?$/.test(trimmed)) {
    return 'wants-longer';
  }

  return 'neutral';
}

/**
 * 更新长度偏好追踪
 */
export function updateLengthPreference(
  current: LengthPreference,
  signal: LengthSignal,
): LengthPreference {
  const recentSignals = [...current.recentSignals, signal].slice(-10);
  const alpha = 0.15;

  let score = current.score;
  if (signal === 'wants-longer') score = Math.min(1, score + alpha);
  else if (signal === 'wants-shorter') score = Math.max(0, score - alpha);

  // 基于偏好分数计算建议长度
  const suggestedMaxLength = Math.round(300 + score * 1200); // 300-1500 chars

  let recommendation: string;
  if (score < 0.3) recommendation = 'Keep responses very concise (1-3 sentences). Use bullet points.';
  else if (score < 0.5) recommendation = 'Keep responses brief. Focus on key points.';
  else if (score < 0.7) recommendation = 'Moderate detail. Explain reasoning briefly.';
  else recommendation = 'Detailed responses welcome. Include examples and context.';

  return { score, recentSignals, suggestedMaxLength, recommendation };
}

/**
 * 创建默认长度偏好
 */
export function createDefaultLengthPreference(): LengthPreference {
  return {
    score: 0.5,
    recentSignals: [],
    suggestedMaxLength: 900,
    recommendation: 'Moderate detail. Explain reasoning briefly.',
  };
}

// ============================================================
// 上下文感知工具优先级 (Context-Aware Tool Prioritization)
// ============================================================

/** 工具优先级建议 */
export interface ToolPrioritySuggestion {
  /** 推荐优先使用的工具 */
  preferredTools: string[];
  /** 原因说明 */
  reason: string;
}

const FLOW_TOOL_MAP: Record<string, string[]> = {
  'question-answer': ['web_search', 'memory_recall'],
  'debug-diagnose-fix': ['code_search', 'file_read', 'shell_exec'],
  'explore-deepen-implement': ['web_search', 'memory_recall', 'code_search', 'file_write'],
  'request-review-iterate': ['file_read', 'code_search', 'shell_exec'],
  'learn-practice-master': ['web_search', 'memory_recall', 'file_write'],
  'plan-execute-verify': ['file_read', 'file_write', 'shell_exec'],
};

const PHASE_TOOL_MAP: Record<string, string[]> = {
  'deep-work': ['file_read', 'file_write', 'code_search', 'shell_exec'],
  'exploration': ['web_search', 'memory_recall', 'code_search'],
  'review': ['file_read', 'code_search', 'shell_exec'],
  'wrap-up': ['memory_recall', 'file_write'],
  'greeting': [],
  'idle': [],
};

/**
 * 根据对话流程和阶段生成工具优先级建议
 */
export function suggestToolPriority(
  flowPattern: string,
  phase: string,
  urgencyLevel: 'low' | 'normal' | 'high',
): ToolPrioritySuggestion {
  const flowTools = FLOW_TOOL_MAP[flowPattern] ?? [];
  const phaseTools = PHASE_TOOL_MAP[phase] ?? [];

  // 合并：流程工具优先，阶段工具补充
  const seen = new Set<string>();
  const preferredTools: string[] = [];
  for (const tool of [...flowTools, ...phaseTools]) {
    if (!seen.has(tool)) {
      seen.add(tool);
      preferredTools.push(tool);
    }
  }

  // 高紧急度 → 优先执行工具
  if (urgencyLevel === 'high') {
    const urgencyTools = ['shell_exec', 'file_write'];
    for (const t of urgencyTools.reverse()) {
      if (preferredTools.includes(t)) {
        preferredTools.splice(preferredTools.indexOf(t), 1);
        preferredTools.unshift(t);
      }
    }
  }

  // 生成原因说明
  const parts: string[] = [];
  if (flowTools.length > 0) parts.push(`${flowPattern} flow`);
  if (phaseTools.length > 0) parts.push(`${phase} phase`);
  if (urgencyLevel === 'high') parts.push('urgent deadline');

  return {
    preferredTools: preferredTools.slice(0, 5),
    reason: parts.length > 0 ? `Based on: ${parts.join(', ')}` : 'No specific context',
  };
}

// ============================================================
// 对话健康监测 (Conversation Health Monitoring)
// ============================================================

/** 对话健康状态 */
export interface ConversationHealth {
  /** 健康分数 (0=很差, 1=很好) */
  score: number;
  /** 是否卡住 */
  isStuck: boolean;
  /** 参与度趋势 */
  engagementTrend: 'improving' | 'stable' | 'declining';
  /** 挫折信号强度 */
  frustrationLevel: 'none' | 'low' | 'medium' | 'high';
  /** 诊断信息 */
  issues: string[];
  /** 建议 */
  recommendation: string;
}

const FRUSTRATION_WORDS = /(?:frustrated|annoyed|angry|useless|broken|doesn'?t work|waste|horrible|terrible|this is wrong|still not working|give up|烦|无语|垃圾|没用|不行|还是不行|算了|受不了)/i;
const NEGATIVE_PATTERNS = /(?:no|wrong|incorrect|bad|not right|不对|错误|不好|不对)/i;

/**
 * 监测对话健康状态
 */
export function monitorConversationHealth(
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  recentTopics: string[],
): ConversationHealth {
  const userMsgs = recentMessages.filter(m => m.role === 'user').slice(-10);
  const issues: string[] = [];

  // === 卡住检测：最近 5 轮话题相同且无进展 ===
  const isStuck = recentTopics.length >= 5 &&
    new Set(recentTopics.slice(-5)).size === 1;
  if (isStuck) issues.push('Stuck on same topic without progress');

  // === 参与度趋势：用户消息长度变化 ===
  let engagementTrend: 'improving' | 'stable' | 'declining' = 'stable';
  if (userMsgs.length >= 4) {
    const firstHalf = userMsgs.slice(0, Math.floor(userMsgs.length / 2));
    const secondHalf = userMsgs.slice(Math.floor(userMsgs.length / 2));
    const avgFirst = firstHalf.reduce((s, m) => s + m.content.length, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, m) => s + m.content.length, 0) / secondHalf.length;

    if (avgSecond < avgFirst * 0.5) {
      engagementTrend = 'declining';
      issues.push('User messages getting shorter — possible disengagement');
    } else if (avgSecond > avgFirst * 1.5) {
      engagementTrend = 'improving';
    }
  }

  // === 挫折信号检测 ===
  let frustrationCount = 0;
  for (const msg of userMsgs.slice(-5)) {
    if (FRUSTRATION_WORDS.test(msg.content)) frustrationCount += 2;
    else if (NEGATIVE_PATTERNS.test(msg.content)) frustrationCount += 1;
  }
  const frustrationLevel: 'none' | 'low' | 'medium' | 'high' =
    frustrationCount >= 4 ? 'high' :
    frustrationCount >= 2 ? 'medium' :
    frustrationCount >= 1 ? 'low' : 'none';
  if (frustrationLevel !== 'none') issues.push(`Frustration detected (${frustrationLevel})`);

  // === 重复提问检测 ===
  const recentQuestions = userMsgs.slice(-5).filter(m => /\?/.test(m.content));
  if (recentQuestions.length >= 3) {
    // 检查是否是相似问题
    const contents = recentQuestions.map(q => q.content.toLowerCase());
    const uniqueContents = new Set(contents);
    if (uniqueContents.size <= 2) {
      issues.push('User asking similar questions repeatedly');
    }
  }

  // === 综合健康分数 ===
  let score = 1.0;
  if (isStuck) score -= 0.3;
  if (engagementTrend === 'declining') score -= 0.2;
  if (frustrationLevel === 'high') score -= 0.4;
  else if (frustrationLevel === 'medium') score -= 0.2;
  else if (frustrationLevel === 'low') score -= 0.1;
  score = Math.max(0, Math.min(1, score));

  // === 建议 ===
  let recommendation: string;
  if (score >= 0.8) {
    recommendation = 'Conversation flowing well.';
  } else if (score >= 0.5) {
    recommendation = 'Consider changing approach or asking if the user needs something different.';
  } else {
    recommendation = 'Conversation struggling. Try: asking clarifying questions, switching topics, or offering to help differently.';
  }

  return { score, isStuck, engagementTrend, frustrationLevel, issues, recommendation };
}

/**
 * 自主行动类型
 */
export type AutonomousActionType =
  | 'memory_search'
  | 'web_search'
  | 'goal_check'
  | 'context_refresh'
  | 'clarification_ask'
  | 'summary_offer'
  | 'topic_switch_suggest';

export interface AutonomousAction {
  type: AutonomousActionType;
  reason: string;
  urgency: 'low' | 'medium' | 'high';
  query?: string;
}

/**
 * 基于对话上下文自主决定需要执行的下一步行动
 *
 * 整合 flow、phase、health、intents、ambiguity 等信号，
 * 生成建议的自主行动列表
 */
export function decideAutonomousActions(context: {
  flowPattern: string;
  phase: string;
  healthScore: number;
  intentCount: number;
  hasAmbiguity: boolean;
  topicTransition: boolean;
  turnCount: number;
  recentTopics: string[];
  hasActiveGoals: boolean;
}): AutonomousAction[] {
  const actions: AutonomousAction[] = [];

  // 1. 对话卡住 → 建议切换话题或询问澄清
  if (context.healthScore < 0.4) {
    actions.push({
      type: 'clarification_ask',
      reason: 'Conversation health is low — proactively ask what the user needs',
      urgency: 'high',
    });
  } else if (context.healthScore < 0.6) {
    actions.push({
      type: 'topic_switch_suggest',
      reason: 'Conversation may be stagnating — suggest a change of direction',
      urgency: 'medium',
    });
  }

  // 2. 长对话 → 提供总结
  if (context.turnCount > 15 && context.phase === 'deep-work') {
    actions.push({
      type: 'summary_offer',
      reason: 'Long deep-work session — offer to summarize progress',
      urgency: 'low',
    });
  }

  // 3. 多意图 → 建议内存搜索以支持上下文切换
  if (context.intentCount > 2) {
    actions.push({
      type: 'memory_search',
      reason: 'Multiple intents detected — search memory for relevant context',
      urgency: 'medium',
      query: context.recentTopics.join(' '),
    });
  }

  // 4. 话题切换 → 刷新上下文
  if (context.topicTransition && context.recentTopics.length > 1) {
    actions.push({
      type: 'context_refresh',
      reason: 'Topic shifted — refresh context for new topic',
      urgency: 'medium',
      query: context.recentTopics[context.recentTopics.length - 1],
    });
  }

  // 5. debug/探索流程 → 主动搜索
  if (
    (context.flowPattern === 'debug-diagnose-fix' || context.flowPattern === 'explore-deepen-implement') &&
    context.phase === 'deep-work'
  ) {
    const topic = context.recentTopics[context.recentTopics.length - 1] ?? '';
    if (topic) {
      actions.push({
        type: 'web_search',
        reason: `${context.flowPattern} flow in deep-work — proactively search for solutions`,
        urgency: 'medium',
        query: topic,
      });
    }
  }

  // 6. 活跃目标 → 定期检查进度
  if (context.hasActiveGoals && context.phase === 'idle') {
    actions.push({
      type: 'goal_check',
      reason: 'Active goals exist but user is idle — review goal progress',
      urgency: 'low',
    });
  }

  // 7. 模糊输入 → 搜索相关记忆辅助理解
  if (context.hasAmbiguity) {
    actions.push({
      type: 'memory_search',
      reason: 'Ambiguous input — search memory for disambiguation context',
      urgency: 'high',
      query: context.recentTopics.join(' '),
    });
  }

  // 按紧急度排序
  const urgencyOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  actions.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  // 最多返回 3 个行动
  return actions.slice(0, 3);
}

/**
 * 交互结果类型
 */
export type InteractionOutcome = 'success' | 'clarification_needed' | 'repeated_question' | 'topic_abandoned' | 'frustration' | 'unknown';

export interface OutcomeRecord {
  outcome: InteractionOutcome;
  confidence: number;
  reason: string;
  context: {
    flowPattern: string;
    phase: string;
    strategyUsed: string;
  };
}

/**
 * 基于用户对上一条回复的反应判断交互结果
 *
 * 通过分析用户下一条消息与上一条的关系来判断：
 * - success: 用户继续深入、表达满意、切换到新话题（说明问题已解决）
 * - clarification_needed: 用户追问细节、要求解释更多
 * - repeated_question: 用户换种方式问同样的问题（说明回复没解决）
 * - topic_abandoned: 用户完全切换话题（可能是对回复不满意）
 * - frustration: 用户表达不满
 */
export function classifyInteractionOutcome(
  assistantMessage: string,
  nextUserMessage: string,
  recentTopics: string[],
): OutcomeRecord {
  if (!assistantMessage || !nextUserMessage) {
    return { outcome: 'unknown', confidence: 0, reason: 'Missing messages', context: { flowPattern: '', phase: '', strategyUsed: '' } };
  }

  const userLower = nextUserMessage.toLowerCase();
  const assistantLower = assistantMessage.toLowerCase();

  // 1. Frustration detection
  const frustrationPatterns = /不对|错了|不是这样|doesn't work|that's wrong|no that's not|still broken|还是不行|没解决|废话|unhelpful|useless/i;
  if (frustrationPatterns.test(userLower)) {
    return { outcome: 'frustration', confidence: 0.85, reason: 'User expressed frustration with previous response', context: { flowPattern: '', phase: '', strategyUsed: '' } };
  }

  // 2. Repeated question — trigram Jaccard similarity
  const assistantTrigrams = extractTrigrams(assistantMessage);
  const userTrigrams = extractTrigrams(nextUserMessage);
  const overlap = setJaccard(assistantTrigrams, userTrigrams);

  // If user message is very similar to previous assistant, they might be repeating
  // But if user asks "what about X" that's follow-up, not repeat
  const isFollowUp = /what about|how about|还有|另外|also|and then|what if|能不能|还可以|继续/i.test(userLower);
  const isQuestion = /\?|？|怎么|如何|why|how|what|where|when/i.test(userLower);

  if (overlap > 0.4 && !isFollowUp && isQuestion) {
    return { outcome: 'repeated_question', confidence: Math.min(0.9, overlap), reason: `User repeated similar question (similarity: ${overlap.toFixed(2)})`, context: { flowPattern: '', phase: '', strategyUsed: '' } };
  }

  // 3. Clarification needed — user asks about something mentioned in assistant's reply
  const clarificationPatterns = /什么意思|explain|详细|more detail|详细说说|能不能解释|what do you mean|clarify|expand|展开/i;
  if (clarificationPatterns.test(userLower)) {
    return { outcome: 'clarification_needed', confidence: 0.8, reason: 'User asked for clarification on previous response', context: { flowPattern: '', phase: '', strategyUsed: '' } };
  }

  // 4. Success — user continues naturally (follow-up, new sub-question, satisfaction)
  const successPatterns = /thanks|谢谢|got it|明白了|perfect|好的|ok|great|nice|exactly|对|没错|correct|works|搞定|解决了|done|完美/i;
  if (successPatterns.test(userLower)) {
    return { outcome: 'success', confidence: 0.85, reason: 'User expressed satisfaction or acknowledgment', context: { flowPattern: '', phase: '', strategyUsed: '' } };
  }

  // 5. Topic abandoned — user switches to completely unrelated topic (after success check)
  if (recentTopics.length >= 2) {
    const currentTopic = recentTopics[recentTopics.length - 1];
    const prevTopic = recentTopics[recentTopics.length - 2];
    const topicPatterns = extractTrigrams(currentTopic);
    const prevPatterns = extractTrigrams(prevTopic);
    const topicSimilarity = setJaccard(topicPatterns, prevPatterns);

    if (topicSimilarity < 0.15 && !isFollowUp) {
      return { outcome: 'topic_abandoned', confidence: 0.7, reason: `User switched topic (similarity: ${topicSimilarity.toFixed(2)})`, context: { flowPattern: '', phase: '', strategyUsed: '' } };
    }
  }

  // Default: if user continues with a question on same topic, it's success (continuing the conversation)
  if (isQuestion && isFollowUp) {
    return { outcome: 'success', confidence: 0.6, reason: 'User continued with follow-up question', context: { flowPattern: '', phase: '', strategyUsed: '' } };
  }

  // Default: unknown
  return { outcome: 'unknown', confidence: 0.3, reason: 'Unable to classify interaction outcome', context: { flowPattern: '', phase: '', strategyUsed: '' } };
}

/**
 * 基于交互结果历史调整策略建议
 */
export interface StrategyAdjustment {
  dimension: 'detailVsConcise' | 'analyticalVsIntuitive' | 'proactiveVsReactive';
  direction: 'increase' | 'decrease';
  magnitude: number;
  reason: string;
}

export function suggestStrategyAdjustment(outcome: OutcomeRecord): StrategyAdjustment | null {
  switch (outcome.outcome) {
    case 'frustration':
      return { dimension: 'detailVsConcise', direction: 'increase', magnitude: 0.15, reason: 'User frustrated — provide more detailed, clearer responses' };
    case 'repeated_question':
      return { dimension: 'analyticalVsIntuitive', direction: 'increase', magnitude: 0.1, reason: 'Question repeated — try more analytical approach' };
    case 'clarification_needed':
      return { dimension: 'detailVsConcise', direction: 'increase', magnitude: 0.1, reason: 'User needed clarification — increase detail level' };
    case 'topic_abandoned':
      return { dimension: 'proactiveVsReactive', direction: 'increase', magnitude: 0.1, reason: 'Topic abandoned — be more proactive in engagement' };
    case 'success':
      return null; // No adjustment needed for success
    default:
      return null;
  }
}

/**
 * Prompt section 相关性评分 — 动态评估每个 section 对当前对话的价值
 */
export interface SectionScore {
  prefix: string;
  score: number;
  reason: string;
}

export function scoreSectionRelevance(
  sectionPrefix: string,
  context: {
    phase: string;
    flowPattern: string;
    healthScore: number;
    recentTopics: string[];
    hasActiveGoals: boolean;
    turnCount: number;
  },
): SectionScore {
  const baseScores: Record<string, number> = {
    'You have ': 0.2,
    'DREAM INSIGHTS': 0.3,
    'META-COGNITION': 0.35,
    'ATTENTION STATE': 0.4,
    'RESPONSE STRATEGY': 0.45,
    'PRELOADED CONTEXT': 0.5,
    'TOOL PERFORMANCE': 0.45,
    'TOOL FAILURE PATTERNS': 0.5,
    'LEARNED BEHAVIORS': 0.5,
    'TEMPORAL CONTEXT': 0.55,
    'CONVERSATION FLOW': 0.5,
    'LENGTH PREFERENCE': 0.4,
    'TOOL PRIORITY': 0.55,
    'CONVERSATION HEALTH': 0.6,
    'MULTI-INTENT': 0.65,
    'INPUT AMBIGUITY': 0.7,
    'GOAL DEPENDENCIES': 0.6,
    'TOPIC TRANSITION': 0.55,
    'SUGGESTED ACTIONS': 0.6,
  };

  let score = baseScores[sectionPrefix] ?? 0.5;
  const reason: string[] = [`base: ${score.toFixed(2)}`];

  if (context.phase === 'deep-work') {
    if (['TOOL PERFORMANCE', 'TOOL PRIORITY', 'TOOL FAILURE PATTERNS'].includes(sectionPrefix)) {
      score += 0.15;
      reason.push('deep-work boost (tools)');
    }
    if (['DREAM INSIGHTS', 'META-COGNITION', 'ATTENTION STATE'].includes(sectionPrefix)) {
      score -= 0.1;
      reason.push('deep-work penalty (distraction)');
    }
  }

  if (context.phase === 'exploration') {
    if (['LEARNED BEHAVIORS', 'TEMPORAL CONTEXT', 'CONVERSATION FLOW'].includes(sectionPrefix)) {
      score += 0.1;
      reason.push('exploration boost (context)');
    }
  }

  if (context.phase === 'idle') {
    if (['DREAM INSIGHTS', 'LEARNED BEHAVIORS', 'ATTENTION STATE'].includes(sectionPrefix)) {
      score += 0.1;
      reason.push('idle boost (background)');
    }
    if (['TOOL PERFORMANCE', 'TOOL PRIORITY', 'TOOL FAILURE PATTERNS'].includes(sectionPrefix)) {
      score -= 0.15;
      reason.push('idle penalty (tools)');
    }
  }

  if (context.healthScore < 0.5) {
    if (['CONVERSATION HEALTH', 'META-COGNITION', 'INPUT AMBIGUITY'].includes(sectionPrefix)) {
      score += 0.2;
      reason.push('low-health boost');
    }
  }

  if (context.flowPattern === 'debug-diagnose-fix') {
    if (['TOOL PERFORMANCE', 'TOOL FAILURE PATTERNS', 'TOOL PRIORITY', 'SUGGESTED ACTIONS'].includes(sectionPrefix)) {
      score += 0.1;
      reason.push('debug flow boost');
    }
  }

  if (context.hasActiveGoals) {
    if (['GOAL DEPENDENCIES', 'SUGGESTED ACTIONS'].includes(sectionPrefix)) {
      score += 0.1;
      reason.push('active-goals boost');
    }
  }

  score = Math.max(0, Math.min(1, score));

  return { prefix: sectionPrefix, score, reason: reason.join(', ') };
}
