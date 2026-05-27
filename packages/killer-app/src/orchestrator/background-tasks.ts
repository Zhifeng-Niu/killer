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
