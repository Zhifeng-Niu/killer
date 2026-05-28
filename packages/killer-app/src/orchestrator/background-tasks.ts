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
 * 根据对话流程、阶段、专长和行为模式生成工具优先级建议
 */
export function suggestToolPriority(
  flowPattern: string,
  phase: string,
  urgencyLevel: 'low' | 'normal' | 'high',
  expertiseDomains?: string[],
  behaviorMode?: string,
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

  // 专家用户 → 优先代码工具，减少 web_search
  if (expertiseDomains && expertiseDomains.length >= 2) {
    const codeTools = ['code_search', 'file_read', 'file_write', 'shell_exec'];
    for (const t of codeTools.reverse()) {
      if (preferredTools.includes(t)) {
        preferredTools.splice(preferredTools.indexOf(t), 1);
        preferredTools.unshift(t);
      }
    }
  }

  // 支持性行为模式 → 优先确定性工具
  if (behaviorMode === 'supportive' || behaviorMode === 'urgent') {
    const reliableTools = ['file_read', 'shell_exec'];
    for (const t of reliableTools.reverse()) {
      if (preferredTools.includes(t)) {
        preferredTools.splice(preferredTools.indexOf(t), 1);
        preferredTools.unshift(t);
      }
    }
  }

  // 探索模式 → 优先搜索工具
  if (behaviorMode === 'exploratory') {
    const searchTools = ['web_search', 'memory_recall', 'code_search'];
    for (const t of searchTools.reverse()) {
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
  if (expertiseDomains && expertiseDomains.length >= 2) parts.push('expert user');
  if (behaviorMode && behaviorMode !== 'balanced') parts.push(`${behaviorMode} mode`);

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
    behaviorMode?: 'focused' | 'exploratory' | 'supportive' | 'urgent' | 'balanced';
    learnedOffset?: number;
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
    'CONVERSATION RHYTHM': 0.5,
    'USER EXPERTISE': 0.55,
    'EMOTIONAL RESPONSE STRATEGY': 0.6,
    'PERCEPTION FUSION': 0.65,
    'RESTORED CONTEXT': 0.6,
    'STRATEGY COHERENCE': 0.7,
    'COGNITIVE STATE': 0.7,
    'COMPOSITE RESPONSE STRATEGY': 0.75,
    'INTENT EVOLUTION': 0.55,
    'STYLE GUIDANCE': 0.6,
    'KNOWLEDGE GRAPH': 0.5,
    'COGNITIVE FATIGUE': 0.65,
    'GAP RECOVERY': 0.7,
    'LEARNED LESSONS': 0.6,
    'RHYTHM ADAPTATION': 0.55,
    'INTENT DECOMPOSITION': 0.7,
    'SEMANTIC NETWORK': 0.6,
    'RESPONSE TIMING': 0.65,
    'CONVERSATION SUMMARY': 0.7,
    'SELF-CORRECTION': 0.75,
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

  // Behavior mode adjustments from perception fusion
  if (context.behaviorMode === 'urgent') {
    if (['EMOTIONAL RESPONSE STRATEGY', 'CONVERSATION HEALTH', 'PERCEPTION FUSION', 'INPUT AMBIGUITY'].includes(sectionPrefix)) {
      score += 0.2;
      reason.push('urgent mode boost (crisis signals)');
    }
    if (['DREAM INSIGHTS', 'LEARNED BEHAVIORS', 'TEMPORAL CONTEXT', 'CONVERSATION RHYTHM'].includes(sectionPrefix)) {
      score -= 0.15;
      reason.push('urgent mode penalty (distraction)');
    }
  }

  if (context.behaviorMode === 'supportive') {
    if (['EMOTIONAL RESPONSE STRATEGY', 'USER EXPERTISE', 'LENGTH PREFERENCE', 'CONVERSATION RHYTHM'].includes(sectionPrefix)) {
      score += 0.15;
      reason.push('supportive mode boost (empathy)');
    }
  }

  if (context.behaviorMode === 'focused') {
    if (['TOOL PERFORMANCE', 'TOOL PRIORITY', 'USER EXPERTISE', 'GOAL DEPENDENCIES'].includes(sectionPrefix)) {
      score += 0.15;
      reason.push('focused mode boost (precision)');
    }
    if (['DREAM INSIGHTS', 'META-COGNITION', 'ATTENTION STATE', 'CONVERSATION HEALTH'].includes(sectionPrefix)) {
      score -= 0.1;
      reason.push('focused mode penalty (meta)');
    }
  }

  if (context.behaviorMode === 'exploratory') {
    if (['CONVERSATION FLOW', 'TEMPORAL CONTEXT', 'LEARNED BEHAVIORS', 'INPUT AMBIGUITY', 'MULTI-INTENT'].includes(sectionPrefix)) {
      score += 0.1;
      reason.push('exploratory mode boost (discovery)');
    }
  }

  if (context.learnedOffset !== undefined && context.learnedOffset !== 0) {
    score += context.learnedOffset;
    reason.push(`learned: ${context.learnedOffset >= 0 ? '+' : ''}${context.learnedOffset.toFixed(3)}`);
  }

  score = Math.max(0, Math.min(1, score));

  return { prefix: sectionPrefix, score, reason: reason.join(', ') };
}

/**
 * 对话上下文快照 — 用于话题切换后的上下文恢复
 */
export interface TopicContextSnapshot {
  topic: string;
  keyPoints: string[];
  activeTools: string[];
  unsolvedQuestions: string[];
  timestamp: number;
  turnStart: number;
  turnEnd: number;
}

/**
 * 从对话历史中提取话题上下文快照
 *
 * 当检测到话题切换时，保存当前话题的关键信息，
 * 以便用户返回时能快速恢复工作上下文
 */
export function extractTopicSnapshot(
  messages: Array<{ role: string; content: string }>,
  topic: string,
  turnRange: { start: number; end: number },
): TopicContextSnapshot {
  const keyPoints: string[] = [];
  const activeTools: string[] = [];
  const unsolvedQuestions: string[] = [];

  const topicMessages = messages.slice(turnRange.start, turnRange.end);

  for (const msg of topicMessages) {
    const content = msg.content;

    // Extract key decisions/conclusions
    const decisionPatterns = /(?:决定|决定使用|we'll use|let's go with|I'll|选择了|conclusion|决定是|the answer is|the solution is|we decided)(.+)/gi;
    let match: RegExpExecArray | null;
    while ((match = decisionPatterns.exec(content)) !== null) {
      if (match[1]) keyPoints.push(match[1].trim().slice(0, 80));
    }

    // Extract tool usage
    const toolPatterns = /(?:using|used|running|execute|调用|使用了|运行了)(?:\s+)(\w+(?:tool|command|script|test|build|deploy|search)?)/gi;
    while ((match = toolPatterns.exec(content)) !== null) {
      if (match[1]) activeTools.push(match[1].trim());
    }

    // Extract unresolved questions
    if (msg.role === 'user') {
      const questionPatterns = /^(?:但是|but|however|still|还是|问题是|不对|not working|doesn't work|how do we|what about)(.+)/gim;
      while ((match = questionPatterns.exec(content)) !== null) {
        if (match[1]) unsolvedQuestions.push(match[1].trim().slice(0, 80));
      }
    }
  }

  return {
    topic,
    keyPoints: [...new Set(keyPoints)].slice(0, 5),
    activeTools: [...new Set(activeTools)].slice(0, 5),
    unsolvedQuestions: [...new Set(unsolvedQuestions)].slice(0, 5),
    timestamp: Date.now(),
    turnStart: turnRange.start,
    turnEnd: turnRange.end,
  };
}

/**
 * 格式化话题快照为可注入 prompt 的文本
 */
export function formatTopicSnapshot(snapshot: TopicContextSnapshot): string {
  const parts: string[] = [`Previous context on "${snapshot.topic}":`];
  if (snapshot.keyPoints.length > 0) {
    parts.push(`  Key points: ${snapshot.keyPoints.join('; ')}`);
  }
  if (snapshot.unsolvedQuestions.length > 0) {
    parts.push(`  Unresolved: ${snapshot.unsolvedQuestions.join('; ')}`);
  }
  if (snapshot.activeTools.length > 0) {
    parts.push(`  Tools used: ${snapshot.activeTools.join(', ')}`);
  }
  return parts.join('\n');
}

/**
 * 基于对话流程的实时意图预加载建议
 */
export interface IntentPreloadSuggestion {
  flowPattern: string;
  preloadType: 'error_patterns' | 'tool_docs' | 'memory_search' | 'goal_review' | 'code_context';
  query: string;
  reason: string;
}

const FLOW_PRELOAD_MAP: Record<string, Array<{ type: IntentPreloadSuggestion['preloadType']; queries: string[] }>> = {
  'debug-diagnose-fix': [
    { type: 'error_patterns', queries: ['error', 'failure', 'stack trace', 'bug'] },
    { type: 'memory_search', queries: ['debugging', 'previous fix', 'known issue'] },
  ],
  'explore-deepen-implement': [
    { type: 'memory_search', queries: ['architecture', 'design', 'pattern'] },
    { type: 'code_context', queries: ['implementation', 'code structure'] },
  ],
  'question-answer': [
    { type: 'memory_search', queries: ['previous discussion', 'learned'] },
  ],
  'request-execute-verify': [
    { type: 'tool_docs', queries: ['command', 'tool usage'] },
    { type: 'goal_review', queries: ['task', 'progress'] },
  ],
  'planning-delegate-review': [
    { type: 'goal_review', queries: ['goals', 'plans', 'milestones'] },
  ],
};

export function generateIntentPreloads(
  flowPattern: string,
  recentTopics: string[],
  hasActiveGoals: boolean,
): IntentPreloadSuggestion[] {
  const suggestions: IntentPreloadSuggestion[] = [];
  const mapping = FLOW_PRELOAD_MAP[flowPattern];
  if (!mapping) return suggestions;

  for (const entry of mapping) {
    const topicQuery = recentTopics.length > 0 ? recentTopics[recentTopics.length - 1] : '';
    const query = topicQuery ? `${entry.queries.join(' ')} ${topicQuery}` : entry.queries.join(' ');

    // Skip goal review if no active goals
    if (entry.type === 'goal_review' && !hasActiveGoals) continue;

    suggestions.push({
      flowPattern,
      preloadType: entry.type,
      query,
      reason: `${flowPattern} flow suggests ${entry.type} may be needed`,
    });
  }

  return suggestions.slice(0, 3);
}

/**
 * 对话节奏模式
 */
export type ConversationRhythm =
  | 'rapid_fire'    // 连续短消息，快速问答
  | 'thoughtful'    // 长消息，深思熟虑
  | 'mixed'         // 长短交替
  | 'idle'          // 长间隔，低频交互
  | 'initial';      // 交互不足，无法判断

export interface RhythmState {
  /** 当前检测到的节奏 */
  rhythm: ConversationRhythm;
  /** 置信度 0-1 */
  confidence: number;
  /** 建议的响应策略 */
  responseHint: string;
  /** 平均消息间隔（秒），无足够数据时 undefined */
  avgInterval?: number;
  /** 平均消息长度 */
  avgMessageLength: number;
}

interface MessageMeta {
  length: number;
  timestamp: number;
}

/**
 * 分析对话节奏
 *
 * 基于最近消息的长度和时间间隔检测交互节奏模式，
 * 输出响应策略建议以匹配用户的交互节奏。
 */
export function analyzeConversationRhythm(
  recentMessages: MessageMeta[],
): RhythmState {
  const DEFAULT: RhythmState = {
    rhythm: 'initial',
    confidence: 0,
    responseHint: 'Standard balanced response.',
    avgMessageLength: 0,
  };

  if (recentMessages.length < 3) return DEFAULT;

  const lengths = recentMessages.map(m => m.length);
  const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const shortCount = lengths.filter(l => l < 20).length;
  const shortRatio = shortCount / lengths.length;

  // 计算时间间隔
  const intervals: number[] = [];
  for (let i = 1; i < recentMessages.length; i++) {
    const gap = (recentMessages[i].timestamp - recentMessages[i - 1].timestamp) / 1000;
    if (gap > 0) intervals.push(gap);
  }
  const avgInterval = intervals.length > 0
    ? intervals.reduce((a, b) => a + b, 0) / intervals.length
    : undefined;

  // Rapid fire: 大量短消息 + 快速间隔
  if (shortRatio >= 0.7 && avgInterval !== undefined && avgInterval < 30) {
    return {
      rhythm: 'rapid_fire',
      confidence: Math.min(1, 0.5 + shortRatio * 0.3 + (1 - Math.min(avgInterval / 30, 1)) * 0.2),
      responseHint: 'User is in quick-fire mode. Respond very concisely (1-2 sentences max). Match their speed.',
      avgInterval,
      avgMessageLength: Math.round(avgLen),
    };
  }

  // Thoughtful: 长消息为主
  if (avgLen > 80 && shortRatio <= 0.2) {
    return {
      rhythm: 'thoughtful',
      confidence: Math.min(1, 0.5 + (avgLen / 300) * 0.3 + (1 - shortRatio) * 0.2),
      responseHint: 'User is sending detailed messages. Respond with thorough analysis and structured explanations.',
      avgInterval,
      avgMessageLength: Math.round(avgLen),
    };
  }

  // Idle: 长间隔
  if (avgInterval !== undefined && avgInterval > 300) {
    return {
      rhythm: 'idle',
      confidence: Math.min(1, 0.6 + (avgInterval / 3600) * 0.3),
      responseHint: 'Long gaps between messages. Acknowledge the return, provide context recap if needed.',
      avgInterval,
      avgMessageLength: Math.round(avgLen),
    };
  }

  // Mixed: 长短交替
  if (shortRatio >= 0.2 && shortRatio < 0.7) {
    return {
      rhythm: 'mixed',
      confidence: 0.5,
      responseHint: 'Mixed message lengths. Adapt response length to match each message\'s depth.',
      avgInterval,
      avgMessageLength: Math.round(avgLen),
    };
  }

  return {
    ...DEFAULT,
    avgMessageLength: Math.round(avgLen),
    avgInterval,
  };
}

/**
 * 用户知识专长领域
 */
export interface UserExpertiseDomain {
  /** 领域名称 */
  domain: string;
  /** 0-1 知识深度估算 */
  depth: number;
  /** 证据条数 */
  evidenceCount: number;
  /** 证据样本 */
  samples: string[];
}

/**
 * 用户知识画像
 */
export interface UserExpertiseProfile {
  /** 检测到的专长领域 */
  domains: UserExpertiseDomain[];
  /** 建议的术语深度 */
  terminologyHint: string;
  /** 建议的解释深度 */
  explanationHint: string;
}

/** 领域关键词映射 */
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  frontend: ['react', 'vue', 'angular', 'css', 'html', 'svelte', 'nextjs', 'tailwind', 'component', 'dom', 'browser', 'webpack', 'vite', '渲染', '组件'],
  backend: ['api', 'server', 'database', 'sql', 'rest', 'graphql', 'microservice', 'middleware', 'endpoint', '后端', '服务端', '接口'],
  devops: ['docker', 'kubernetes', 'ci/cd', 'deploy', 'aws', 'gcp', 'azure', 'terraform', 'nginx', '监控', '运维', '部署'],
  systems: ['rust', 'c++', 'kernel', 'memory', 'thread', 'process', 'syscall', 'assembly', '操作系统', '内核'],
  datascience: ['pandas', 'numpy', 'ml', 'model', 'training', 'neural', 'pytorch', 'tensorflow', 'jupyter', '机器学习', '训练'],
  security: ['auth', 'encrypt', 'vulnerability', 'xss', 'csrf', 'penetration', 'firewall', '安全', '加密', '漏洞'],
  mobile: ['ios', 'android', 'swift', 'kotlin', 'flutter', 'react native', 'mobile', 'app store', '移动端', '安卓'],
  testing: ['test', 'jest', 'vitest', 'cypress', 'playwright', 'coverage', 'unit test', 'e2e', '测试', '覆盖率'],
};

/**
 * 从对话历史中构建用户知识专长画像
 *
 * 分析用户消息中各领域的技术术语密度，推导出
 * 用户在哪些领域有深度知识，用于调整 agent 的
 * 术语选择和解释深度。
 */
export function buildUserExpertiseProfile(
  userMessages: string[],
): UserExpertiseProfile {
  if (userMessages.length === 0) {
    return { domains: [], terminologyHint: 'Use standard technical terms.', explanationHint: 'Provide clear explanations.' };
  }

  const domains: UserExpertiseDomain[] = [];
  const combined = userMessages.join(' ').toLowerCase();

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    let matchCount = 0;
    const samples: string[] = [];

    for (const keyword of keywords) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(keyword.length > 2 ? `\\b${escaped}\\b` : escaped, 'gi');
      const matches = combined.match(regex);
      if (matches && matches.length > 0) {
        matchCount += matches.length;
        if (samples.length < 3) {
          const contextIdx = combined.indexOf(keyword.toLowerCase());
          if (contextIdx >= 0) {
            const start = Math.max(0, contextIdx - 20);
            const end = Math.min(combined.length, contextIdx + keyword.length + 20);
            samples.push(`...${combined.slice(start, end)}...`);
          }
        }
      }
    }

    if (matchCount >= 2) {
      // 深度估算：基于匹配密度和消息数量
      const density = matchCount / userMessages.length;
      const depth = Math.min(1, 0.3 + density * 0.4 + Math.min(samples.length / 3, 0.3));

      domains.push({
        domain,
        depth,
        evidenceCount: matchCount,
        samples: samples.slice(0, 3),
      });
    }
  }

  // 按证据数排序
  domains.sort((a, b) => b.evidenceCount - a.evidenceCount);

  // 根据最深的领域生成建议
  const topDomain = domains[0];
  const totalEvidence = domains.reduce((sum, d) => sum + d.evidenceCount, 0);

  if (!topDomain || totalEvidence < 3) {
    return { domains, terminologyHint: 'Use standard technical terms.', explanationHint: 'Provide clear explanations.' };
  }

  const highDepthDomains = domains.filter(d => d.depth >= 0.6);
  const terminologyHint = highDepthDomains.length > 0
    ? `User appears knowledgeable in: ${highDepthDomains.map(d => d.domain).join(', ')}. Use domain-specific terminology freely.`
    : 'Use standard technical terms.';

  const explanationHint = highDepthDomains.length >= 2
    ? 'Deep technical explanations welcome. Skip basics for known domains.'
    : highDepthDomains.length === 1
      ? `Can use advanced terms in ${highDepthDomains[0].domain}. Explain other domains more.`
      : 'Provide clear explanations with context.';

  return { domains, terminologyHint, explanationHint };
}

/**
 * 情感-响应策略建议
 */
export interface EmotionalResponseStrategy {
  /** 情感驱动的语气建议 */
  toneHint: string;
  /** 情感驱动的响应长度建议 */
  lengthHint: string;
  /** 情感驱动的共情建议 */
  empathyAction: string;
}

/**
 * 将情感状态映射为响应策略
 *
 * 基于 valence（效价）和 arousal（唤醒度）二维空间，
 * 推导 agent 应采用的语气、长度和共情行为。
 * 高唤醒+负效价 → 耐心详细；高唤醒+正效价 → 简洁积极；
 * 低唤醒 → 平衡温和。
 */
export function mapEmotionToResponseStrategy(context: {
  valence: number;
  arousal: number;
  intensity: number;
  primaryEmotion: string;
}): EmotionalResponseStrategy {
  const { valence, arousal, intensity } = context;

  // 高强度负效价 → 用户可能挫败/焦虑
  if (valence < -0.3 && intensity > 0.4) {
    return {
      toneHint: 'Patient, reassuring, and supportive.',
      lengthHint: 'Provide thorough step-by-step explanations. Avoid jargon unless user expertise suggests otherwise.',
      empathyAction: 'Acknowledge the difficulty before proposing solutions. Validate their frustration.',
    };
  }

  // 高唤醒+正效价 → 用户兴奋/高兴
  if (valence > 0.3 && arousal > 0.3 && intensity > 0.4) {
    return {
      toneHint: 'Enthusiastic and energetic. Match their positive energy.',
      lengthHint: 'Keep it concise and action-oriented. They want to move fast.',
      empathyAction: 'Celebrate the positive moment briefly, then focus on next steps.',
    };
  }

  // 高唤醒+低效价 → 用户愤怒/急躁
  if (arousal > 0.5 && valence < 0.1 && intensity > 0.3) {
    return {
      toneHint: 'Calm, professional, and solution-focused.',
      lengthHint: 'Be direct and actionable. Minimize pleasantries, maximize solutions.',
      empathyAction: 'Address the urgency directly. "Let me help you fix this right away."',
    };
  }

  // 低唤醒+负效价 → 用户低落/疲惫
  if (arousal < -0.1 && valence < -0.2 && intensity > 0.3) {
    return {
      toneHint: 'Warm, gentle, and encouraging.',
      lengthHint: 'Offer concise, clear guidance. Do not overwhelm with details.',
      empathyAction: 'Show care. Offer to handle more of the cognitive load.',
    };
  }

  // 低唤醒 → 平静状态
  if (arousal < 0.1) {
    return {
      toneHint: 'Balanced and thoughtful.',
      lengthHint: 'Moderate detail. Match the calm pace.',
      empathyAction: 'Be present and reliable. No special action needed.',
    };
  }

  // 默认
  return {
    toneHint: 'Natural and responsive.',
    lengthHint: 'Adapt to the context and question.',
    empathyAction: 'Be attentive to emotional cues.',
  };
}

/**
 * 综合感知状态向量
 */
export interface PerceptionVector {
  /** 流模式置信度 0-1 */
  flowConfidence: number;
  /** 对话阶段置信度 0-1 */
  phaseConfidence: number;
  /** 节奏置信度 0-1 */
  rhythmConfidence: number;
  /** 情感强度 0-1 */
  emotionalIntensity: number;
  /** 情感效价 -1 到 1 */
  emotionalValence: number;
  /** 对话健康度 0-1 */
  conversationHealth: number;
  /** 专长领域数 */
  expertiseDomainCount: number;
  /** 综合优先级 — 高值表示需要更多关注 */
  overallAttention: number;
  /** 推荐的 agent 行为模式 */
  behaviorMode: 'focused' | 'exploratory' | 'supportive' | 'urgent' | 'balanced';
  /** 融合建议 */
  fusedHint: string;
}

/**
 * 融合所有感知信号为综合状态向量
 *
 * 将 flow、phase、rhythm、emotion、expertise、health 六个维度
 * 融合为一个向量，推导出 agent 的行为模式和优先级。
 */
export function fusePerceptionSignals(context: {
  flowConfidence: number;
  phaseConfidence: number;
  rhythmConfidence: number;
  emotionalIntensity: number;
  emotionalValence: number;
  conversationHealth: number;
  expertiseDomainCount: number;
}): PerceptionVector {
  const {
    flowConfidence,
    phaseConfidence,
    rhythmConfidence,
    emotionalIntensity,
    emotionalValence,
    conversationHealth,
    expertiseDomainCount,
  } = context;

  // 综合注意力：低健康 + 高情感 + 高置信度 → 高注意力
  const signalStrength = (flowConfidence + phaseConfidence + rhythmConfidence) / 3;
  const healthPressure = 1 - conversationHealth;
  const emotionalPressure = emotionalIntensity;
  const overallAttention = Math.min(1,
    0.3 * signalStrength + 0.35 * healthPressure + 0.35 * emotionalPressure,
  );

  // 行为模式推导
  let behaviorMode: PerceptionVector['behaviorMode'];
  let fusedHint: string;

  if (healthPressure > 0.6 && emotionalPressure > 0.5) {
    behaviorMode = 'urgent';
    fusedHint = 'User is frustrated and conversation is stuck. Prioritize fixing the immediate issue. Be direct and empathetic.';
  } else if (emotionalIntensity > 0.4 && emotionalValence < -0.3) {
    behaviorMode = 'supportive';
    fusedHint = 'User shows negative emotion. Be patient, thorough, and reassuring. Prioritize clarity over speed.';
  } else if (signalStrength > 0.7 && expertiseDomainCount >= 2) {
    behaviorMode = 'focused';
    fusedHint = 'High-confidence context with knowledgeable user. Be precise, technical, and efficient. Skip basics.';
  } else if (flowConfidence < 0.3 && phaseConfidence < 0.3) {
    behaviorMode = 'exploratory';
    fusedHint = 'Uncertain context. Ask clarifying questions, explore the problem space before committing to a direction.';
  } else {
    behaviorMode = 'balanced';
    fusedHint = 'Normal interaction. Balance detail with brevity, respond to the specific question.';
  }

  return {
    flowConfidence,
    phaseConfidence,
    rhythmConfidence,
    emotionalIntensity,
    emotionalValence,
    conversationHealth,
    expertiseDomainCount,
    overallAttention,
    behaviorMode,
    fusedHint,
  };
}

/**
 * 策略冲突类型
 */
export type StrategyConflict =
  | 'length_vs_empathy'   // 节奏要求简洁但情感要求详细
  | 'speed_vs_precision'  // 快速模式但需要精确
  | 'expertise_vs_empathy'; // 专家级术语但需要共情

export interface StrategyCoherence {
  /** 是否一致 */
  coherent: boolean;
  /** 检测到的冲突 */
  conflicts: StrategyConflict[];
  /** 调解建议 */
  resolution: string;
}

/**
 * 验证多个策略建议的一致性
 *
 * 当 rhythm、expertise、emotion、perception fusion 给出
 * 矛盾建议时，检测冲突并提供调解方案。
 */
export function verifyStrategyCoherence(context: {
  rhythmHint?: string;
  expertiseHint?: string;
  emotionalHint?: string;
  behaviorMode?: string;
}): StrategyCoherence {
  const conflicts: StrategyConflict[] = [];
  const resolutions: string[] = [];

  const wantsConcise = context.rhythmHint?.includes('concise') ?? false;
  const wantsThorough = context.emotionalHint?.includes('thorough') || context.emotionalHint?.includes('step-by-step');
  const isExpert = context.expertiseHint?.includes('freely') ?? false;
  const isSupportive = context.behaviorMode === 'supportive';

  if (wantsConcise && wantsThorough) {
    conflicts.push('length_vs_empathy');
    resolutions.push('Prioritize empathy: be thorough but use structured format (numbered steps) to maintain clarity.');
  }

  if (context.behaviorMode === 'urgent' && isExpert) {
    conflicts.push('speed_vs_precision');
    resolutions.push('Be precise but skip explanations — expert user needs accuracy, not hand-holding.');
  }

  if (isExpert && isSupportive) {
    conflicts.push('expertise_vs_empathy');
    resolutions.push('Use technical terms but show care through tone — "Here\'s the precise fix" rather than oversimplifying.');
  }

  return {
    coherent: conflicts.length === 0,
    conflicts,
    resolution: resolutions.length > 0 ? resolutions.join(' ') : 'All strategies are aligned.',
  };
}

/**
 * 认知模块调优参数
 */
export interface CognitiveTuningParams {
  /** 情感触发灵敏度阈值 (0-1, default 0.2) */
  emotionThreshold: number;
  /** 节奏检测置信度阈值 (0-1, default 0.4) */
  rhythmThreshold: number;
  /** 专长检测最小证据数 (default 2) */
  expertiseMinEvidence: number;
  /** 健康度告警阈值 (0-1, default 0.5) */
  healthAlertThreshold: number;
  /** 感知融合注意力阈值 (0-1, default 0.3) */
  fusionAttentionThreshold: number;
}

/** 默认参数 */
export const DEFAULT_COGNITIVE_TUNING: CognitiveTuningParams = {
  emotionThreshold: 0.2,
  rhythmThreshold: 0.4,
  expertiseMinEvidence: 2,
  healthAlertThreshold: 0.5,
  fusionAttentionThreshold: 0.3,
};

/**
 * 模块触发统计
 */
interface ModuleStats {
  /** 总触发次数 */
  triggers: number;
  /** 导致冲突的次数 */
  conflicts: number;
  /** 上次调整时间 */
  lastAdjustment: number;
}

/**
 * 认知参数自适应调节器
 *
 * 根据各模块的触发频率和冲突率，自动微调灵敏度。
 * 高冲突率 → 降低灵敏度；低触发率 → 提高灵敏度。
 * 使用缓慢的指数移动平均避免过度调整。
 */
export function adaptCognitiveParams(
  current: CognitiveTuningParams,
  moduleStats: Record<string, ModuleStats>,
): CognitiveTuningParams {
  const alpha = 0.05; // 缓慢调整率
  const result = { ...current };

  // 情感模块：高冲突率 → 提高阈值（降低灵敏度）
  const emotionStats = moduleStats['emotion'];
  if (emotionStats && emotionStats.triggers >= 10) {
    const conflictRate = emotionStats.conflicts / emotionStats.triggers;
    if (conflictRate > 0.3) {
      result.emotionThreshold = Math.min(0.5, current.emotionThreshold + alpha);
    } else if (conflictRate < 0.05) {
      result.emotionThreshold = Math.max(0.1, current.emotionThreshold - alpha);
    }
  }

  // 节奏模块
  const rhythmStats = moduleStats['rhythm'];
  if (rhythmStats && rhythmStats.triggers >= 10) {
    const conflictRate = rhythmStats.conflicts / rhythmStats.triggers;
    if (conflictRate > 0.3) {
      result.rhythmThreshold = Math.min(0.7, current.rhythmThreshold + alpha);
    } else if (conflictRate < 0.05) {
      result.rhythmThreshold = Math.max(0.2, current.rhythmThreshold - alpha);
    }
  }

  // 健康告警
  const healthStats = moduleStats['health'];
  if (healthStats && healthStats.triggers >= 5) {
    const alertRate = healthStats.triggers > 0 ? 1 - (healthStats.conflicts / healthStats.triggers) : 0.5;
    if (alertRate < 0.2) {
      result.healthAlertThreshold = Math.min(0.7, current.healthAlertThreshold + alpha);
    }
  }

  return result;
}

/**
 * Section 去重结果
 */
export interface DeduplicationResult {
  /** 去重后的 section 标签名（第一个保留的） */
  keptSection: string;
  /** 被合并的 section 标签名 */
  mergedSections: string[];
  /** 合并后的内容 */
  mergedContent: string;
}

/**
 * 检测并合并内容重叠的 prompt sections
 *
 * 使用 trigram Jaccard 相似度检测不同 section 之间的内容重叠。
 * 阈值 0.3 以上视为重复，合并为单一 section。
 */
export function deduplicateSections(
  sections: Array<{ label: string; content: string }>,
  threshold = 0.3,
): Array<{ label: string; content: string }> {
  if (sections.length < 2) return sections;

  const results: Array<{ label: string; content: string }> = [];
  const merged = new Set<number>();

  for (let i = 0; i < sections.length; i++) {
    if (merged.has(i)) continue;

    let combinedLabel = sections[i].label;
    let combinedContent = sections[i].content;
    const mergedLabels: string[] = [];

    for (let j = i + 1; j < sections.length; j++) {
      if (merged.has(j)) continue;

      const similarity = trigramJaccard(combinedContent, sections[j].content);
      if (similarity > threshold) {
        mergedLabels.push(sections[j].label);
        // 保留更长的内容（通常更详细）
        if (sections[j].content.length > combinedContent.length) {
          combinedContent = sections[j].content;
        }
        merged.add(j);
      }
    }

    if (mergedLabels.length > 0) {
      combinedLabel = `${combinedLabel} + ${mergedLabels.join(' + ')}`;
    }

    results.push({ label: combinedLabel, content: combinedContent });
  }

  return results;
}

/**
 * Trigram Jaccard 相似度
 */
function trigramJaccard(a: string, b: string): number {
  const trigramsA = buildTrigramSet(a.toLowerCase());
  const trigramsB = buildTrigramSet(b.toLowerCase());
  if (trigramsA.size === 0 && trigramsB.size === 0) return 0;
  let intersection = 0;
  for (const t of trigramsA) {
    if (trigramsB.has(t)) intersection++;
  }
  const union = trigramsA.size + trigramsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function buildTrigramSet(text: string): Set<string> {
  const set = new Set<string>();
  const normalized = ` ${text} `;
  for (let i = 0; i <= normalized.length - 3; i++) {
    set.add(normalized.slice(i, i + 3));
  }
  return set;
}

/**
 * 认知状态总览
 */
export interface CognitiveStateSummary {
  /** 活跃模块列表 */
  activeModules: string[];
  /** 综合行为模式 */
  behaviorMode: string;
  /** 关键指标 */
  metrics: Record<string, string>;
  /** 一行总览 */
  oneLiner: string;
}

/**
 * 生成认知状态总览
 *
 * 汇总所有活跃认知模块的状态，生成简洁的 COGNITIVE STATE
 * 总览供 LLM 理解当前系统状态。
 */
export function generateCognitiveStateSummary(context: {
  phase?: string;
  phaseConfidence?: number;
  flowPattern?: string;
  flowConfidence?: number;
  rhythm?: string;
  rhythmConfidence?: number;
  emotionalIntensity?: number;
  emotionalValence?: number;
  healthScore?: number;
  expertiseDomains?: string[];
  behaviorMode?: string;
  overallAttention?: number;
  hasActiveGoals?: boolean;
  topicCount?: number;
  lastQualityOverall?: number;
  lastQualityTags?: string[];
}): CognitiveStateSummary {
  const activeModules: string[] = [];
  const metrics: Record<string, string> = {};

  if (context.phase && context.phaseConfidence && context.phaseConfidence > 0.3) {
    activeModules.push(`phase:${context.phase}`);
    metrics['phase'] = `${context.phase} (${(context.phaseConfidence * 100).toFixed(0)}%)`;
  }

  if (context.flowPattern && context.flowConfidence && context.flowConfidence > 0.3) {
    activeModules.push(`flow:${context.flowPattern}`);
  }

  if (context.rhythm && context.rhythmConfidence && context.rhythmConfidence > 0.3) {
    activeModules.push(`rhythm:${context.rhythm}`);
  }

  if (context.emotionalIntensity && context.emotionalIntensity > 0.2) {
    activeModules.push('emotion');
    const mood = (context.emotionalValence ?? 0) > 0.1 ? 'positive' : (context.emotionalValence ?? 0) < -0.1 ? 'negative' : 'neutral';
    metrics['emotion'] = `${mood} (${(context.emotionalIntensity * 100).toFixed(0)}%)`;
  }

  if (context.healthScore !== undefined && context.healthScore < 0.8) {
    activeModules.push('health-monitor');
    metrics['health'] = `${(context.healthScore * 100).toFixed(0)}%`;
  }

  if (context.expertiseDomains && context.expertiseDomains.length > 0) {
    activeModules.push(`expertise:${context.expertiseDomains.slice(0, 3).join(',')}`);
  }

  if (context.hasActiveGoals) {
    activeModules.push('goals');
  }

  if (context.topicCount && context.topicCount > 1) {
    metrics['topics'] = `${context.topicCount}`;
  }

  if (context.lastQualityOverall !== undefined) {
    activeModules.push('self-assessment');
    metrics['quality'] = `${(context.lastQualityOverall * 100).toFixed(0)}%`;
    if (context.lastQualityTags && context.lastQualityTags.length > 0) {
      metrics['quality_tags'] = context.lastQualityTags.slice(0, 3).join(',');
    }
  }

  if (context.overallAttention !== undefined) {
    metrics['attention'] = `${(context.overallAttention * 100).toFixed(0)}%`;
  }

  const behaviorMode = context.behaviorMode ?? 'balanced';
  const oneLiner = activeModules.length > 0
    ? `Mode: ${behaviorMode} | Active: ${activeModules.join(', ')}`
    : `Mode: ${behaviorMode} | Standard operation`;

  return { activeModules, behaviorMode, metrics, oneLiner };
}

/**
 * 综合回复策略指导
 *
 * 基于 flow/phase/rhythm/emotion/expertise/behaviorMode/quality
 * 生成具体的回复策略指导（tone、structure、detail_level）。
 */
export interface ResponseStrategyGuidance {
  /** 语气指导 */
  tone: string;
  /** 结构建议 */
  structure: string;
  /** 细节级别 */
  detailLevel: string;
  /** 优先行动 */
  priorityAction: string;
  /** 格式化输出 */
  formatted: string;
}

export function generateResponseStrategyGuidance(context: {
  flowPattern?: string;
  phase?: string;
  rhythm?: string;
  emotionalStrategy?: string;
  behaviorMode?: string;
  expertiseHint?: string;
  lastQualityOverall?: number;
  lastQualityTags?: string[];
  healthScore?: number;
  interactionGapSeconds?: number;
}): ResponseStrategyGuidance | null {
  const signals: string[] = [];

  // 基于行为模式
  let tone = 'balanced and helpful';
  let structure = 'natural conversation';
  let detailLevel = 'moderate';
  let priorityAction = 'address the user\'s request';

  const mode = context.behaviorMode ?? 'balanced';

  if (mode === 'urgent') {
    tone = 'calm and focused';
    structure = 'numbered steps, skip preamble';
    detailLevel = 'essential only';
    priorityAction = 'resolve the immediate issue';
    signals.push('urgent-mode');
  } else if (mode === 'supportive') {
    tone = 'warm and patient';
    structure = 'acknowledge feelings, then solution';
    detailLevel = 'thorough with empathy';
    priorityAction = 'show understanding, then help';
    signals.push('supportive-mode');
  } else if (mode === 'focused') {
    tone = 'precise and efficient';
    structure = 'direct answer first, details after';
    detailLevel = 'technical depth';
    priorityAction = 'deliver the exact answer';
    signals.push('focused-mode');
  } else if (mode === 'exploratory') {
    tone = 'curious and collaborative';
    structure = 'offer options, discuss tradeoffs';
    detailLevel = 'broad coverage';
    priorityAction = 'explore possibilities together';
    signals.push('exploratory-mode');
  }

  // 基于对话流
  if (context.flowPattern === 'debug-diagnose-fix') {
    structure = 'systematic: symptom → diagnosis → fix → verify';
    priorityAction = 'follow the debug workflow';
    signals.push('debug-flow');
  } else if (context.flowPattern === 'explore-deepen-implement') {
    structure = 'layered: concept → example → implementation';
    signals.push('explore-flow');
  }

  // 基于质量反馈
  if (context.lastQualityOverall !== undefined && context.lastQualityOverall < 0.4) {
    tone = 'more direct, avoid repetition';
    signals.push('quality-correction');
    if (context.lastQualityTags?.includes('verbose')) {
      detailLevel = 'concise, use bullet points';
    }
    if (context.lastQualityTags?.includes('off-topic')) {
      priorityAction = 'stay focused on the user\'s actual question';
    }
  }

  // 基于情感策略
  if (context.emotionalStrategy) {
    if (context.emotionalStrategy.includes('step-by-step')) {
      structure = 'numbered steps with clear transitions';
    }
    if (context.emotionalStrategy.includes('concise')) {
      detailLevel = 'brief, action-oriented';
    }
  }

  // 基于专长
  if (context.expertiseHint?.includes('freely')) {
    detailLevel = 'technical, skip basics';
    tone = 'peer-to-peer';
  } else if (context.expertiseHint?.includes('explain')) {
    detailLevel = 'include context and examples';
  }

  // 基于健康度
  if (context.healthScore !== undefined && context.healthScore < 0.5) {
    priorityAction = 'check if user needs a different approach';
    tone = 'adaptive, try a new angle';
    signals.push('low-health');
  }

  // 基于交互间隔
  if (context.interactionGapSeconds !== undefined) {
    if (context.interactionGapSeconds < 30) {
      detailLevel = 'minimal, just the answer';
      structure = 'single-line or bullet points';
      signals.push('rapid-fire');
    } else if (context.interactionGapSeconds > 300) {
      priorityAction = 'briefly recap context, then address the new input';
      structure = 'recap → new response';
      signals.push('return-after-gap');
    }
  }

  if (signals.length === 0) return null;

  const tag = signals.length > 0 ? ` [${signals.join(', ')}]` : '';
  const formatted = `Tone: ${tone} | Structure: ${structure} | Detail: ${detailLevel} | Priority: ${priorityAction}${tag}`;
  return { tone, structure, detailLevel, priorityAction, formatted };
}

// ============================================================
// Adaptive Section Weight Learning
// ============================================================

/** 每个 prompt section 的学习权重 */
export interface SectionWeights {
  /** section prefix → EMA-adjusted weight offset (-0.15 ~ +0.15) */
  offsets: Record<string, number>;
  /** 最近一次 prompt 中活跃的 section prefixes */
  lastActiveSections: string[];
  /** 更新次数 */
  updates: number;
}

const WEIGHT_ALPHA = 0.1;
const WEIGHT_CLAMP = 0.15;

export function createDefaultSectionWeights(): SectionWeights {
  return { offsets: {}, lastActiveSections: [], updates: 0 };
}

/** 记录当前 prompt 中活跃的 sections（在 prompt build 后调用） */
export function recordActiveSections(
  weights: SectionWeights,
  activeSections: string[],
): SectionWeights {
  return {
    ...weights,
    lastActiveSections: activeSections,
    updates: weights.updates,
  };
}

/** 基于回复质量反馈更新 section 权重 */
export function updateSectionWeights(
  weights: SectionWeights,
  qualityOverall: number,
): SectionWeights {
  const newOffsets = { ...weights.offsets };
  const active = weights.lastActiveSections;

  // quality > 0.6 → 正反馈，增强活跃 section
  // quality < 0.4 → 负反馈，减弱活跃 section
  const delta = qualityOverall > 0.6
    ? (qualityOverall - 0.6) * 0.05
    : qualityOverall < 0.4
      ? (qualityOverall - 0.4) * 0.05
      : 0;

  if (delta === 0) return weights;

  for (const section of active) {
    const current = newOffsets[section] ?? 0;
    newOffsets[section] = Math.max(
      -WEIGHT_CLAMP,
      Math.min(WEIGHT_CLAMP, current + WEIGHT_ALPHA * (delta - current)),
    );
  }

  return {
    offsets: newOffsets,
    lastActiveSections: [],
    updates: weights.updates + 1,
  };
}

/** 获取 section 的学习权重偏移 */
export function getSectionWeightOffset(
  weights: SectionWeights,
  sectionPrefix: string,
): number {
  return weights.offsets[sectionPrefix] ?? 0;
}

/** 导出权重用于持久化 */
export function exportSectionWeights(weights: SectionWeights): Record<string, number> {
  return { ...weights.offsets };
}

/** 从持久化数据恢复权重 */
export function importSectionWeights(data: Record<string, number>): SectionWeights {
  const offsets: Record<string, number> = {};
  for (const [k, v] of Object.entries(data)) {
    offsets[k] = Math.max(-WEIGHT_CLAMP, Math.min(WEIGHT_CLAMP, v));
  }
  return { offsets, lastActiveSections: [], updates: 0 };
}

// ============================================================
// Intent Evolution Tracker — 跨轮次意图演变追踪
// ============================================================

export interface IntentNode {
  /** 意图摘要（从 detectMultiIntent 或关键词提取） */
  summary: string;
  /** 对话轮次索引 */
  turnIndex: number;
  /** 时间戳 */
  timestamp: number;
  /** 意图类别 */
  category: IntentCategory;
}

export type IntentCategory =
  | 'question'      // 提问
  | 'debug'         // 调试
  | 'feature'       // 功能请求
  | 'refactor'      // 重构
  | 'learn'         // 学习/探索
  | 'config'        // 配置/设置
  | 'review'        // 审查/检查
  | 'deploy'        // 部署/发布
  | 'general';      // 通用

export interface IntentTransition {
  from: IntentCategory;
  to: IntentCategory;
  type: 'gradual' | 'pivot' | 'return' | 'deepen';
  description: string;
}

export interface IntentEvolution {
  transitions: IntentTransition[];
  dominantCategory: IntentCategory;
  activeChains: string[];
}

const CATEGORY_KEYWORDS: Record<IntentCategory, string[]> = {
  question: ['怎么', '如何', '为什么', 'what', 'how', 'why', '？', '?'],
  debug: ['错误', 'bug', '报错', '失败', 'error', 'fail', 'crash', 'debug', '修复', 'fix', '异常'],
  feature: ['添加', '增加', '实现', '新增', 'add', 'implement', 'create', 'build', '开发', '功能'],
  refactor: ['重构', '优化', '改进', 'refactor', 'optimize', 'improve', 'clean', '重写', 'rewrite'],
  learn: ['了解', '学习', '解释', 'explain', 'learn', 'understand', '什么是', 'tell me about', '介绍一下'],
  config: ['配置', '设置', 'install', 'setup', 'config', 'configure', '环境', '初始化', 'init'],
  review: ['检查', '审查', 'review', 'check', 'verify', '测试', 'test', '验证'],
  deploy: ['部署', '发布', 'deploy', 'publish', 'release', '上线', 'ship', 'push'],
  general: [],
};

export function classifyIntent(message: string): IntentCategory {
  const lower = message.toLowerCase();
  let best: IntentCategory = 'general';
  let bestScore = 0;
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (cat === 'general') continue;
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = cat as IntentCategory;
    }
  }
  return best;
}

export function extractIntentSummary(message: string): string {
  // 取前 60 字符作为意图摘要，去除命令前缀
  const cleaned = message.replace(/^\/\w+\s*/, '').trim();
  return cleaned.length > 60 ? cleaned.slice(0, 57) + '...' : cleaned;
}

export function trackIntentEvolution(
  history: IntentNode[],
  windowSize: number = 10,
): IntentEvolution {
  const recent = history.slice(-windowSize);
  if (recent.length < 2) {
    return {
      transitions: [],
      dominantCategory: recent[0]?.category ?? 'general',
      activeChains: [],
    };
  }

  const transitions: IntentTransition[] = [];
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1];
    const curr = recent[i];
    if (prev.category === curr.category) continue;

    // 检测意图转变类型
    const gap = curr.turnIndex - prev.turnIndex;
    let type: IntentTransition['type'];
    let description: string;

    if (gap <= 1) {
      // 相邻轮次
      // 检查是否回归到更早的意图
      const earlierCategory = recent.slice(0, i - 1).find(n => n.category === curr.category);
      if (earlierCategory) {
        type = 'return';
        description = `意图回归: ${curr.category}（之前在 turn ${earlierCategory.turnIndex}）`;
      } else if (isRelatedCategory(prev.category, curr.category)) {
        type = 'gradual';
        description = `意图渐变: ${prev.category} → ${curr.category}`;
      } else {
        type = 'pivot';
        description = `意图突变: ${prev.category} → ${curr.category}`;
      }
    } else {
      type = 'gradual';
      description = `意图渐变: ${prev.category} → ${curr.category}（间隔 ${gap} 轮）`;
    }

    transitions.push({ from: prev.category, to: curr.category, type, description });
  }

  // 统计主导意图
  const catCounts: Record<string, number> = {};
  for (const n of recent) {
    catCounts[n.category] = (catCounts[n.category] ?? 0) + 1;
  }
  const dominantCategory = (Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'general') as IntentCategory;

  // 提取活跃意图链（连续相同类别的意图序列）
  const activeChains: string[] = [];
  let chainStart = 0;
  for (let i = 1; i <= recent.length; i++) {
    if (i === recent.length || recent[i].category !== recent[chainStart].category) {
      if (i - chainStart >= 2) {
        activeChains.push(`${recent[chainStart].category}×${i - chainStart}`);
      }
      chainStart = i;
    }
  }

  return { transitions, dominantCategory, activeChains };
}

function isRelatedCategory(a: IntentCategory, b: IntentCategory): boolean {
  const groups: IntentCategory[][] = [
    ['debug', 'question'],
    ['feature', 'refactor'],
    ['config', 'deploy'],
    ['review', 'debug'],
    ['learn', 'question'],
  ];
  return groups.some(g => g.includes(a) && g.includes(b));
}

export function formatIntentEvolution(evolution: IntentEvolution): string {
  const parts: string[] = [];
  if (evolution.dominantCategory !== 'general') {
    parts.push(`主导意图: ${evolution.dominantCategory}`);
  }
  if (evolution.activeChains.length > 0) {
    parts.push(`活跃意图链: ${evolution.activeChains.join(', ')}`);
  }
  const recentTransitions = evolution.transitions.slice(-3);
  for (const t of recentTransitions) {
    parts.push(t.description);
  }
  return parts.join(' | ');
}

// ============================================================
// Prompt Signal Utilization — 回复中认知信号利用率追踪
// ============================================================

export interface SignalUtilization {
  /** section prefix → 是否在回复中被体现 */
  utilization: Record<string, boolean>;
  /** 利用率 (0-1) */
  ratio: number;
  /** 未被利用的 sections */
  wasted: string[];
}

const SIGNAL_SECTION_DETECTORS: Record<string, (response: string) => boolean> = {
  'TOOL PRIORITY': (r) => /tool|工具|command|命令/i.test(r),
  'CONVERSATION HEALTH': (r) => /health|healthy|stuck|frustrat/i.test(r),
  'EMOTIONAL RESPONSE STRATEGY': (r) => /understand|feel|sorry|empathy|共情|理解/i.test(r),
  'USER EXPERTISE': (r) => /as you know|你已|since you're|as a/i.test(r),
  'CONVERSATION RHYTHM': (r) => /briefly|short|quick|简短|简要/i.test(r),
  'INTENT EVOLUTION': (r) => /continuing|back to|回到|继续|之前/i.test(r),
  'TEMPORAL CONTEXT': (r) => /morning|afternoon|evening|早上|下午|晚上|today|今天/i.test(r),
  'LEARNED BEHAVIORS': (r) => /as we|last time|上次|之前讨论/i.test(r),
  'INPUT AMBIGUITY': (r) => /clarify|do you mean|你是说|具体/i.test(r),
  'MULTI-INTENT': (r) => /first|second|also|首先|其次|另外/i.test(r),
  'COMPOSITE RESPONSE STRATEGY': (r) => true, // always considered utilized (guides overall tone)
  'COGNITIVE STATE': (r) => true, // always considered utilized (self-awareness)
  'PERCEPTION FUSION': (r) => true, // always considered utilized (behavioral mode)
  'STRATEGY COHERENCE': (r) => true, // always considered utilized
};

export function evaluateSignalUtilization(
  activeSections: string[],
  agentResponse: string,
): SignalUtilization {
  const utilization: Record<string, boolean> = {};
  let used = 0;
  const wasted: string[] = [];

  for (const section of activeSections) {
    const detector = SIGNAL_SECTION_DETECTORS[section];
    if (detector) {
      const isUsed = detector(agentResponse);
      utilization[section] = isUsed;
      if (isUsed) used++;
      else wasted.push(section);
    } else {
      // 没有 detector 的 section 视为已利用
      utilization[section] = true;
      used++;
    }
  }

  const ratio = activeSections.length > 0 ? used / activeSections.length : 1;
  return { utilization, ratio, wasted };
}

export interface UtilizationStats {
  /** section → 累计利用率 (0-1 EMA) */
  sectionRatios: Record<string, number>;
  /** 总评估次数 */
  evaluations: number;
}

const UTIL_ALPHA = 0.15;

export function createDefaultUtilizationStats(): UtilizationStats {
  return { sectionRatios: {}, evaluations: 0 };
}

export function updateUtilizationStats(
  stats: UtilizationStats,
  utilization: SignalUtilization,
): UtilizationStats {
  const newRatios = { ...stats.sectionRatios };
  for (const [section, used] of Object.entries(utilization.utilization)) {
    const current = newRatios[section] ?? 0.5;
    newRatios[section] = current + UTIL_ALPHA * ((used ? 1 : 0) - current);
  }
  return { sectionRatios: newRatios, evaluations: stats.evaluations + 1 };
}

export function getUnderutilizedSections(
  stats: UtilizationStats,
  threshold: number = 0.3,
): string[] {
  return Object.entries(stats.sectionRatios)
    .filter(([, ratio]) => ratio < threshold)
    .map(([section]) => section);
}

// ============================================================
// Response Style Evolution — 回复风格自进化
// ============================================================

export interface ResponseStyleFeatures {
  /** 代码块数量 */
  codeBlocks: number;
  /** 解释文字占比 (0-1) */
  explanationRatio: number;
  /** 列表/步骤数量 */
  listItems: number;
  /** 回复长度 (chars) */
  length: number;
  /** 问题数量（向用户提问） */
  questionsAsked: number;
  /** 使用了代码/技术术语 */
  technical: boolean;
}

export interface StyleSatisfactionSample {
  features: ResponseStyleFeatures;
  /** 下一轮用户的满意度信号 (0-1) */
  satisfaction: number;
}

export interface StyleEvolutionModel {
  /** 特征维度 → EMA 权重 (正=用户满意此特征, 负=不满意) */
  featureWeights: Record<keyof ResponseStyleFeatures, number>;
  /** 样本数 */
  samples: number;
}

const STYLE_ALPHA = 0.1;

export function createDefaultStyleEvolution(): StyleEvolutionModel {
  return {
    featureWeights: {
      codeBlocks: 0,
      explanationRatio: 0,
      listItems: 0,
      length: 0,
      questionsAsked: 0,
      technical: 0,
    },
    samples: 0,
  };
}

export function extractResponseFeatures(response: string): ResponseStyleFeatures {
  const codeBlocks = (response.match(/```[\s\S]*?```/g) || []).length;
  const codeChars = (response.match(/```[\s\S]*?```/g) || []).join('').length;
  const explanationRatio = response.length > 0 ? 1 - codeChars / response.length : 1;
  const listItems = (response.match(/^[\s]*[-*•]\s|^\d+[.)]\s/gm) || []).length;
  const questionsAsked = (response.match(/[?？]/g) || []).length;
  const technical = /function|class|import|const |let |var |return|async|await|=>|def |print|npm|pip|git |docker/i.test(response);
  return { codeBlocks, explanationRatio, listItems, length: response.length, questionsAsked, technical };
}

/** 从用户的下一条消息推断满意度信号 */
export function inferSatisfactionFromReply(userReply: string): number {
  let score = 0.5; // 基线

  // 正面信号
  if (/thanks|thank you|完美|很好|正确|works|got it|明白了|谢谢|great|perfect/i.test(userReply)) {
    score += 0.3;
  }
  if (/awesome|excellent|太棒|厉害|exactly|对的|没错/i.test(userReply)) {
    score += 0.2;
  }
  // 简短确认 (ok, yes, 好的)
  if (/^(ok|okay|yes|好|好的|嗯|got it|明白了?)[\s!.?]*$/i.test(userReply.trim())) {
    score += 0.15;
  }

  // 负面信号
  if (/no|wrong|not right|不对|不是|错误|不对/i.test(userReply)) {
    score -= 0.3;
  }
  if (/still|还是|doesn't work|不行|失败|still not|不work/i.test(userReply)) {
    score -= 0.2;
  }
  // 追问同一话题（说明上一个回复不够完整）
  if (/more|detail|elaborate|详细|更多|继续|还有/i.test(userReply)) {
    score -= 0.1;
  }

  return Math.max(0, Math.min(1, score));
}

export function updateStyleEvolution(
  model: StyleEvolutionModel,
  sample: StyleSatisfactionSample,
): StyleEvolutionModel {
  const newWeights = { ...model.featureWeights };
  const satisfactionDelta = (sample.satisfaction - 0.5) * 2; // -1 to +1

  for (const key of Object.keys(newWeights) as Array<keyof ResponseStyleFeatures>) {
    const featureValue = normalizeFeature(key, sample.features[key]);
    const contribution = featureValue * satisfactionDelta;
    newWeights[key] = newWeights[key] + STYLE_ALPHA * (contribution - newWeights[key]);
  }

  return { featureWeights: newWeights, samples: model.samples + 1 };
}

function normalizeFeature(key: keyof ResponseStyleFeatures, value: number | boolean): number {
  if (key === 'technical') return value ? 1 : 0;
  const num = value as number;
  if (key === 'length') return Math.min(1, num / 1000);
  if (key === 'codeBlocks') return Math.min(1, num / 3);
  if (key === 'listItems') return Math.min(1, num / 5);
  if (key === 'explanationRatio') return num;
  if (key === 'questionsAsked') return Math.min(1, num / 3);
  return 0;
}

export function generateStyleGuidance(model: StyleEvolutionModel): string | undefined {
  if (model.samples < 3) return undefined;

  const w = model.featureWeights;
  const hints: string[] = [];

  if (w.codeBlocks > 0.05) hints.push('prefer code examples');
  else if (w.codeBlocks < -0.05) hints.push('minimize code, use prose explanations');

  if (w.explanationRatio > 0.05) hints.push('explain concepts thoroughly');
  else if (w.explanationRatio < -0.05) hints.push('keep explanations concise');

  if (w.listItems > 0.05) hints.push('use structured lists/steps');
  else if (w.listItems < -0.05) hints.push('avoid over-structuring');

  if (w.questionsAsked > 0.05) hints.push('ask clarifying questions');
  else if (w.questionsAsked < -0.05) hints.push('be decisive, avoid asking back');

  if (hints.length === 0) return undefined;
  return hints.join('; ');
}

// ============================================================
// Importance-Aware History Compressor — 智能对话历史压缩
// ============================================================

export interface CompressedHistory {
  /** 压缩后的消息 */
  messages: Array<{ role: string; content: string; timestamp?: number }>;
  /** 压缩摘要 */
  compressionSummary: string;
  /** 原始消息数 */
  originalCount: number;
  /** 保留的高重要性消息数 */
  preservedCount: number;
}

/**
 * 基于重要性评分压缩对话历史
 *
 * 策略：保留高重要性轮次完整，将低重要性轮次合并为简短摘要。
 * 高重要性 = score > 0.6（包含决策、代码、行动指令、强情感）
 */
export function compressHistory(
  messages: Array<{ role: string; content: string; timestamp?: number }>,
  maxChars: number,
): CompressedHistory {
  if (messages.length === 0) {
    return { messages: [], compressionSummary: 'empty', originalCount: 0, preservedCount: 0 };
  }

  const totalChars = messages.reduce((s, m) => s + m.content.length, 0);
  if (totalChars <= maxChars) {
    return {
      messages: [...messages],
      compressionSummary: 'no compression needed',
      originalCount: messages.length,
      preservedCount: messages.length,
    };
  }

  // 1. 给每条消息评分
  const scored = messages.map((m, i) => ({
    message: m,
    index: i,
    score: scoreTurnImportance(m.role, m.content).importance,
  }));

  // 2. 保留最近3轮和高重要性消息（score > 0.6）
  const recentThreshold = Math.max(0, messages.length - 6);
  const preserved: typeof scored = [];
  const toCompress: typeof scored = [];

  for (const item of scored) {
    if (item.index >= recentThreshold || item.score > 0.6) {
      preserved.push(item);
    } else {
      toCompress.push(item);
    }
  }

  // 3. 将低重要性消息合并为摘要
  const summaryParts: string[] = [];
  let currentChunk: typeof scored = [];

  const flushChunk = () => {
    if (currentChunk.length === 0) return;
    const roles = [...new Set(currentChunk.map(c => c.message.role))];
    const avgScore = currentChunk.reduce((s, c) => s + c.score, 0) / currentChunk.length;
    const summary = summarizeChunk(currentChunk.map(c => c.message));
    if (summary) {
      summaryParts.push(`[${roles.join('/')}×${currentChunk.length}] ${summary}`);
    }
    currentChunk = [];
  };

  for (const item of toCompress) {
    currentChunk.push(item);
    if (currentChunk.length >= 5) flushChunk();
  }
  flushChunk();

  // 4. 重建消息列表
  const result: Array<{ role: string; content: string; timestamp?: number }> = [];

  if (summaryParts.length > 0) {
    result.push({
      role: 'system',
      content: `[Earlier context summary]\n${summaryParts.join('\n')}`,
      timestamp: toCompress[0]?.message.timestamp,
    });
  }

  for (const item of preserved) {
    result.push({
      role: item.message.role,
      content: item.message.content,
      timestamp: item.message.timestamp,
    });
  }

  // 5. 如果仍然超长，截断保留消息中的长内容
  let currentTotal = result.reduce((s, m) => s + m.content.length, 0);
  if (currentTotal > maxChars) {
    for (let i = 0; i < result.length; i++) {
      if (result[i].role === 'system') continue; // 不截断摘要
      if (currentTotal <= maxChars) break;
      if (result[i].content.length > 200) {
        const excess = currentTotal - maxChars;
        const maxLen = Math.max(100, result[i].content.length - excess);
        result[i] = {
          ...result[i],
          content: result[i].content.slice(0, maxLen) + '...[truncated]',
        };
        currentTotal = result.reduce((s, m) => s + m.content.length, 0);
      }
    }
  }

  return {
    messages: result,
    compressionSummary: `compressed ${messages.length} → ${result.length} msgs (preserved ${preserved.length} high-importance)`,
    originalCount: messages.length,
    preservedCount: preserved.length,
  };
}

function summarizeChunk(messages: Array<{ role: string; content: string }>): string {
  // 提取关键信息：代码相关、决策、行动
  const allContent = messages.map(m => m.content).join(' ');
  const keywords: string[] = [];

  // 提取工具/技术关键词
  const techMatches = allContent.match(/\b(debug|test|deploy|build|error|fix|feature|refactor|install|config)\b/gi);
  if (techMatches) {
    const unique = [...new Set(techMatches.map(t => t.toLowerCase()))];
    keywords.push(...unique.slice(0, 3));
  }

  // 提取决策标记
  if (DECISION_MARKERS.test(allContent)) keywords.push('decision-made');
  if (ACTION_MARKERS.test(allContent)) keywords.push('action-planned');

  if (keywords.length === 0) {
    // 即使没有关键词也生成基础摘要
    const userMsgs = messages.filter(m => m.role === 'user');
    const first = userMsgs[0]?.content.slice(0, 50) ?? 'general discussion';
    return `${userMsgs.length} exchanges starting with "${first}..."`;
  }
  return `topics: ${keywords.join(', ')}`;
}

// ============================================================
// Tool Usage Pattern Miner — 工具使用模式挖掘
// ============================================================

export interface ToolUsageRecord {
  tool: string;
  success: boolean;
  timestamp: number;
  context: string; // brief context description
}

export interface ToolPattern {
  /** 工具序列 (e.g., ['code_search', 'shell_exec']) */
  sequence: string[];
  /** 成功率 */
  successRate: number;
  /** 出现次数 */
  occurrences: number;
  /** 典型上下文 */
  typicalContext: string;
}

export interface ToolPatternStats {
  /** 二元组模式 (A→B) */
  pairs: Record<string, ToolPattern>;
  /** 总记录数 */
  totalRecords: number;
}

export function createDefaultToolPatternStats(): ToolPatternStats {
  return { pairs: {}, totalRecords: 0 };
}

export function recordToolUsage(
  stats: ToolPatternStats,
  record: ToolUsageRecord,
): ToolPatternStats {
  return {
    pairs: stats.pairs,
    totalRecords: stats.totalRecords + 1,
  };
}

/**
 * 从工具使用历史中挖掘模式
 *
 * 分析连续工具调用序列，找出成功率高的工具组合模式。
 */
export function mineToolPatterns(
  history: ToolUsageRecord[],
  minOccurrences: number = 2,
): ToolPattern[] {
  if (history.length < 2) return [];

  const pairStats: Record<string, { successes: number; failures: number; contexts: string[] }> = {};

  // 分析相邻工具调用（时间窗口 5 分钟内）
  const WINDOW_MS = 5 * 60 * 1000;
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];
    if (curr.timestamp - prev.timestamp > WINDOW_MS) continue;
    if (prev.tool === curr.tool) continue; // 跳过相同工具

    const key = `${prev.tool}→${curr.tool}`;
    if (!pairStats[key]) {
      pairStats[key] = { successes: 0, failures: 0, contexts: [] };
    }
    if (curr.success) pairStats[key].successes++;
    else pairStats[key].failures++;
    pairStats[key].contexts.push(curr.context);
  }

  // 转换为 ToolPattern 并过滤
  const patterns: ToolPattern[] = [];
  for (const [key, stats] of Object.entries(pairStats)) {
    const total = stats.successes + stats.failures;
    if (total < minOccurrences) continue;
    const successRate = stats.successes / total;
    patterns.push({
      sequence: key.split('→'),
      successRate,
      occurrences: total,
      typicalContext: stats.contexts[stats.contexts.length - 1] ?? '',
    });
  }

  return patterns.sort((a, b) => (b.successRate * b.occurrences) - (a.successRate * a.occurrences));
}

/**
 * 基于最后一个使用的工具推荐下一个工具
 */
export function suggestNextTool(
  patterns: ToolPattern[],
  lastTool: string,
  topN: number = 3,
): string[] {
  return patterns
    .filter(p => p.sequence[0] === lastTool && p.successRate > 0.5)
    .sort((a, b) => (b.successRate * b.occurrences) - (a.successRate * a.occurrences))
    .slice(0, topN)
    .map(p => p.sequence[1]);
}

export function formatToolPatterns(patterns: ToolPattern[]): string {
  if (patterns.length === 0) return '';
  return patterns.slice(0, 5).map(p =>
    `${p.sequence.join('→')} (success: ${(p.successRate * 100).toFixed(0)}%, used ${p.occurrences}x)`,
  ).join('; ');
}

// ============================================================
// Conversation Knowledge Graph — 对话知识图谱
// ============================================================

export interface KnowledgeEntity {
  name: string;
  type: 'file' | 'module' | 'concept' | 'tool' | 'person' | 'technology' | 'error';
  mentions: number;
  firstMentioned: number;
}

export interface KnowledgeRelation {
  from: string;
  to: string;
  relation: string;
  confidence: number;
}

export interface ConversationKnowledgeGraph {
  entities: Map<string, KnowledgeEntity>;
  relations: KnowledgeRelation[];
}

export function createEmptyKnowledgeGraph(): ConversationKnowledgeGraph {
  return { entities: new Map(), relations: [] };
}

// 实体类型检测模式
const ENTITY_PATTERNS: Array<{ pattern: RegExp; type: KnowledgeEntity['type'] }> = [
  { pattern: /[\w/.]+\.(ts|tsx|js|jsx|py|go|rs|java|json|yaml|yml|md|sql)\b/g, type: 'file' },
  { pattern: /(?:import|from|require)\s+['"]([^'"]+)['"]/g, type: 'module' },
  { pattern: /\b(Error|TypeError|ReferenceError|SyntaxError|ValidationError)\b/g, type: 'error' },
  { pattern: /\b(React|Next\.js|Vue|Angular|Express|Fastify|Django|Flask|PostgreSQL|MongoDB|Redis|Docker|Kubernetes|Git|npm|pnpm|yarn)\b/gi, type: 'technology' },
  { pattern: /\b(auth|database|api|router|middleware|config|logger|cache|queue|pipeline)\b/gi, type: 'concept' },
  { pattern: /\b(grep|find|search|test|build|deploy|install|run)\b/gi, type: 'tool' },
  { pattern: /`([^`]+)`/g, type: 'concept' },
];

// 关系检测模式
const RELATION_PATTERNS: Array<{ pattern: RegExp; fromGroup: number; toGroup: number; relation: string }> = [
  { pattern: /(\w+(?:\.\w+)?)\s+(?:imports?|requires?|depends?\s+on)\s+(\w+(?:\.\w+)?)/gi, fromGroup: 1, toGroup: 2, relation: 'imports' },
  { pattern: /(\w+(?:\.\w+)?)\s+(?:uses?|calls?|invokes?)\s+(\w+(?:\.\w+)?)/gi, fromGroup: 1, toGroup: 2, relation: 'uses' },
  { pattern: /(\w+)\s+(?:error|bug|issue|problem)\s+(?:in|with|at)\s+(\w+)/gi, fromGroup: 1, toGroup: 2, relation: 'error-in' },
  { pattern: /fix(?:ed|es)?\s+(?:the\s+)?(\w+)\s+(?:in|of)\s+(\w+)/gi, fromGroup: 1, toGroup: 2, relation: 'fixed-in' },
];

export function extractEntitiesFromMessage(
  message: string,
  timestamp: number,
  existingEntities: Map<string, KnowledgeEntity>,
): Map<string, KnowledgeEntity> {
  const updated = new Map(existingEntities);

  for (const { pattern, type } of ENTITY_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(message)) !== null) {
      // 文件类型用 match[0]（完整文件名），其他用 capture group
      const name = (type === 'file' ? match[0] : (match[1] ?? match[0])).toLowerCase();
      if (name.length < 2 || name.length > 50) continue;

      const existing = updated.get(name);
      if (existing) {
        updated.set(name, { ...existing, mentions: existing.mentions + 1 });
      } else {
        updated.set(name, { name, type, mentions: 1, firstMentioned: timestamp });
      }
    }
  }

  return updated;
}

export function extractRelationsFromMessage(message: string): KnowledgeRelation[] {
  const relations: KnowledgeRelation[] = [];

  for (const { pattern, fromGroup, toGroup, relation } of RELATION_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(message)) !== null) {
      const from = match[fromGroup]?.toLowerCase();
      const to = match[toGroup]?.toLowerCase();
      if (from && to && from !== to) {
        relations.push({ from, to, relation, confidence: 0.7 });
      }
    }
  }

  return relations;
}

export function getTopEntities(
  entities: Map<string, KnowledgeEntity>,
  limit: number = 10,
): KnowledgeEntity[] {
  return [...entities.values()]
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, limit);
}

export function formatKnowledgeSummary(
  entities: Map<string, KnowledgeEntity>,
  relations: KnowledgeRelation[],
): string {
  const topEntities = getTopEntities(entities, 8);
  if (topEntities.length === 0) return '';

  const parts: string[] = [];
  parts.push(`entities: ${topEntities.map(e => `${e.name}(${e.type}:${e.mentions}x)`).join(', ')}`);

  const uniqueRelations = relations.slice(-5);
  if (uniqueRelations.length > 0) {
    parts.push(`relations: ${uniqueRelations.map(r => `${r.from}→${r.relation}→${r.to}`).join(', ')}`);
  }

  return parts.join(' | ');
}

// ==================== 认知疲劳检测 ====================

export interface FatigueIndicators {
  /** 回复重复度 (0-1, 越高越重复) */
  repetitionScore: number;
  /** 工具使用效率 (0-1, 越低效率越差) */
  toolEfficiency: number;
  /** 情感响应强度 (0-1, 越低越淡) */
  emotionalResponsiveness: number;
  /** 策略一致性 (0-1, 越低越不一致) */
  strategyConsistency: number;
}

export interface CognitiveFatigueState {
  /** 综合疲劳等级 0-1 */
  fatigueLevel: number;
  /** 疲劳信号标签 */
  signals: string[];
  /** 建议动作 */
  recommendation: 'none' | 'lighten' | 'refocus' | 'suggest-break';
  /** 对话时长（分钟） */
  sessionDurationMinutes: number;
}

const FATIGUE_INDICATOR_WEIGHTS = {
  repetitionScore: 0.3,
  toolEfficiency: 0.25,
  emotionalResponsiveness: 0.2,
  strategyConsistency: 0.25,
} as const;

const FATIGUE_THRESHOLDS = {
  none: 0.3,
  lighten: 0.5,
  refocus: 0.7,
} as const;

/**
 * 从滑动窗口计算回复重复度
 */
export function computeRepetitionScore(
  recentResponses: string[],
  windowSize: number = 5,
): number {
  if (recentResponses.length < 2) return 0;
  const window = recentResponses.slice(-windowSize);
  let overlapSum = 0;
  let comparisons = 0;

  for (let i = 1; i < window.length; i++) {
    const prev = new Set(window[i - 1].toLowerCase().split(/\s+/));
    const curr = new Set(window[i].toLowerCase().split(/\s+/));
    const intersection = [...prev].filter(w => curr.has(w)).length;
    const union = new Set([...prev, ...curr]).size;
    overlapSum += union > 0 ? intersection / union : 0;
    comparisons++;
  }

  return comparisons > 0 ? overlapSum / comparisons : 0;
}

/**
 * 计算工具使用效率（成功率 × 速度衰减）
 */
export function computeToolEfficiency(
  recentToolResults: Array<{ success: boolean; timestamp: number }>,
  windowSize: number = 10,
): number {
  if (recentToolResults.length === 0) return 1;
  const window = recentToolResults.slice(-windowSize);
  const successRate = window.filter(r => r.success).length / window.length;

  // 检测速度衰减（后半段是否比前半段慢）
  if (window.length >= 4) {
    const mid = Math.floor(window.length / 2);
    const firstHalf = window.slice(0, mid);
    const secondHalf = window.slice(mid);
    const avgGapFirst = firstHalf.length > 1
      ? (firstHalf[firstHalf.length - 1].timestamp - firstHalf[0].timestamp) / (firstHalf.length - 1)
      : 1000;
    const avgGapSecond = secondHalf.length > 1
      ? (secondHalf[secondHalf.length - 1].timestamp - secondHalf[0].timestamp) / (secondHalf.length - 1)
      : 1000;
    const speedDecay = avgGapFirst > 0 ? Math.min(avgGapSecond / avgGapFirst, 2) / 2 : 0.5;
    return successRate * (1 - speedDecay * 0.3);
  }

  return successRate;
}

/**
 * 综合评估认知疲劳状态
 */
export function assessCognitiveFatigue(
  indicators: FatigueIndicators,
  sessionStartTimestamp: number,
  turnCount: number,
): CognitiveFatigueState {
  const fatigueLevel =
    indicators.repetitionScore * FATIGUE_INDICATOR_WEIGHTS.repetitionScore +
    (1 - indicators.toolEfficiency) * FATIGUE_INDICATOR_WEIGHTS.toolEfficiency +
    (1 - indicators.emotionalResponsiveness) * FATIGUE_INDICATOR_WEIGHTS.emotionalResponsiveness +
    (1 - indicators.strategyConsistency) * FATIGUE_INDICATOR_WEIGHTS.strategyConsistency;

  const sessionDurationMinutes = (Date.now() - sessionStartTimestamp) / 60000;
  const signals: string[] = [];

  if (indicators.repetitionScore > 0.5) signals.push('repetitive-responses');
  if (indicators.toolEfficiency < 0.4) signals.push('declining-tool-success');
  if (indicators.emotionalResponsiveness < 0.3) signals.push('flat-emotion');
  if (indicators.strategyConsistency < 0.4) signals.push('strategy-drift');
  if (sessionDurationMinutes > 60 && turnCount > 30) signals.push('long-session');
  if (turnCount > 50) signals.push('high-turn-count');

  let recommendation: CognitiveFatigueState['recommendation'] = 'none';
  if (fatigueLevel >= FATIGUE_THRESHOLDS.refocus) {
    recommendation = 'refocus';
  } else if (fatigueLevel >= FATIGUE_THRESHOLDS.lighten) {
    recommendation = 'lighten';
  }

  // 长会话 + 高轮次 → 建议休息
  if (sessionDurationMinutes > 90 && fatigueLevel > 0.5) {
    recommendation = 'suggest-break';
  }

  return {
    fatigueLevel: Math.min(1, Math.max(0, fatigueLevel)),
    signals,
    recommendation,
    sessionDurationMinutes,
  };
}

/**
 * 生成疲劳状态摘要（注入 prompt）
 */
export function formatFatigueGuidance(fatigue: CognitiveFatigueState): string | undefined {
  if (fatigue.recommendation === 'none') return undefined;

  const parts: string[] = [];
  parts.push(`fatigue: ${(fatigue.fatigueLevel * 100).toFixed(0)}%`);

  if (fatigue.signals.length > 0) {
    parts.push(`signals: ${fatigue.signals.join(', ')}`);
  }

  switch (fatigue.recommendation) {
    case 'lighten':
      parts.push('prefer concise, direct responses; avoid deep analysis unless explicitly requested');
      break;
    case 'refocus':
      parts.push('refocus on core topic; reduce tangential exploration; use simpler tool strategies');
      break;
    case 'suggest-break':
      parts.push('consider suggesting a brief pause or context summary; user may benefit from a mental reset');
      break;
  }

  return parts.join(' | ');
}

// ==================== 对话中断恢复 ====================

export interface GapContext {
  /** 间隔分钟数 */
  gapMinutes: number;
  /** 间隔前的最后话题 */
  lastTopic: string | undefined;
  /** 间隔前的活跃目标 */
  activeGoals: Array<{ id: string; description: string; priority: number }>;
  /** 间隔前的情感状态 */
  lastEmotion: string | undefined;
  /** 关键实体（从知识图谱提取） */
  topEntities: string[];
  /** 未完成的承诺/待办 */
  pendingCommitments: string[];
}

export type GapSeverity = 'brief' | 'moderate' | 'extended' | 'long-absence';

export interface GapRecoveryStrategy {
  severity: GapSeverity;
  /** 是否主动发起续接 */
  shouldProactivelyResume: boolean;
  /** 续接模板类型 */
  resumeStyle: 'pickup' | 'summary' | 'fresh-context' | 'check-in';
  /** 要提及的上下文要点 */
  contextPoints: string[];
  /** 建议的继续方向 */
  suggestedDirections: string[];
}

const GAP_THRESHOLDS = {
  brief: 5,        // < 5 min: seamless
  moderate: 30,    // 5-30 min: pickup with context
  extended: 240,   // 30 min - 4h: summary
  // > 4h: long-absence / fresh-context
} as const;

/**
 * 判断间隔严重程度
 */
export function classifyGapSeverity(gapMinutes: number): GapSeverity {
  if (gapMinutes < GAP_THRESHOLDS.brief) return 'brief';
  if (gapMinutes < GAP_THRESHOLDS.moderate) return 'moderate';
  if (gapMinutes < GAP_THRESHOLDS.extended) return 'extended';
  return 'long-absence';
}

/**
 * 从最近对话历史提取最后话题
 */
export function extractLastTopic(
  recentMessages: Array<{ role: string; content: string }>,
  maxMessages: number = 6,
): string | undefined {
  const recent = recentMessages.slice(-maxMessages);
  const userMessages = recent.filter(m => m.role === 'user');
  if (userMessages.length === 0) return undefined;

  const lastUser = userMessages[userMessages.length - 1].content;
  const topic = lastUser.length > 60 ? lastUser.slice(0, 57) + '...' : lastUser;
  return topic;
}

/**
 * 从对话历史提取待办/承诺
 */
export function extractPendingCommitments(
  recentMessages: Array<{ role: string; content: string }>,
): string[] {
  const commitments: string[] = [];
  const patterns = [
    /(?:I'll|I will|let me|让我|我来|待会儿|later|after this|接下来)\s+(.+?)(?:\.|。|$)/gi,
    /(?:todo|TODO|fixme|FIXME|pending|待办|待处理)[：:]?\s*(.+?)(?:\.|。|$)/gi,
    /(?:need to|应该|需要|must|should)\s+(.+?)(?:\.|。|$)/gi,
  ];

  for (const msg of recentMessages) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(msg.content)) !== null) {
        const item = match[1]?.trim();
        if (item && item.length > 3 && item.length < 100) {
          commitments.push(item);
        }
      }
    }
  }

  return [...new Set(commitments)].slice(-5);
}

/**
 * 生成中断恢复策略
 */
export function generateGapRecoveryStrategy(ctx: GapContext): GapRecoveryStrategy {
  const severity = classifyGapSeverity(ctx.gapMinutes);

  const contextPoints: string[] = [];
  const suggestedDirections: string[] = [];

  if (ctx.lastTopic) contextPoints.push(`last topic: ${ctx.lastTopic}`);
  if (ctx.topEntities.length > 0) {
    contextPoints.push(`key entities: ${ctx.topEntities.slice(0, 5).join(', ')}`);
  }
  if (ctx.pendingCommitments.length > 0) {
    contextPoints.push(`pending: ${ctx.pendingCommitments.slice(0, 3).join('; ')}`);
  }
  if (ctx.lastEmotion) {
    contextPoints.push(`mood was: ${ctx.lastEmotion}`);
  }

  let resumeStyle: GapRecoveryStrategy['resumeStyle'] = 'pickup';
  let shouldProactivelyResume = false;

  switch (severity) {
    case 'brief':
      shouldProactivelyResume = false;
      break;
    case 'moderate':
      shouldProactivelyResume = true;
      resumeStyle = 'pickup';
      if (ctx.lastTopic) suggestedDirections.push(`continue: ${ctx.lastTopic}`);
      break;
    case 'extended':
      shouldProactivelyResume = true;
      resumeStyle = 'summary';
      if (ctx.activeGoals.length > 0) {
        suggestedDirections.push(`goal: ${ctx.activeGoals[0].description}`);
      }
      if (ctx.pendingCommitments.length > 0) {
        suggestedDirections.push(`pending: ${ctx.pendingCommitments[0]}`);
      }
      break;
    case 'long-absence':
      shouldProactivelyResume = true;
      resumeStyle = 'fresh-context';
      suggestedDirections.push('ask what they want to focus on now');
      if (ctx.activeGoals.length > 0) {
        suggestedDirections.push(`resume goal: ${ctx.activeGoals[0].description}`);
      }
      break;
  }

  return {
    severity,
    shouldProactivelyResume,
    resumeStyle,
    contextPoints,
    suggestedDirections,
  };
}

/**
 * 生成恢复引导文本（注入 prompt）
 */
export function formatGapRecoveryGuidance(strategy: GapRecoveryStrategy): string | undefined {
  if (!strategy.shouldProactivelyResume) return undefined;

  const parts: string[] = [];
  parts.push(`gap: ${strategy.severity}`);
  parts.push(`style: ${strategy.resumeStyle}`);

  if (strategy.contextPoints.length > 0) {
    parts.push(`context: ${strategy.contextPoints.join(' | ')}`);
  }
  if (strategy.suggestedDirections.length > 0) {
    parts.push(`suggested: ${strategy.suggestedDirections.join('; ')}`);
  }

  return parts.join(' | ');
}

// ==================== 主动学习闭环 ====================

export type LessonCategory = 'tool-choice' | 'strategy' | 'response-quality' | 'context-loss' | 'user-preference';

export interface LearnedLesson {
  /** 教训类别 */
  category: LessonCategory;
  /** 触发条件：什么时候应用这条教训 */
  trigger: string;
  /** 要避免的行为 */
  avoid: string;
  /** 推荐的行为 */
  prefer: string;
  /** 置信度 0-1（基于发生次数和成功率） */
  confidence: number;
  /** 记录时间 */
  timestamp: number;
  /** 发生次数 */
  occurrences: number;
}

const MAX_LESSONS = 30;
const LESSON_MIN_CONFIDENCE = 0.5;

const lessons: LearnedLesson[] = [];

/**
 * 从质量评估结果提取教训
 */
export function extractLessonFromQuality(
  qualityScore: number,
  signals: string[],
  recentContext: string,
): LearnedLesson | undefined {
  if (qualityScore >= 0.6) return undefined;
  if (signals.length === 0) return undefined;

  const signal = signals[0];
  let category: LessonCategory = 'response-quality';
  let avoid = 'verbose or off-topic responses';
  let prefer = 'focused, concise answers';

  if (signal.includes('repetition')) {
    category = 'response-quality';
    avoid = 'repeating previous response patterns';
    prefer = 'generate fresh responses with new information';
  } else if (signal.includes('off-topic') || signal.includes('tangent')) {
    category = 'strategy';
    avoid = 'exploring tangential topics';
    prefer = 'stay focused on the current question';
  } else if (signal.includes('shallow') || signal.includes('surface')) {
    category = 'response-quality';
    avoid = 'surface-level analysis';
    prefer = 'provide deeper reasoning and evidence';
  }

  return {
    category,
    trigger: recentContext.slice(0, 80),
    avoid,
    prefer,
    confidence: 0.5 + (1 - qualityScore) * 0.3,
    timestamp: Date.now(),
    occurrences: 1,
  };
}

/**
 * 从工具失败提取教训
 */
export function extractLessonFromToolFailure(
  toolName: string,
  failureType: string,
  errorMessage: string,
): LearnedLesson | undefined {
  let avoid: string;
  let prefer: string;

  switch (failureType) {
    case 'timeout':
      avoid = `using ${toolName} for large inputs without batching`;
      prefer = `batch inputs or use a faster alternative to ${toolName}`;
      break;
    case 'permission_denied':
      avoid = `calling ${toolName} without checking permissions first`;
      prefer = `verify permissions before using ${toolName}`;
      break;
    case 'invalid_args':
      avoid = `passing incorrect arguments to ${toolName}`;
      prefer = `validate arguments format for ${toolName} before calling`;
      break;
    default:
      avoid = `calling ${toolName} when it's likely to fail`;
      prefer = `check preconditions before using ${toolName}`;
  }

  return {
    category: 'tool-choice',
    trigger: `using ${toolName}`,
    avoid,
    prefer,
    confidence: 0.6,
    timestamp: Date.now(),
    occurrences: 1,
  };
}

/**
 * 记录教训并去重/增强
 */
export function recordLesson(lesson: LearnedLesson): void {
  // 查找相似的已有教训
  const existing = lessons.find(
    l => l.category === lesson.category && l.trigger === lesson.trigger,
  );

  if (existing) {
    // 增强已有教训
    existing.occurrences++;
    existing.confidence = Math.min(1, existing.confidence + 0.1);
    existing.timestamp = Date.now();
    // 保留最新的 avoid/prefer
    existing.avoid = lesson.avoid;
    existing.prefer = lesson.prefer;
  } else {
    lessons.push({ ...lesson });
    if (lessons.length > MAX_LESSONS) {
      // 移除最旧的教训
      const oldestIdx = lessons.reduce((min, l, i) => l.timestamp < lessons[min].timestamp ? i : min, 0);
      lessons.splice(oldestIdx, 1);
    }
  }
}

/**
 * 获取与当前上下文相关的教训
 */
export function getRelevantLessons(context: string, maxCount: number = 5): LearnedLesson[] {
  const contextLower = context.toLowerCase();
  return lessons
    .filter(l => l.confidence >= LESSON_MIN_CONFIDENCE)
    .filter(l => {
      const triggerLower = l.trigger.toLowerCase();
      // 简单关键词匹配
      return contextLower.includes(triggerLower.slice(0, 20)) ||
        triggerLower.split(/\s+/).some(w => w.length > 3 && contextLower.includes(w));
    })
    .sort((a, b) => b.confidence * b.occurrences - a.confidence * a.occurrences)
    .slice(0, maxCount);
}

/**
 * 格式化教训为 prompt 注入文本
 */
export function formatLessonsPrompt(lessonsToFormat: LearnedLesson[]): string | undefined {
  if (lessonsToFormat.length === 0) return undefined;

  return lessonsToFormat
    .map(l => `when ${l.trigger.slice(0, 50)} → avoid: ${l.avoid} → prefer: ${l.prefer} (${l.confidence.toFixed(1)} confidence, ${l.occurrences}x)`)
    .join('\n');
}

/**
 * 清除教训（测试用）
 */
export function clearLessons(): void {
  lessons.length = 0;
}

// ==================== 对话节奏自适应 ====================

export type UserCadence = 'rapid-fire' | 'measured' | 'deliberate' | 'burst-pause';

export interface RhythmProfile {
  /** 平均消息间隔（秒） */
  avgIntervalSec: number;
  /** 平均消息长度（字符） */
  avgMessageLength: number;
  /** 速度模式 */
  cadence: UserCadence;
  /** 建议回复风格 */
  suggestedResponseStyle: 'brief' | 'balanced' | 'detailed';
  /** 建议等待策略 */
  suggestedWaitStrategy: 'respond-immediately' | 'pause-for-continuation' | 'wait-for-completion';
}

export interface RhythmSample {
  timestamp: number;
  messageLength: number;
}

const RHYTHM_WINDOW = 10;

/**
 * 从节奏样本推断用户风格
 */
export function inferCadence(samples: RhythmSample[]): UserCadence {
  if (samples.length < 2) return 'measured';

  const intervals: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    intervals.push(samples[i].timestamp - samples[i - 1].timestamp);
  }

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const avgLength = samples.reduce((a, s) => a + s.messageLength, 0) / samples.length;

  // 快速短消息 → rapid-fire
  if (avgInterval < 15000 && avgLength < 30) return 'rapid-fire';
  // 慢速长消息 → deliberate
  if (avgInterval > 120000 && avgLength > 100) return 'deliberate';
  // 短间隔但长消息 → burst-pause
  if (avgInterval < 30000 && avgLength > 80) return 'burst-pause';
  // 默认
  return 'measured';
}

/**
 * 从节奏推断建议的回复风格
 */
export function inferResponseStyle(cadence: UserCadence): RhythmProfile['suggestedResponseStyle'] {
  switch (cadence) {
    case 'rapid-fire': return 'brief';
    case 'deliberate': return 'detailed';
    default: return 'balanced';
  }
}

/**
 * 从节奏推断等待策略
 */
export function inferWaitStrategy(cadence: UserCadence): RhythmProfile['suggestedWaitStrategy'] {
  switch (cadence) {
    case 'rapid-fire': return 'pause-for-continuation';
    case 'burst-pause': return 'wait-for-completion';
    case 'deliberate': return 'respond-immediately';
    default: return 'respond-immediately';
  }
}

/**
 * 更新节奏配置文件
 */
export function updateRhythmProfile(
  profile: RhythmProfile,
  newSamples: RhythmSample[],
): RhythmProfile {
  const window = newSamples.slice(-RHYTHM_WINDOW);
  if (window.length < 2) return profile;

  const intervals: number[] = [];
  for (let i = 1; i < window.length; i++) {
    const gap = (window[i].timestamp - window[i - 1].timestamp) / 1000;
    intervals.push(gap);
  }

  const avgIntervalSec = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const avgMessageLength = window.reduce((a, s) => a + s.messageLength, 0) / window.length;
  const cadence = inferCadence(window);

  return {
    avgIntervalSec,
    avgMessageLength,
    cadence,
    suggestedResponseStyle: inferResponseStyle(cadence),
    suggestedWaitStrategy: inferWaitStrategy(cadence),
  };
}

/**
 * 创建默认节奏配置
 */
export function createDefaultRhythmProfile(): RhythmProfile {
  return {
    avgIntervalSec: 30,
    avgMessageLength: 50,
    cadence: 'measured',
    suggestedResponseStyle: 'balanced',
    suggestedWaitStrategy: 'respond-immediately',
  };
}

/**
 * 格式化节奏指导文本（注入 prompt）
 */
export function formatRhythmGuidance(profile: RhythmProfile): string {
  const parts: string[] = [];
  parts.push(`user cadence: ${profile.cadence}`);
  parts.push(`avg interval: ${profile.avgIntervalSec.toFixed(0)}s`);
  parts.push(`response style: ${profile.suggestedResponseStyle}`);

  if (profile.suggestedWaitStrategy !== 'respond-immediately') {
    parts.push(`note: ${profile.suggestedWaitStrategy}`);
  }

  return parts.join(' | ');
}

// ==================== 多粒度意图分解 ====================

export type SubIntentType = 'question' | 'action' | 'exploration' | 'decision' | 'verification';

export interface SubIntent {
  /** 子意图描述 */
  description: string;
  /** 类型 */
  type: SubIntentType;
  /** 优先级（1 最高） */
  priority: number;
  /** 依赖的子意图序号 */
  dependsOn: number[];
  /** 估计复杂度 0-1 */
  complexity: number;
}

export interface IntentDecomposition {
  /** 原始输入 */
  originalInput: string;
  /** 分解出的子意图 */
  subIntents: SubIntent[];
  /** 执行序（按优先级和依赖排序后的索引） */
  executionOrder: number[];
  /** 是否需要逐步确认 */
  requiresConfirmation: boolean;
}

const INTENT_TYPE_PATTERNS: Array<{ pattern: RegExp; type: SubIntentType }> = [
  { pattern: /[?？]|怎么|如何|为什么|what|how|why|when|where/i, type: 'question' },
  { pattern: /确认|验证|检查|对不对|correct|verify|check|confirm|right\?/i, type: 'verification' },
  { pattern: /帮我|请|做|执行|运行|创建|删除|修改|add|create|delete|update|run|fix|implement/i, type: 'action' },
  { pattern: /看看|试试|探索|了解一下|let's see|try|explore|investigate/i, type: 'exploration' },
  { pattern: /选择|决定|应该|choose|decide|should|whether/i, type: 'decision' },
];

/**
 * 判断子意图类型
 */
export function classifySubIntentType(text: string): SubIntentType {
  for (const { pattern, type } of INTENT_TYPE_PATTERNS) {
    if (pattern.test(text)) return type;
  }
  return 'action';
}

/**
 * 估计复杂度
 */
export function estimateComplexity(text: string): number {
  let score = 0;
  if (text.length > 100) score += 0.2;
  if (text.length > 200) score += 0.2;
  if (/多个|所有|全部|批量|parallel|batch|all/i.test(text)) score += 0.2;
  if (/然后|接着|之后|after that|then|next/i.test(text)) score += 0.15;
  if (/依赖|基于|according to|based on|depends/i.test(text)) score += 0.15;
  return Math.min(1, score + 0.2);
}

/**
 * 检测子意图间的依赖关系
 */
export function detectDependencies(subIntents: SubIntent[]): void {
  for (let i = 0; i < subIntents.length; i++) {
    const text = subIntents[i].description.toLowerCase();
    if (/基于|根据|上面|前面|之前的|based on|above|previous|prior/i.test(text)) {
      for (let j = 0; j < i; j++) {
        subIntents[i].dependsOn.push(j + 1);
      }
    }
    if (/然后|接着|之后|then|next|after that/i.test(text) && i > 0) {
      subIntents[i].dependsOn.push(i);
    }
  }
}

/**
 * 计算执行序（拓扑排序）
 */
export function computeExecutionOrder(subIntents: SubIntent[]): number[] {
  if (subIntents.length <= 1) return subIntents.map((_, i) => i + 1);

  const indexed = subIntents.map((si, i) => ({ ...si, originalIndex: i }));
  indexed.sort((a, b) => a.priority - b.priority || a.originalIndex - b.originalIndex);

  const order: number[] = [];
  const placed = new Set<number>();

  for (const si of indexed) {
    const idx = si.originalIndex + 1;
    for (const dep of si.dependsOn) {
      if (!placed.has(dep)) {
        order.push(dep);
        placed.add(dep);
      }
    }
    if (!placed.has(idx)) {
      order.push(idx);
      placed.add(idx);
    }
  }

  return order;
}

/**
 * 分解复合意图
 */
export function decomposeIntent(input: string): IntentDecomposition {
  const detected = detectMultiIntent(input);

  if (detected.length <= 1) {
    const type = classifySubIntentType(input);
    const subIntent: SubIntent = {
      description: input.slice(0, 100),
      type,
      priority: 1,
      dependsOn: [],
      complexity: estimateComplexity(input),
    };
    return {
      originalInput: input,
      subIntents: [subIntent],
      executionOrder: [1],
      requiresConfirmation: false,
    };
  }

  const subIntents: SubIntent[] = detected.map((di, i) => ({
    description: di.text,
    type: classifySubIntentType(di.text),
    priority: i + 1,
    dependsOn: [],
    complexity: estimateComplexity(di.text),
  }));

  detectDependencies(subIntents);
  const executionOrder = computeExecutionOrder(subIntents);
  const requiresConfirmation = subIntents.length > 3 || subIntents.some(si => si.complexity > 0.7);

  return { originalInput: input, subIntents, executionOrder, requiresConfirmation };
}

/**
 * 格式化意图分解为 prompt 文本
 */
export function formatIntentDecomposition(decomposition: IntentDecomposition): string | undefined {
  if (decomposition.subIntents.length <= 1) return undefined;

  const parts: string[] = [];
  parts.push(`${decomposition.subIntents.length} sub-intents detected`);
  parts.push(`execution order: ${decomposition.executionOrder.join(' → ')}`);

  for (const si of decomposition.subIntents) {
    const deps = si.dependsOn.length > 0 ? ` (after: #${si.dependsOn.join(', #')})` : '';
    parts.push(`#${si.priority} [${si.type}] ${si.description.slice(0, 60)}${deps}`);
  }

  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// Waypoint 86: Semantic Memory Network — 主动知识获取与概念网络
// ═══════════════════════════════════════════════════════════════

/**
 * 概念类型层级
 */
export type ConceptType = 'technology' | 'pattern' | 'domain' | 'resource' | 'problem' | 'solution' | 'metric';

/**
 * 语义关系类型
 */
export type SemanticRelationType =
  | 'is-a' | 'part-of' | 'depends-on' | 'causes' | 'solves'
  | 'related-to' | 'alternative-to' | 'precedes' | 'produces';

/**
 * 语义概念节点
 */
export interface SemanticConcept {
  name: string;
  type: ConceptType;
  /** 概念的简短描述 */
  definition: string;
  /** 首次出现的上下文片段 */
  firstContext: string;
  /** 出现次数 */
  mentions: number;
  /** 首次提及时间 */
  firstMentioned: number;
  /** 是否为孤立节点（无关系连接） */
  isolated: boolean;
}

/**
 * 语义关系边
 */
export interface SemanticRelation {
  from: string;
  to: string;
  relation: SemanticRelationType;
  /** 0-1 置信度 */
  confidence: number;
  /** 推断来源: 'explicit'(用户说) | 'inferred'(推断) */
  source: 'explicit' | 'inferred';
}

/**
 * 语义记忆网络
 */
export interface SemanticMemoryNetwork {
  concepts: Map<string, SemanticConcept>;
  relations: SemanticRelation[];
  /** 待补全的孤立节点（可主动提问） */
  pendingClarifications: Array<{ concept: string; question: string }>;
}

/**
 * 概念提取模式
 */
const CONCEPT_PATTERNS: Array<{ pattern: RegExp; type: ConceptType }> = [
  { pattern: /(?:使用|用的是|基于|用到了?)\s*([A-Z][A-Za-z0-9_.\-]+(?:\.js|\.ts|\.py)?)/g, type: 'technology' },
  { pattern: /(?:框架|库|工具|引擎|平台)\s*[:：]\s*(\S+)/g, type: 'technology' },
  { pattern: /(?:设计模式|架构|方案|范式)\s*[:：]\s*(\S+)/g, type: 'pattern' },
  { pattern: /(?:问题是|导致了|引起了|报错|异常)\s*[:：]?\s*(.{3,40}?)(?:\.|,|，|。|$)/g, type: 'problem' },
  { pattern: /(?:解决方案|修好了|解决了|用.*解决)\s*[:：]?\s*(.{3,40}?)(?:\.|,|，|。|$)/g, type: 'solution' },
];

/**
 * 关系提取模式
 */
const SEMANTIC_RELATION_PATTERNS: Array<{ pattern: RegExp; relation: SemanticRelationType }> = [
  { pattern: /(\S+)\s*(?:是一种|是个|就是)\s*(\S+)/, relation: 'is-a' },
  { pattern: /(\S+)\s*(?:的一部分|包含在|属于)\s*(\S+)/, relation: 'part-of' },
  { pattern: /(\S+)\s*(?:依赖|需要|基于)\s*(\S+)/, relation: 'depends-on' },
  { pattern: /(\S+)\s*(?:导致|引起|触发)\s*(\S+)/, relation: 'causes' },
  { pattern: /(\S+)\s*(?:解决|修复|处理)\s*(\S+)/, relation: 'solves' },
  { pattern: /(\S+)\s*(?:替代|取代|代替)\s*(\S+)/, relation: 'alternative-to' },
  { pattern: /(\S+)\s*(?:先于|在.*之前|之后才是)\s*(\S+)/, relation: 'precedes' },
  { pattern: /(\S+)\s*(?:产生|生成|输出)\s*(\S+)/, relation: 'produces' },
];

/**
 * 创建空的语义记忆网络
 */
export function createEmptySemanticNetwork(): SemanticMemoryNetwork {
  return {
    concepts: new Map(),
    relations: [],
    pendingClarifications: [],
  };
}

/**
 * 从消息中提取语义概念
 */
export function extractConceptsFromMessage(
  message: string,
  network: SemanticMemoryNetwork,
): SemanticConcept[] {
  const extracted: SemanticConcept[] = [];
  const now = Date.now();

  for (const { pattern, type } of CONCEPT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(message)) !== null) {
      const name = match[1].trim();
      if (name.length < 2 || name.length > 60) continue;

      const existing = network.concepts.get(name);
      if (existing) {
        existing.mentions++;
        existing.isolated = false;
        extracted.push(existing);
      } else {
        const concept: SemanticConcept = {
          name,
          type,
          definition: '',
          firstContext: message.slice(Math.max(0, match.index - 20), match.index + match[0].length + 20),
          mentions: 1,
          firstMentioned: now,
          isolated: true,
        };
        network.concepts.set(name, concept);
        extracted.push(concept);
      }
    }
  }

  return extracted;
}

/**
 * 从消息中提取语义关系
 */
export function extractSemanticRelations(
  message: string,
  network: SemanticMemoryNetwork,
): SemanticRelation[] {
  const extracted: SemanticRelation[] = [];

  for (const { pattern, relation } of SEMANTIC_RELATION_PATTERNS) {
    const match = pattern.exec(message);
    if (!match) continue;

    const from = match[1].trim();
    const to = match[2].trim();

    if (from === to || from.length < 2 || to.length < 2) continue;

    const alreadyExists = network.relations.some(
      r => r.from === from && r.to === to && r.relation === relation,
    );

    if (!alreadyExists) {
      if (!network.concepts.has(from)) {
        network.concepts.set(from, {
          name: from, type: 'technology', definition: '',
          firstContext: message.slice(0, 60), mentions: 1, firstMentioned: Date.now(), isolated: false,
        });
      }
      if (!network.concepts.has(to)) {
        network.concepts.set(to, {
          name: to, type: 'technology', definition: '',
          firstContext: message.slice(0, 60), mentions: 1, firstMentioned: Date.now(), isolated: false,
        });
      }

      const fromConcept = network.concepts.get(from)!;
      const toConcept = network.concepts.get(to)!;
      fromConcept.isolated = false;
      toConcept.isolated = false;

      const rel: SemanticRelation = {
        from, to, relation, confidence: 0.8, source: 'explicit',
      };
      network.relations.push(rel);
      extracted.push(rel);
    }
  }

  return extracted;
}

/**
 * 检测孤立节点并生成补全问题
 */
export function detectIsolatedConcepts(
  network: SemanticMemoryNetwork,
  maxQuestions: number = 3,
): Array<{ concept: string; question: string }> {
  const questions: Array<{ concept: string; question: string }> = [];
  const connected = new Set<string>();

  for (const rel of network.relations) {
    connected.add(rel.from);
    connected.add(rel.to);
  }

  for (const [name, concept] of network.concepts) {
    if (connected.has(name)) continue;
    if (concept.mentions < 2) continue;
    if (questions.length >= maxQuestions) break;

    const typeLabel: Record<ConceptType, string> = {
      technology: '技术', pattern: '模式', domain: '领域',
      resource: '资源', problem: '问题', solution: '方案', metric: '指标',
    };

    questions.push({
      concept: name,
      question: `你提到的${typeLabel[concept.type] ?? '概念'}"${name}"——它和你之前讨论的内容有什么关系？`,
    });
  }

  network.pendingClarifications = questions;
  return questions;
}

/**
 * 推断隐式关系（基于共现和类型）
 */
export function inferImplicitRelations(network: SemanticMemoryNetwork): SemanticRelation[] {
  const inferred: SemanticRelation[] = [];
  const conceptNames = Array.from(network.concepts.keys());
  const relationMap = new Set(
    network.relations.map(r => `${r.from}->${r.to}:${r.relation}`),
  );

  for (let i = 0; i < conceptNames.length; i++) {
    const a = network.concepts.get(conceptNames[i])!;

    // Technology co-occurrence → related-to
    if (a.type === 'technology') {
      for (let j = i + 1; j < conceptNames.length; j++) {
        const b = network.concepts.get(conceptNames[j])!;
        if (b.type !== 'technology') continue;

        const key = `${a.name}->${b.name}:related-to`;
        if (relationMap.has(key)) continue;

        if (a.firstContext.includes(b.name) || b.firstContext.includes(a.name)) {
          const rel: SemanticRelation = {
            from: a.name, to: b.name, relation: 'related-to',
            confidence: 0.5, source: 'inferred',
          };
          network.relations.push(rel);
          inferred.push(rel);
          relationMap.add(key);
          a.isolated = false;
          b.isolated = false;
        }
      }
    }

    // Problem + Solution co-occurrence → solves
    if (a.type === 'problem') {
      for (const bName of conceptNames) {
        const b = network.concepts.get(bName)!;
        if (b.type !== 'solution') continue;
        const key = `${b.name}->${a.name}:solves`;
        if (relationMap.has(key)) continue;
        if (a.firstContext.includes(b.name) || b.firstContext.includes(a.name)) {
          const rel: SemanticRelation = {
            from: b.name, to: a.name, relation: 'solves',
            confidence: 0.4, source: 'inferred',
          };
          network.relations.push(rel);
          inferred.push(rel);
          relationMap.add(key);
          a.isolated = false;
          b.isolated = false;
        }
      }
    }
  }

  return inferred;
}

/**
 * 格式化语义网络摘要（用于 prompt 注入）
 */
export function formatSemanticNetworkSummary(network: SemanticMemoryNetwork): string {
  if (network.concepts.size === 0) return '';

  const parts: string[] = [];

  const topConcepts = Array.from(network.concepts.values())
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 10);

  if (topConcepts.length > 0) {
    parts.push('核心概念:');
    for (const c of topConcepts) {
      const marker = c.isolated ? ' [孤立]' : '';
      parts.push(`  ${c.name} (${c.type}, ${c.mentions}次${marker})`);
    }
  }

  const explicitRels = network.relations.filter(r => r.confidence >= 0.6);
  if (explicitRels.length > 0) {
    parts.push('概念关系:');
    for (const r of explicitRels.slice(0, 8)) {
      const conf = r.source === 'inferred' ? ` (${(r.confidence * 100).toFixed(0)}%推断)` : '';
      parts.push(`  ${r.from} —[${r.relation}]→ ${r.to}${conf}`);
    }
  }

  if (network.pendingClarifications.length > 0) {
    parts.push('待澄清:');
    for (const q of network.pendingClarifications) {
      parts.push(`  ${q.question}`);
    }
  }

  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// Waypoint 87: Adaptive Response Timing — 自适应响应时机
// ═══════════════════════════════════════════════════════════════

/**
 * 响应时机策略
 */
export type ResponseTimingStrategy =
  | 'immediate'     // 简单问题，直接回答
  | 'thoughtful'    // 需要思考，结构化回答
  | 'deep-research' // 复杂问题，先检索再回答
  | 'proactive';    // 主动补全/预取

/**
 * 响应时机评估结果
 */
export interface ResponseTimingAssessment {
  strategy: ResponseTimingStrategy;
  /** 0-1 复杂度评分 */
  complexity: number;
  /** 建议的回答结构 */
  suggestedStructure: string;
  /** 建议的最大回答长度 */
  suggestedMaxLength: number;
  /** 预加载建议（需要提前检索的上下文） */
  prefetchHints: string[];
  /** 时机理由 */
  reason: string;
}

/**
 * 输入复杂度信号
 */
const COMPLEXITY_SIGNALS = {
  high: [
    /架构|设计|重构|迁移|优化性能|安全策略/i,
    /如何实现|怎么设计|最佳实践|方案对比/i,
    /多个|所有|全部|批量|整体/i,
    /比较|对比|权衡|trade.?off/i,
  ],
  medium: [
    /为什么|原理|机制|底层|内部/i,
    /调试|debug|排查|诊断|分析/i,
    /配置|设置|部署|上线/i,
  ],
  low: [
    /是什么|什么是|定义|意思/i,
    /怎么用|语法|参数|用法/i,
  ],
};

/**
 * 评估输入复杂度
 */
export function assessInputComplexity(input: string): number {
  let score = 0.3; // 基础分

  // 长度信号
  if (input.length > 200) score += 0.15;
  if (input.length > 500) score += 0.1;

  // 高复杂度信号
  for (const pattern of COMPLEXITY_SIGNALS.high) {
    if (pattern.test(input)) { score += 0.15; break; }
  }

  // 中复杂度信号
  for (const pattern of COMPLEXITY_SIGNALS.medium) {
    if (pattern.test(input)) { score += 0.15; break; }
  }

  // 多意图信号
  const semicolons = (input.match(/[;；，,]/g) || []).length;
  if (semicolons >= 3) score += 0.1;

  // 代码块信号
  if (/```|`[^`]+`/.test(input)) score += 0.1;

  return Math.min(1, score);
}

/**
 * 根据复杂度推断响应结构
 */
function inferResponseStructure(complexity: number, input: string): string {
  if (complexity > 0.7) {
    if (/比较|对比|权衡|方案/.test(input)) return '对比分析：列出各方案的优缺点，给出推荐';
    if (/架构|设计|实现/.test(input)) return '分层回答：概述 → 详细设计 → 实现步骤 → 注意事项';
    return '结构化回答：背景分析 → 核心要点 → 实施建议 → 潜在风险';
  }
  if (complexity > 0.4) {
    if (/为什么|原理/.test(input)) return '原理解析：问题定义 → 原因分析 → 示例说明';
    if (/调试|排查|debug/.test(input)) return '排查路径：现象 → 可能原因 → 排查步骤';
    return '分步回答：直接给答案，必要时展开细节';
  }
  return '直接回答：简洁明了，一句话说清楚';
}

/**
 * 生成预加载建议
 */
export function generatePrefetchHints(
  input: string,
  complexity: number,
): string[] {
  const hints: string[] = [];

  if (/性能|优化|慢|卡|延迟/.test(input)) {
    hints.push('metrics:recent — 最近性能指标');
    hints.push('tools:execution-stats — 工具执行统计');
  }
  if (/架构|设计|模块|组件/.test(input)) {
    hints.push('memory:architecture-decisions — 架构决策记录');
    hints.push('knowledge-graph:related-modules — 相关模块关系');
  }
  if (/错误|异常|报错|bug|fail/.test(input)) {
    hints.push('tool-patterns:recent-failures — 近期失败模式');
    hints.push('lessons:relevant — 相关教训');
  }
  if (/部署|上线|发布|release/.test(input)) {
    hints.push('goals:active — 活跃目标列表');
    hints.push('memory:deployment-history — 部署历史');
  }

  if (complexity > 0.6 && hints.length === 0) {
    hints.push('context:recent — 最近对话上下文');
  }

  return hints;
}

/**
 * 评估响应时机策略
 */
export function assessResponseTiming(
  input: string,
  flowPattern?: string,
  fatigueLevel?: number,
): ResponseTimingAssessment {
  const complexity = assessInputComplexity(input);
  const prefetchHints = generatePrefetchHints(input, complexity);
  const suggestedStructure = inferResponseStructure(complexity, input);

  let strategy: ResponseTimingStrategy;
  let suggestedMaxLength: number;
  let reason: string;

  // 疲劳状态降低响应复杂度
  const fatigueAdj = (fatigueLevel ?? 0) > 0.6 ? -0.15 : 0;

  const adjustedComplexity = Math.max(0, Math.min(1, complexity + fatigueAdj));

  if (adjustedComplexity > 0.7) {
    strategy = 'deep-research';
    suggestedMaxLength = 2000;
    reason = `高复杂度(${(complexity * 100).toFixed(0)}%)需要深度分析和结构化回答`;
  } else if (adjustedComplexity > 0.4) {
    strategy = 'thoughtful';
    suggestedMaxLength = 1200;
    reason = `中等复杂度(${(complexity * 100).toFixed(0)}%)需要有条理的回答`;
  } else {
    // 检查是否可以主动补全
    if (flowPattern === 'question-answer' || flowPattern === 'explore-deepen-implement') {
      strategy = 'proactive';
      suggestedMaxLength = 600;
      reason = `简单问题，但可以预判后续需求并主动提供`;
    } else {
      strategy = 'immediate';
      suggestedMaxLength = 400;
      reason = `简单问题，直接回答即可`;
    }
  }

  return {
    strategy,
    complexity,
    suggestedStructure,
    suggestedMaxLength,
    prefetchHints,
    reason,
  };
}

/**
 * 格式化时机指导（用于 prompt 注入）
 */
export function formatTimingGuidance(assessment: ResponseTimingAssessment): string {
  const parts: string[] = [];

  parts.push(`策略: ${assessment.strategy}`);
  parts.push(`复杂度: ${(assessment.complexity * 100).toFixed(0)}%`);
  parts.push(`建议结构: ${assessment.suggestedStructure}`);
  parts.push(`建议长度: ≤${assessment.suggestedMaxLength}字`);

  if (assessment.prefetchHints.length > 0) {
    parts.push(`预加载: ${assessment.prefetchHints.join(', ')}`);
  }

  parts.push(`理由: ${assessment.reason}`);

  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// Waypoint 88: Conversation Summary Compression — 对话摘要压缩
// ═══════════════════════════════════════════════════════════════

/**
 * 摘要中保留的信息类型
 */
export type SummaryItemType =
  | 'decision'     // 用户或 Agent 做出的决策
  | 'error'        // 遇到的错误/问题
  | 'solution'     // 找到的解决方案
  | 'code-change'  // 代码变更（文件、函数名）
  | 'requirement'  // 需求/约束条件
  | 'fact'         // 关键事实/数据点
  | 'action';      // 执行的动作/工具调用

/**
 * 摘要条目
 */
export interface SummaryItem {
  type: SummaryItemType;
  content: string;
  /** 来源轮次索引 */
  turnIndex: number;
  /** 重要性 0-1 */
  importance: number;
}

/**
 * 对话摘要
 */
export interface ConversationSummary {
  /** 压缩前的轮次范围 */
  originalRange: { from: number; to: number };
  /** 压缩后的摘要条目 */
  items: SummaryItem[];
  /** 话题标签 */
  topics: string[];
  /** 生成时间 */
  createdAt: number;
}

/**
 * 决策检测模式
 */
const DECISION_PATTERNS = [
  /(?:决定|选择|确定|用|采用|采用.*方案)\s*[:：]?\s*(.{5,80})/i,
  /(?:we'?ll|let's|decided to|chose to|going with)\s+(.{5,80})/i,
];

/**
 * 错误检测模式
 */
const SUMMARY_ERROR_PATTERNS = [
  /(?:错误|异常|报错|失败|error|fail|exception)\s*[:：]?\s*(.{3,80})/i,
  /(?:cannot|can't|unable to|doesn't|won't)\s+(.{3,60})/i,
];

/**
 * 解决方案检测模式
 */
const SOLUTION_PATTERNS = [
  /(?:解决了|修好了|修复了|搞定了|现在可以|success|fixed|resolved)\s*[:：]?\s*(.{3,80})/i,
  /(?:用.*方案|通过.*方式|修改.*后)\s*(.{3,60})/i,
];

/**
 * 代码变更检测模式
 */
const CODE_CHANGE_PATTERNS = [
  /(?:修改|编辑|更新|新增|删除|创建)\s*(?:了|了文件)?\s*([A-Za-z0-9_./\-]+\.\w+)/i,
  /(?:在|往|给)\s*([A-Za-z0-9_./\-]+\.\w+)\s*(?:中|里|添加|写入)/i,
];

/**
 * 需求检测模式
 */
const REQUIREMENT_PATTERNS = [
  /(?:需要|必须|要求|不能|不要|应该|must|should|need to|require)\s*(.{5,80})/i,
  /(?:约束|限制|前提|条件|假设)\s*[:：]?\s*(.{3,60})/i,
];

/**
 * 从消息中提取摘要条目
 */
export function extractSummaryItems(
  messages: Array<{ role: string; content: string }>,
  startTurn: number = 0,
): SummaryItem[] {
  const items: SummaryItem[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const turnIndex = startTurn + i;
    const content = msg.content;

    // 决策
    for (const pattern of DECISION_PATTERNS) {
      const match = pattern.exec(content);
      if (match) {
        items.push({
          type: 'decision',
          content: match[1].trim().slice(0, 120),
          turnIndex,
          importance: msg.role === 'user' ? 0.8 : 0.6,
        });
      }
    }

    // 错误
    for (const pattern of SUMMARY_ERROR_PATTERNS) {
      const match = pattern.exec(content);
      if (match) {
        items.push({
          type: 'error',
          content: match[1].trim().slice(0, 120),
          turnIndex,
          importance: 0.75,
        });
      }
    }

    // 解决方案
    for (const pattern of SOLUTION_PATTERNS) {
      const match = pattern.exec(content);
      if (match) {
        items.push({
          type: 'solution',
          content: match[1].trim().slice(0, 120),
          turnIndex,
          importance: 0.7,
        });
      }
    }

    // 代码变更
    for (const pattern of CODE_CHANGE_PATTERNS) {
      const match = pattern.exec(content);
      if (match) {
        items.push({
          type: 'code-change',
          content: match[1].trim(),
          turnIndex,
          importance: 0.65,
        });
      }
    }

    // 需求
    for (const pattern of REQUIREMENT_PATTERNS) {
      const match = pattern.exec(content);
      if (match && msg.role === 'user') {
        items.push({
          type: 'requirement',
          content: match[1].trim().slice(0, 120),
          turnIndex,
          importance: 0.85,
        });
      }
    }

    // 关键事实：包含数字或版本号的语句
    const factMatch = /(?:版本|大小|数量|频率|阈值|version|size|count|threshold)\s*[:：]?\s*(\S+)/i.exec(content);
    if (factMatch) {
      items.push({
        type: 'fact',
        content: factMatch[0].trim().slice(0, 80),
        turnIndex,
        importance: 0.5,
      });
    }
  }

  return items;
}

/**
 * 去重摘要条目（相似内容合并）
 */
export function deduplicateSummaryItems(items: SummaryItem[]): SummaryItem[] {
  const seen = new Map<string, SummaryItem>();
  const result: SummaryItem[] = [];

  for (const item of items) {
    // 简单去重键：type + 内容前 30 字符
    const key = `${item.type}:${item.content.slice(0, 30).toLowerCase()}`;
    const existing = seen.get(key);
    if (existing) {
      // 保留更高重要性的
      if (item.importance > existing.importance) {
        const idx = result.indexOf(existing);
        result[idx] = item;
        seen.set(key, item);
      }
    } else {
      seen.set(key, item);
      result.push(item);
    }
  }

  return result;
}

/**
 * 从消息中提取话题标签
 */
export function extractTopicsFromMessages(
  messages: Array<{ role: string; content: string }>,
): string[] {
  const topicPatterns: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /(?:数据库|database|sql|查询|表|索引)/i, label: 'database' },
    { pattern: /(?:API|接口|endpoint|路由|请求|响应)/i, label: 'api' },
    { pattern: /(?:部署|deploy|CI|CD|pipeline|发布)/i, label: 'deployment' },
    { pattern: /(?:测试|test|spec|coverage|mock)/i, label: 'testing' },
    { pattern: /(?:性能|performance|优化|缓存|延迟)/i, label: 'performance' },
    { pattern: /(?:安全|security|auth|加密|权限)/i, label: 'security' },
    { pattern: /(?:架构|architecture|设计|模块|组件)/i, label: 'architecture' },
    { pattern: /(?:错误|bug|debug|排查|修复)/i, label: 'debugging' },
  ];

  const allText = messages.map(m => m.content).join(' ');
  return topicPatterns
    .filter(tp => tp.pattern.test(allText))
    .map(tp => tp.label);
}

/**
 * 生成对话摘要
 */
export function generateConversationSummary(
  messages: Array<{ role: string; content: string }>,
  startTurn: number = 0,
): ConversationSummary {
  const rawItems = extractSummaryItems(messages, startTurn);
  const items = deduplicateSummaryItems(rawItems)
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 15);

  const topics = extractTopicsFromMessages(messages);

  return {
    originalRange: { from: startTurn, to: startTurn + messages.length - 1 },
    items,
    topics,
    createdAt: Date.now(),
  };
}

/**
 * 格式化对话摘要（用于 prompt 注入）
 */
export function formatConversationSummary(summary: ConversationSummary): string {
  if (summary.items.length === 0) return '';

  const parts: string[] = [];

  if (summary.topics.length > 0) {
    parts.push(`话题: ${summary.topics.join(', ')}`);
  }

  parts.push(`轮次 ${summary.originalRange.from}-${summary.originalRange.to} 摘要:`);

  for (const item of summary.items) {
    const typeLabel: Record<SummaryItemType, string> = {
      decision: '决策', error: '错误', solution: '解决',
      'code-change': '代码', requirement: '需求', fact: '事实', action: '动作',
    };
    parts.push(`  [${typeLabel[item.type]}] ${item.content}`);
  }

  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// Waypoint 89: Response Self-Correction Validator — 响应自校正
// ═══════════════════════════════════════════════════════════════

/**
 * 校正问题类型
 */
export type CorrectionType =
  | 'missed-intent'       // 遗漏子意图
  | 'constraint-violation' // 违反用户约束
  | 'missing-answer'      // 未回答问题
  | 'stale-reference'     // 引用过时信息
  | 'inconsistency';      // 自相矛盾

/**
 * 校正条目
 */
export interface CorrectionItem {
  type: CorrectionType;
  description: string;
  /** 建议的修正动作 */
  suggestion: string;
  /** 严重度 0-1 */
  severity: number;
}

/**
 * 校正结果
 */
export interface CorrectionResult {
  items: CorrectionItem[];
  overallScore: number;
}

/**
 * 检测遗漏的子意图
 */
export function detectMissedIntents(
  userInput: string,
  response: string,
): CorrectionItem[] {
  const items: CorrectionItem[] = [];

  // 提取用户输入中的问题
  const questions: string[] = [];
  const qPatterns = [
    /(?:怎么|如何|为什么|什么|哪|when|where|how|why|what|which).{2,30}?[?？]/gi,
    /\d+[.、)]\s*.{3,40}/g,
  ];

  for (const pattern of qPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(userInput)) !== null) {
      questions.push(match[0]);
    }
  }

  if (questions.length >= 2 && response.length < 200 * questions.length) {
    items.push({
      type: 'missed-intent',
      description: `用户提出了 ${questions.length} 个问题，但回答可能不完整`,
      suggestion: '检查是否所有问题都已回答',
      severity: 0.6,
    });
  }

  return items;
}

/**
 * 检测约束违反
 */
export function detectConstraintViolations(
  userInput: string,
  response: string,
): CorrectionItem[] {
  const items: CorrectionItem[] = [];

  const constraintPatterns = [
    /(?:不能|不要|不可以|禁止|别用|avoid|don't|must not|never)\s*(.{2,40})/gi,
    /(?:只用|只能|必须用|只支持|only|must use)\s*(.{2,40})/gi,
  ];

  const constraints: string[] = [];
  for (const pattern of constraintPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(userInput)) !== null) {
      constraints.push(match[1].trim().toLowerCase());
    }
  }

  for (const constraint of constraints) {
    const constraintWords = constraint.split(/[,，、\s]+/).filter(w => w.length > 1);
    if (constraintWords.some(w => response.toLowerCase().includes(w.toLowerCase()))) {
      items.push({
        type: 'constraint-violation',
        description: `响应可能违反了用户约束: "${constraint}"`,
        suggestion: `确认响应是否遵守了"${constraint}"的约束`,
        severity: 0.8,
      });
    }
  }

  return items;
}

/**
 * 检测未回答的问题
 */
export function detectMissingAnswers(
  userInput: string,
  response: string,
): CorrectionItem[] {
  const items: CorrectionItem[] = [];

  const sentences = userInput.split(/[。.!！\n]+/).filter(s => s.trim());
  const questions = sentences.filter(s => /[?？]$/.test(s.trim()));

  if (questions.length === 0) return items;

  for (const q of questions) {
    const keywords = q.replace(/[?？]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2);

    const mentioned = keywords.some(kw => response.includes(kw));
    if (!mentioned && keywords.length > 0) {
      items.push({
        type: 'missing-answer',
        description: `可能未回答: "${q.trim().slice(0, 60)}"`,
        suggestion: '在下一轮补充这个回答',
        severity: 0.5,
      });
    }
  }

  return items;
}

/**
 * 检测自相矛盾
 */
export function detectInconsistencies(response: string): CorrectionItem[] {
  const items: CorrectionItem[] = [];

  const butPattern = /(.{10,40})但是(.{10,40})/g;
  let match: RegExpExecArray | null;
  while ((match = butPattern.exec(response)) !== null) {
    const before = match[1];
    const after = match[2];
    const positive = /好|可以|正确|成功|没问题|ok|fine|works/;
    const beforePositive = positive.test(before);
    const afterPositive = positive.test(after);
    if (beforePositive === afterPositive && before.length > 5 && after.length > 5) {
      items.push({
        type: 'inconsistency',
        description: `可能的自相矛盾: "...${before.slice(-20)}但是${after.slice(0, 20)}..."`,
        suggestion: '检查前后表述是否一致',
        severity: 0.4,
      });
    }
  }

  return items;
}

/**
 * 综合校正验证
 */
export function validateResponse(
  userInput: string,
  response: string,
): CorrectionResult {
  const items: CorrectionItem[] = [
    ...detectMissedIntents(userInput, response),
    ...detectConstraintViolations(userInput, response),
    ...detectMissingAnswers(userInput, response),
    ...detectInconsistencies(response),
  ];

  items.sort((a, b) => b.severity - a.severity);

  const penalty = items.reduce((sum, item) => sum + item.severity * 0.2, 0);
  const overallScore = Math.max(0, Math.min(1, 1 - penalty));

  return { items, overallScore };
}

/**
 * 格式化校正结果（用于 prompt 注入）
 */
export function formatCorrectionResult(result: CorrectionResult): string {
  if (result.items.length === 0) return '';

  const parts: string[] = [];
  parts.push(`自校正评分: ${(result.overallScore * 100).toFixed(0)}%`);

  for (const item of result.items.slice(0, 5)) {
    const severityLabel = item.severity > 0.7 ? '⚠' : 'ℹ';
    parts.push(`${severityLabel} [${item.type}] ${item.description}`);
    if (item.suggestion) {
      parts.push(`  → ${item.suggestion}`);
    }
  }

  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// Waypoint 90: Context Window Budget Optimizer — 预算优化器
// ═══════════════════════════════════════════════════════════════

/**
 * Section 预算分配
 */
export interface SectionBudget {
  prefix: string;
  /** 分配的字符预算 */
  charBudget: number;
  /** 实际字符数 */
  actualChars: number;
  /** 权重分数 */
  weight: number;
  /** 操作: 'keep' | 'truncate' | 'drop' */
  action: 'keep' | 'truncate' | 'drop';
}

/**
 * 预算分配结果
 */
export interface BudgetAllocation {
  sections: SectionBudget[];
  totalBudget: number;
  totalUsed: number;
  utilization: number;
}

/**
 * Section 预算优先级（固定权重，可被 learned offsets 调整）
 */
const SECTION_BUDGET_WEIGHTS: Record<string, number> = {
  'You have ': 0.15,           // Identity — 始终高优先级
  'DREAM INSIGHTS': 0.03,
  'META-COGNITION': 0.04,
  'ATTENTION STATE': 0.03,
  'RESPONSE STRATEGY': 0.04,
  'PRELOADED CONTEXT': 0.04,
  'TOOL PERFORMANCE': 0.04,
  'TOOL FAILURE PATTERNS': 0.03,
  'LEARNED BEHAVIORS': 0.03,
  'TEMPORAL CONTEXT': 0.03,
  'CONVERSATION FLOW': 0.03,
  'LENGTH PREFERENCE': 0.02,
  'TOOL PRIORITY': 0.03,
  'CONVERSATION HEALTH': 0.03,
  'MULTI-INTENT': 0.04,
  'INPUT AMBIGUITY': 0.04,
  'GOAL DEPENDENCIES': 0.03,
  'TOPIC TRANSITION': 0.02,
  'SUGGESTED ACTIONS': 0.04,
  'CONVERSATION RHYTHM': 0.02,
  'USER EXPERTISE': 0.02,
  'EMOTIONAL RESPONSE STRATEGY': 0.03,
  'PERCEPTION FUSION': 0.03,
  'RESTORED CONTEXT': 0.04,
  'STRATEGY COHERENCE': 0.03,
  'COGNITIVE STATE': 0.03,
  'COMPOSITE RESPONSE STRATEGY': 0.04,
  'INTENT EVOLUTION': 0.02,
  'STYLE GUIDANCE': 0.03,
  'KNOWLEDGE GRAPH': 0.03,
  'COGNITIVE FATIGUE': 0.03,
  'GAP RECOVERY': 0.04,
  'LEARNED LESSONS': 0.03,
  'RHYTHM ADAPTATION': 0.02,
  'INTENT DECOMPOSITION': 0.04,
  'SEMANTIC NETWORK': 0.03,
  'RESPONSE TIMING': 0.03,
  'CONVERSATION SUMMARY': 0.05,
  'SELF-CORRECTION': 0.04,
  'NEXT-TURN PREDICTION': 0.03,
  'META-FEEDBACK': 0.03,
  'TOOL CHAIN': 0.04,
  'MOMENTUM': 0.03,
  'PERSONA CALIBRATION': 0.04,
  'KNOWLEDGE GAPS': 0.03,
};

/** 最小保留预算（字符） */
const MIN_SECTION_BUDGET = 50;
/** 低权重阈值 — 低于此值可能被 drop */
const DROP_THRESHOLD = 0.02;

/**
 * 计算 section 实际字符数
 */
function getSectionLength(prompt: string, prefix: string): number {
  const startIdx = prompt.indexOf(prefix);
  if (startIdx === -1) return 0;

  // 找到下一个 section 的起始位置
  let endIdx = prompt.length;
  for (const otherPrefix of Object.keys(SECTION_BUDGET_WEIGHTS)) {
    if (otherPrefix === prefix) continue;
    const otherIdx = prompt.indexOf(otherPrefix, startIdx + prefix.length);
    if (otherIdx > startIdx && otherIdx < endIdx) {
      endIdx = otherIdx;
    }
  }

  return endIdx - startIdx;
}

/**
 * 分配 context window 预算
 */
export function allocateBudget(
  prompt: string,
  totalBudget: number,
  learnedOffsets?: Record<string, number>,
): BudgetAllocation {
  const sections: SectionBudget[] = [];

  // 收集活跃 sections
  const activePrefixes = Object.keys(SECTION_BUDGET_WEIGHTS)
    .filter(prefix => prompt.includes(prefix));

  if (activePrefixes.length === 0) {
    return { sections: [], totalBudget, totalUsed: 0, utilization: 0 };
  }

  // 计算调整后权重
  const adjustedWeights: Record<string, number> = {};
  let totalWeight = 0;

  for (const prefix of activePrefixes) {
    const base = SECTION_BUDGET_WEIGHTS[prefix] ?? 0.03;
    const offset = learnedOffsets?.[prefix] ?? 0;
    const adjusted = Math.max(0.01, base + offset);
    adjustedWeights[prefix] = adjusted;
    totalWeight += adjusted;
  }

  // 按权重比例分配预算
  let totalUsed = 0;

  for (const prefix of activePrefixes) {
    const weight = adjustedWeights[prefix];
    const ratio = weight / totalWeight;
    const charBudget = Math.max(MIN_SECTION_BUDGET, Math.floor(totalBudget * ratio));
    const actualChars = getSectionLength(prompt, prefix);

    let action: 'keep' | 'truncate' | 'drop';
    if (actualChars <= charBudget) {
      action = 'keep';
    } else if (weight < DROP_THRESHOLD && actualChars > charBudget * 3) {
      action = 'drop';
    } else {
      action = 'truncate';
    }

    const effectiveBudget = action === 'drop' ? 0 : charBudget;
    totalUsed += Math.min(actualChars, effectiveBudget);

    sections.push({
      prefix,
      charBudget: effectiveBudget,
      actualChars,
      weight,
      action,
    });
  }

  return {
    sections,
    totalBudget,
    totalUsed,
    utilization: totalBudget > 0 ? totalUsed / totalBudget : 0,
  };
}

/**
 * 按预算裁剪 prompt
 */
export function pruneByBudget(prompt: string, allocation: BudgetAllocation): string {
  let result = prompt;

  for (const section of allocation.sections) {
    if (section.action === 'drop') {
      // 移除整个 section
      const startIdx = result.indexOf(section.prefix);
      if (startIdx === -1) continue;

      let endIdx = result.length;
      for (const other of allocation.sections) {
        if (other.prefix === section.prefix) continue;
        const otherIdx = result.indexOf(other.prefix, startIdx + section.prefix.length);
        if (otherIdx > startIdx && otherIdx < endIdx) {
          endIdx = otherIdx;
        }
      }

      result = result.slice(0, startIdx) + result.slice(endIdx);
    } else if (section.action === 'truncate') {
      const startIdx = result.indexOf(section.prefix);
      if (startIdx === -1) continue;

      const endIdx = Math.min(startIdx + section.charBudget, result.length);
      // 找下一个 section 起始
      let nextSectionIdx = result.length;
      for (const other of allocation.sections) {
        if (other.prefix === section.prefix) continue;
        const otherIdx = result.indexOf(other.prefix, startIdx + section.prefix.length);
        if (otherIdx > startIdx && otherIdx < nextSectionIdx) {
          nextSectionIdx = otherIdx;
        }
      }

      const actualEnd = Math.min(endIdx, nextSectionIdx);
      if (actualEnd < nextSectionIdx) {
        result = result.slice(0, actualEnd) + '...' + result.slice(nextSectionIdx);
      }
    }
  }

  return result;
}

/**
 * 下一轮意图预测
 */

/** 意图转换概率矩阵 — 统计 A→B 的转换频率 */
type IntentTransitionMatrix = Record<string, Record<string, number>>;

/** 预测结果 */
export interface NextTurnPrediction {
  /** 预测的意图类别 */
  predictedCategory: IntentCategory;
  /** 置信度 0-1 */
  confidence: number;
  /** 推荐的响应准备动作 */
  preparations: string[];
  /** 依据 */
  reasoning: string;
}

// 意图转换先验 — 基于常见开发对话模式
const INTENT_TRANSITION_PRIORS: IntentTransitionMatrix = {
  question: { debug: 0.25, feature: 0.15, learn: 0.20, config: 0.10, review: 0.10, general: 0.20 },
  debug: { debug: 0.30, question: 0.15, feature: 0.10, config: 0.15, review: 0.10, refactor: 0.10, deploy: 0.10 },
  feature: { feature: 0.25, question: 0.15, debug: 0.15, config: 0.10, review: 0.15, refactor: 0.10, deploy: 0.10 },
  refactor: { review: 0.25, debug: 0.15, feature: 0.15, question: 0.15, deploy: 0.15, config: 0.15 },
  learn: { question: 0.25, feature: 0.20, config: 0.15, debug: 0.10, review: 0.15, general: 0.15 },
  config: { config: 0.20, feature: 0.15, debug: 0.20, question: 0.15, deploy: 0.15, review: 0.15 },
  review: { deploy: 0.20, debug: 0.15, refactor: 0.15, feature: 0.15, question: 0.15, review: 0.20 },
  deploy: { debug: 0.25, config: 0.15, review: 0.20, feature: 0.10, question: 0.15, deploy: 0.15 },
  general: { question: 0.25, feature: 0.20, debug: 0.15, config: 0.10, learn: 0.15, general: 0.15 },
};

// 类别对应的准备动作
const CATEGORY_PREPARATIONS: Record<IntentCategory, string[]> = {
  question: ['预加载相关文档', '准备解释性示例'],
  debug: ['预加载错误模式', '准备诊断步骤', '加载最近代码变更'],
  feature: ['预加载相关架构', '准备实现模板', '加载依赖关系'],
  refactor: ['预加载代码结构', '准备重构模式'],
  learn: ['预加载概念定义', '准备渐进式解释'],
  config: ['预加载配置模板', '准备环境检查'],
  review: ['预加载代码规范', '准备检查清单'],
  deploy: ['预加载部署配置', '准备健康检查脚本'],
  general: [],
};

// 知识图谱实体类别与意图的关联
const ENTITY_INTENT_MAP: Record<string, IntentCategory> = {
  error: 'debug',
  file: 'feature',
  module: 'refactor',
  concept: 'learn',
  tool: 'config',
};

/**
 * 从 intent evolution 和 knowledge graph 预测下一轮意图
 */
export function predictNextIntent(
  intentHistory: IntentNode[],
  knowledgeEntities: Array<{ type: string; name: string; mentionCount: number }>,
  flowPattern?: string,
): NextTurnPrediction {
  if (intentHistory.length === 0) {
    return {
      predictedCategory: 'general',
      confidence: 0.1,
      preparations: [],
      reasoning: '无意图历史，无法预测',
    };
  }

  const lastIntent = intentHistory[intentHistory.length - 1];
  const lastCategory = lastIntent.category;

  // === 信号 1: 转移概率 ===
  const priors = INTENT_TRANSITION_PRIORS[lastCategory] ?? INTENT_TRANSITION_PRIORS.general;
  const transitionScores: Record<string, number> = { ...priors };

  // === 信号 2: 实际历史转换频率 ===
  if (intentHistory.length >= 3) {
    const recentTransitions: Record<string, Record<string, number>> = {};
    for (let i = 1; i < intentHistory.length; i++) {
      const from = intentHistory[i - 1].category;
      const to = intentHistory[i].category;
      if (!recentTransitions[from]) recentTransitions[from] = {};
      recentTransitions[from][to] = (recentTransitions[from][to] ?? 0) + 1;
    }

    const observedFromLast = recentTransitions[lastCategory];
    if (observedFromLast) {
      const total = Object.values(observedFromLast).reduce((a, b) => a + b, 0);
      for (const [to, count] of Object.entries(observedFromLast)) {
        transitionScores[to] = (transitionScores[to] ?? 0) * 0.6 + (count / total) * 0.4;
      }
    }
  }

  // === 信号 3: 知识图谱实体影响 ===
  if (knowledgeEntities.length > 0) {
    const topEntities = knowledgeEntities
      .filter(e => e.mentionCount >= 2)
      .slice(0, 5);

    for (const entity of topEntities) {
      const mapped = ENTITY_INTENT_MAP[entity.type];
      if (mapped) {
        transitionScores[mapped] = (transitionScores[mapped] ?? 0) + 0.05 * entity.mentionCount;
      }
    }
  }

  // === 信号 4: Flow pattern 影响 ===
  if (flowPattern) {
    if (flowPattern.includes('debug')) {
      transitionScores.debug = (transitionScores.debug ?? 0) + 0.1;
      transitionScores.question = (transitionScores.question ?? 0) + 0.05;
    } else if (flowPattern.includes('explore')) {
      transitionScores.learn = (transitionScores.learn ?? 0) + 0.1;
      transitionScores.question = (transitionScores.question ?? 0) + 0.05;
    } else if (flowPattern.includes('implement')) {
      transitionScores.feature = (transitionScores.feature ?? 0) + 0.1;
      transitionScores.review = (transitionScores.review ?? 0) + 0.05;
    }
  }

  // 归一化并选出最佳
  const totalScore = Object.values(transitionScores).reduce((a, b) => a + b, 0);
  let bestCategory: IntentCategory = 'general';
  let bestScore = 0;

  for (const [cat, score] of Object.entries(transitionScores)) {
    const normalized = totalScore > 0 ? score / totalScore : 0;
    if (normalized > bestScore) {
      bestScore = normalized;
      bestCategory = cat as IntentCategory;
    }
  }

  const confidence = Math.min(0.9, bestScore * 2);
  const preparations = CATEGORY_PREPARATIONS[bestCategory] ?? [];
  const reasoning = buildPredictionReasoning(lastCategory, bestCategory, confidence, flowPattern);

  return {
    predictedCategory: bestCategory,
    confidence,
    preparations,
    reasoning,
  };
}

function buildPredictionReasoning(
  lastCategory: IntentCategory,
  predicted: IntentCategory,
  confidence: number,
  flowPattern?: string,
): string {
  const parts: string[] = [];
  parts.push(`当前意图: ${lastCategory}`);
  parts.push(`预测意图: ${predicted}`);
  parts.push(`置信度: ${(confidence * 100).toFixed(0)}%`);
  if (flowPattern) parts.push(`对话模式: ${flowPattern}`);
  if (lastCategory === predicted) parts.push('延续当前意图链');
  return parts.join(' | ');
}

/**
 * 格式化预测结果为 prompt section
 */
export function formatNextTurnPrediction(prediction: NextTurnPrediction): string {
  if (prediction.confidence < 0.3) return '';

  const lines: string[] = [];
  lines.push(`预测用户下一轮意图: ${prediction.predictedCategory} (${(prediction.confidence * 100).toFixed(0)}%)`);
  if (prediction.preparations.length > 0) {
    lines.push(`建议准备: ${prediction.preparations.join('、')}`);
  }
  lines.push(`依据: ${prediction.reasoning}`);
  return lines.join('\n');
}

/**
 * 跨模块认知反馈分析
 */

/** 模块间交互记录 */
export interface ModuleInteraction {
  sourceModule: string;
  targetModule: string;
  interactionType: 'amplify' | 'suppress' | 'trigger' | 'conflict';
  strength: number;
  timestamp: number;
}

/** 反馈分析结果 */
export interface CognitiveFeedbackAnalysis {
  /** 活跃交互链 */
  interactionChains: string[];
  /** 冲突的模块对 */
  conflicts: string[];
  /** 协同的模块对 */
  synergies: string[];
  /** 优化建议 */
  recommendations: string[];
  /** 整体认知健康度 0-1 */
  cognitiveHealth: number;
}

// 模块间已知交互规则
const MODULE_INTERACTIONS: Array<{
  source: string;
  target: string;
  type: 'amplify' | 'suppress' | 'trigger' | 'conflict';
  condition: string;
}> = [
  { source: 'fatigue', target: 'prediction', type: 'suppress', condition: 'high_fatigue' },
  { source: 'fatigue', target: 'timing', type: 'amplify', condition: 'high_fatigue' },
  { source: 'rhythm', target: 'style', type: 'amplify', condition: 'rapid_fire' },
  { source: 'rhythm', target: 'length', type: 'suppress', condition: 'rapid_fire' },
  { source: 'emotion', target: 'strategy', type: 'amplify', condition: 'high_arousal' },
  { source: 'expertise', target: 'timing', type: 'amplify', condition: 'expert' },
  { source: 'expertise', target: 'style', type: 'suppress', condition: 'beginner' },
  { source: 'health', target: 'prediction', type: 'suppress', condition: 'low_health' },
  { source: 'flow', target: 'prediction', type: 'amplify', condition: 'strong_pattern' },
  { source: 'correction', target: 'style', type: 'trigger', condition: 'issues_found' },
  { source: 'correction', target: 'timing', type: 'suppress', condition: 'low_score' },
  { source: 'knowledge', target: 'prediction', type: 'amplify', condition: 'rich_graph' },
  { source: 'budget', target: 'prediction', type: 'suppress', condition: 'tight_budget' },
];

/**
 * 分析跨模块认知反馈
 */
export function analyzeCrossModuleFeedback(
  activeModules: Record<string, { active: boolean; state?: string; score?: number }>,
): CognitiveFeedbackAnalysis {
  const interactionChains: string[] = [];
  const conflicts: string[] = [];
  const synergies: string[] = [];
  const recommendations: string[] = [];

  // 检测活跃的模块间交互
  for (const rule of MODULE_INTERACTIONS) {
    const sourceActive = activeModules[rule.source]?.active;
    const targetActive = activeModules[rule.target]?.active;
    if (!sourceActive || !targetActive) continue;

    const sourceState = activeModules[rule.source].state ?? '';
    const sourceScore = activeModules[rule.source].score ?? 0.5;

    // 检查条件是否满足
    const conditionMet = checkCondition(rule.condition, sourceState, sourceScore);
    if (!conditionMet) continue;

    const label = `${rule.source} → ${rule.target} (${rule.type})`;

    if (rule.type === 'conflict') {
      conflicts.push(label);
    } else if (rule.type === 'amplify' || rule.type === 'trigger') {
      synergies.push(label);
    }

    interactionChains.push(label);
  }

  // 检测冲突模块对
  const fatigueHigh = activeModules.fatigue?.score ?? 0 > 0.6;
  const healthLow = (activeModules.health?.score ?? 1) < 0.5;
  if (fatigueHigh && healthLow) {
    conflicts.push('fatigue + health: 双重压力降低响应质量');
  }

  const rhythmRapid = activeModules.rhythm?.state === 'rapid_fire';
  const timingDeep = activeModules.timing?.state === 'deep-research';
  if (rhythmRapid && timingDeep) {
    conflicts.push('rhythm + timing: 快节奏与深度研究冲突');
    recommendations.push('快速模式下建议降低研究深度');
  }

  // 计算认知健康度
  const activeCount = Object.values(activeModules).filter(m => m.active).length;
  const conflictRatio = conflicts.length / Math.max(1, interactionChains.length);
  const synergyRatio = synergies.length / Math.max(1, interactionChains.length);
  const cognitiveHealth = Math.max(0, Math.min(1,
    0.5 + synergyRatio * 0.3 - conflictRatio * 0.4 + Math.min(activeCount / 10, 0.2),
  ));

  // 生成优化建议
  if (fatigueHigh) recommendations.push('检测到认知疲劳，建议简化响应');
  if (conflictRatio > 0.3) recommendations.push('模块冲突率过高，建议降低低优先级模块灵敏度');
  if (activeCount > 15) recommendations.push('活跃模块过多，建议关闭低效用模块');

  return {
    interactionChains,
    conflicts,
    synergies,
    recommendations,
    cognitiveHealth,
  };
}

function checkCondition(condition: string, state: string, score: number): boolean {
  switch (condition) {
    case 'high_fatigue': return score > 0.6;
    case 'rapid_fire': return state === 'rapid_fire';
    case 'high_arousal': return score > 0.7;
    case 'expert': return state === 'expert';
    case 'beginner': return state === 'beginner';
    case 'low_health': return score < 0.5;
    case 'strong_pattern': return score > 0.6;
    case 'issues_found': return score < 0.7;
    case 'low_score': return score < 0.5;
    case 'rich_graph': return score > 0.3;
    case 'tight_budget': return score > 0.8;
    default: return false;
  }
}

/**
 * 格式化跨模块反馈分析为 prompt section
 */
export function formatCognitiveFeedback(analysis: CognitiveFeedbackAnalysis): string {
  if (analysis.interactionChains.length === 0) return '';

  const lines: string[] = [];
  lines.push(`认知健康度: ${(analysis.cognitiveHealth * 100).toFixed(0)}%`);

  if (analysis.synergies.length > 0) {
    lines.push(`协同: ${analysis.synergies.slice(0, 3).join('、')}`);
  }
  if (analysis.conflicts.length > 0) {
    lines.push(`冲突: ${analysis.conflicts.slice(0, 3).join('、')}`);
  }
  if (analysis.recommendations.length > 0) {
    lines.push(`建议: ${analysis.recommendations.join('、')}`);
  }

  return lines.join('\n');
}

/**
 * 自适应工具链编排
 */

/** 工具链建议 */
export interface ToolChainSuggestion {
  /** 目标意图 */
  targetIntent: IntentCategory;
  /** 推荐的工具链步骤 */
  steps: Array<{
    tool: string;
    purpose: string;
    optional: boolean;
  }>;
  /** 预估成功率 */
  estimatedSuccessRate: number;
  /** 依据 */
  reasoning: string;
}

// 意图→工具链模板（基于常见开发工作流）
const INTENT_TOOLCHAIN_TEMPLATES: Record<IntentCategory, Array<{ tool: string; purpose: string; optional: boolean }>> = {
  debug: [
    { tool: 'memory_recall', purpose: '检索相关错误历史', optional: false },
    { tool: 'code_search', purpose: '定位错误代码', optional: false },
    { tool: 'shell_exec', purpose: '复现/诊断错误', optional: true },
    { tool: 'code_search', purpose: '确认修复位置', optional: false },
  ],
  feature: [
    { tool: 'memory_recall', purpose: '检索相关架构决策', optional: false },
    { tool: 'code_search', purpose: '了解现有代码结构', optional: false },
    { tool: 'shell_exec', purpose: '运行测试验证', optional: true },
  ],
  refactor: [
    { tool: 'code_search', purpose: '分析需要重构的代码', optional: false },
    { tool: 'memory_recall', purpose: '检索重构模式', optional: false },
    { tool: 'code_search', purpose: '确认依赖关系', optional: true },
    { tool: 'shell_exec', purpose: '运行测试确保不破坏', optional: false },
  ],
  review: [
    { tool: 'code_search', purpose: '审查目标代码', optional: false },
    { tool: 'memory_recall', purpose: '检索代码规范', optional: false },
    { tool: 'shell_exec', purpose: '运行静态检查', optional: true },
  ],
  deploy: [
    { tool: 'shell_exec', purpose: '运行构建检查', optional: false },
    { tool: 'memory_recall', purpose: '检索部署配置', optional: false },
    { tool: 'shell_exec', purpose: '执行部署', optional: true },
  ],
  config: [
    { tool: 'memory_recall', purpose: '检索配置模板', optional: false },
    { tool: 'code_search', purpose: '查看当前配置', optional: false },
    { tool: 'shell_exec', purpose: '验证配置', optional: true },
  ],
  learn: [
    { tool: 'memory_recall', purpose: '检索相关概念', optional: false },
    { tool: 'code_search', purpose: '查看示例代码', optional: true },
  ],
  question: [
    { tool: 'memory_recall', purpose: '检索相关知识', optional: false },
    { tool: 'code_search', purpose: '查找具体实现', optional: true },
  ],
  general: [],
};

/**
 * 生成自适应工具链建议
 */
export function generateToolChainSuggestion(
  targetIntent: IntentCategory,
  availableTools: string[],
  learnedPatterns: ToolPattern[],
  lastToolUsed?: string,
): ToolChainSuggestion {
  const template = INTENT_TOOLCHAIN_TEMPLATES[targetIntent] ?? [];

  if (template.length === 0) {
    return {
      targetIntent,
      steps: [],
      estimatedSuccessRate: 0,
      reasoning: '无匹配的工具链模板',
    };
  }

  // 过滤掉不可用的工具
  const steps = template.filter(step => {
    if (availableTools.length === 0) return true;
    return availableTools.includes(step.tool);
  });

  // 用学习到的模式调整
  let estimatedSuccessRate = 0.7;

  // 检查 learned patterns 中是否有匹配的工具链前缀
  if (steps.length >= 2 && learnedPatterns.length > 0) {
    const firstTool = steps[0].tool;
    const secondTool = steps[1].tool;
    const matchingPattern = learnedPatterns.find(
      p => p.sequence[0] === firstTool && p.sequence[1] === secondTool,
    );
    if (matchingPattern) {
      estimatedSuccessRate = Math.max(estimatedSuccessRate, matchingPattern.successRate);
    }
  }

  // 如果上一个工具与链中第一步匹配，从第二步开始
  let adjustedSteps = steps;
  if (lastToolUsed && steps.length >= 2 && steps[0].tool === lastToolUsed) {
    adjustedSteps = steps.slice(1);
  }

  // 根据学习模式扩展：suggestNextTool 的结果
  if (lastToolUsed && learnedPatterns.length > 0) {
    const nextSuggestions = suggestNextTool(learnedPatterns, lastToolUsed, 2);
    for (const suggested of nextSuggestions) {
      if (!adjustedSteps.some(s => s.tool === suggested)) {
        adjustedSteps.push({ tool: suggested, purpose: '基于历史模式推荐', optional: true });
      }
    }
  }

  const requiredSteps = adjustedSteps.filter(s => !s.optional).length;
  const reasoningParts: string[] = [
    `意图: ${targetIntent}`,
    `步骤: ${adjustedSteps.map(s => s.tool).join(' → ')}`,
  ];
  if (lastToolUsed) reasoningParts.push(`接续: ${lastToolUsed}`);
  reasoningParts.push(`必需步骤: ${requiredSteps}/${adjustedSteps.length}`);

  return {
    targetIntent,
    steps: adjustedSteps,
    estimatedSuccessRate: Math.min(0.95, estimatedSuccessRate),
    reasoning: reasoningParts.join(' | '),
  };
}

/**
 * 格式化工具链建议为 prompt section
 */
export function formatToolChainSuggestion(suggestion: ToolChainSuggestion): string {
  if (suggestion.steps.length === 0) return '';

  const lines: string[] = [];
  lines.push(`推荐工具链 (${(suggestion.estimatedSuccessRate * 100).toFixed(0)}% 成功率):`);
  for (const step of suggestion.steps) {
    const marker = step.optional ? '(可选)' : '(必需)';
    lines.push(`  ${step.tool} ${marker} — ${step.purpose}`);
  }
  lines.push(`依据: ${suggestion.reasoning}`);
  return lines.join('\n');
}

/**
 * 对话动量追踪
 */

export interface MomentumState {
  /** 动量方向 */
  direction: 'accelerating' | 'steady' | 'decelerating' | 'stalled';
  /** 话题深度变化 (-1 to 1) */
  topicDepthDelta: number;
  /** 信息密度 (chars per message avg, normalized 0-1) */
  infoDensity: number;
  /** 参与度分数 0-1 */
  engagementScore: number;
  /** 目标推进速度 0-1 */
  goalProgress: number;
  /** 综合动量分数 -1 to 1 */
  momentumScore: number;
  /** 建议的节奏调整 */
  paceAdvice: string;
}

/**
 * 分析对话动量
 */
export function analyzeConversationMomentum(
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: number }>,
  activeGoals: Array<{ progress: number }> = [],
): MomentumState {
  if (recentMessages.length < 2) {
    return {
      direction: 'steady',
      topicDepthDelta: 0,
      infoDensity: 0.5,
      engagementScore: 0.5,
      goalProgress: 0,
      momentumScore: 0,
      paceAdvice: '对话刚开始，保持探索',
    };
  }

  const userMsgs = recentMessages.filter(m => m.role === 'user');
  const assistantMsgs = recentMessages.filter(m => m.role === 'assistant');

  // === 信息密度：用户消息平均长度趋势 ===
  const recentUser = userMsgs.slice(-5);
  const earlierUser = userMsgs.slice(-10, -5);
  const recentAvgLen = recentUser.length > 0
    ? recentUser.reduce((s, m) => s + m.content.length, 0) / recentUser.length
    : 0;
  const earlierAvgLen = earlierUser.length > 0
    ? earlierUser.reduce((s, m) => s + m.content.length, 0) / earlierUser.length
    : recentAvgLen;

  const infoDensity = Math.min(1, recentAvgLen / 300);

  // === 话题深度变化：技术关键词密度 ===
  const techKeywords = /\b(function|class|interface|type|const|async|import|export|return|if|else|for|while)\b|[一-龥]{2,}(?:方法|函数|接口|模块|组件|服务|配置|部署|测试)/g;
  const recentTechDensity = recentUser.length > 0
    ? recentUser.reduce((s, m) => s + (m.content.match(techKeywords) ?? []).length, 0) / Math.max(1, recentUser.reduce((s, m) => s + m.content.length, 0) / 100)
    : 0;
  const earlierTechDensity = earlierUser.length > 0
    ? earlierUser.reduce((s, m) => s + (m.content.match(techKeywords) ?? []).length, 0) / Math.max(1, earlierUser.reduce((s, m) => s + m.content.length, 0) / 100)
    : recentTechDensity;

  const topicDepthDelta = Math.max(-1, Math.min(1, (recentTechDensity - earlierTechDensity) * 2));

  // === 参与度：消息频率 + 问题比例 ===
  const questionRatio = recentUser.filter(m => /[?？]/.test(m.content)).length / Math.max(1, recentUser.length);
  const codeBlocks = recentUser.filter(m => /```|`[^`]+`/.test(m.content)).length / Math.max(1, recentUser.length);
  const engagementScore = Math.min(1, questionRatio * 0.5 + codeBlocks * 0.3 + infoDensity * 0.2);

  // === 目标推进 ===
  const goalProgress = activeGoals.length > 0
    ? activeGoals.reduce((s, g) => s + g.progress, 0) / activeGoals.length
    : 0.5;

  // === 综合动量 ===
  const lengthTrend = recentAvgLen - earlierAvgLen;
  const momentumScore = Math.max(-1, Math.min(1,
    topicDepthDelta * 0.3 +
    (lengthTrend > 0 ? 0.2 : lengthTrend < -50 ? -0.3 : 0) +
    (engagementScore - 0.5) * 0.3 +
    (goalProgress - 0.5) * 0.2,
  ));

  // === 方向判断 ===
  let direction: MomentumState['direction'];
  if (momentumScore > 0.2) direction = 'accelerating';
  else if (momentumScore > -0.1) direction = 'steady';
  else if (momentumScore > -0.4) direction = 'decelerating';
  else direction = 'stalled';

  // === 节奏建议 ===
  let paceAdvice: string;
  if (direction === 'accelerating') {
    paceAdvice = '对话加速中，保持深度、提供具体细节';
  } else if (direction === 'decelerating') {
    paceAdvice = '对话放缓，可尝试引入新话题或主动提问';
  } else if (direction === 'stalled') {
    paceAdvice = '对话停滞，建议总结进展、提出新方向';
  } else {
    paceAdvice = '节奏稳定，继续保持当前深度';
  }

  return {
    direction,
    topicDepthDelta,
    infoDensity,
    engagementScore,
    goalProgress,
    momentumScore,
    paceAdvice,
  };
}

/**
 * 格式化动量分析为 prompt section
 */
export function formatMomentumState(state: MomentumState): string {
  const dirLabel = { accelerating: '加速', steady: '稳定', decelerating: '放缓', stalled: '停滞' }[state.direction];
  const lines: string[] = [
    `动量: ${dirLabel} (${(state.momentumScore * 100).toFixed(0)}%)`,
    `深度: ${(state.topicDepthDelta * 100).toFixed(0)}% | 密度: ${(state.infoDensity * 100).toFixed(0)}% | 参与: ${(state.engagementScore * 100).toFixed(0)}%`,
    `建议: ${state.paceAdvice}`,
  ];
  return lines.join('\n');
}

/**
 * 自适应 Persona 校准
 */

export interface PersonaCalibration {
  /** 正式度 0-1 (0=casual, 1=formal) */
  formality: number;
  /** 详尽度 0-1 (0=concise, 1=verbose) */
  verbosity: number;
  /** 共情度 0-1 (0=neutral, 1=high-empathy) */
  empathy: number;
  /** 技术深度 0-1 (0=layman, 1=expert) */
  technicalDepth: number;
  /** 主动性 0-1 (0=reactive, 1=proactive) */
  proactivity: number;
  /** 校准依据 */
  reasoning: string;
}

const CALIBRATION_DEFAULTS: PersonaCalibration = {
  formality: 0.5,
  verbosity: 0.5,
  empathy: 0.5,
  technicalDepth: 0.5,
  proactivity: 0.5,
  reasoning: '默认校准',
};

/**
 * 根据多维信号校准 persona 表达风格
 */
export function calibratePersona(
  signals: {
    expertiseLevel?: 'beginner' | 'intermediate' | 'expert';
    rhythmCadence?: 'rapid_fire' | 'measured' | 'deliberate' | 'burst_pause';
    emotionalValence?: number;
    momentumDirection?: 'accelerating' | 'steady' | 'decelerating' | 'stalled';
    fatigueLevel?: number;
    correctionScore?: number;
  },
): PersonaCalibration {
  let { formality, verbosity, empathy, technicalDepth, proactivity } = { ...CALIBRATION_DEFAULTS };
  const reasons: string[] = [];

  // === 技术深度：基于用户专长 ===
  if (signals.expertiseLevel === 'expert') {
    technicalDepth = 0.85;
    formality = 0.4;
    reasons.push('专家用户→高技术深度+轻松语气');
  } else if (signals.expertiseLevel === 'beginner') {
    technicalDepth = 0.25;
    verbosity = 0.65;
    reasons.push('初学者→低技术深度+详细解释');
  }

  // === 详尽度：基于节奏 ===
  if (signals.rhythmCadence === 'rapid_fire') {
    verbosity = 0.25;
    proactivity = 0.7;
    reasons.push('快节奏→简洁+主动');
  } else if (signals.rhythmCadence === 'deliberate') {
    verbosity = 0.7;
    reasons.push('深思熟虑→详细');
  }

  // === 共情度：基于情感 ===
  if (signals.emotionalValence !== undefined) {
    if (signals.emotionalValence < -0.3) {
      empathy = 0.8;
      formality = Math.max(formality, 0.6);
      reasons.push('负面情绪→高共情+正式');
    } else if (signals.emotionalValence > 0.5) {
      empathy = 0.4;
      formality = 0.3;
      reasons.push('积极情绪→轻松+友好');
    }
  }

  // === 主动性：基于动量 ===
  if (signals.momentumDirection === 'stalled') {
    proactivity = 0.8;
    reasons.push('对话停滞→高主动性');
  } else if (signals.momentumDirection === 'accelerating') {
    proactivity = 0.3;
    reasons.push('加速中→跟随用户');
  }

  // === 疲劳调节 ===
  if (signals.fatigueLevel && signals.fatigueLevel > 0.6) {
    verbosity = Math.min(verbosity, 0.3);
    technicalDepth = Math.min(technicalDepth, 0.4);
    reasons.push('认知疲劳→简化响应');
  }

  // === 校正反馈 ===
  if (signals.correctionScore !== undefined && signals.correctionScore < 0.5) {
    verbosity = Math.min(verbosity + 0.1, 0.8);
    reasons.push('低校正分→增加解释');
  }

  return {
    formality: clamp01(formality),
    verbosity: clamp01(verbosity),
    empathy: clamp01(empathy),
    technicalDepth: clamp01(technicalDepth),
    proactivity: clamp01(proactivity),
    reasoning: reasons.length > 0 ? reasons.join('、') : '默认校准',
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * 格式化 persona 校准为 prompt section
 */
export function formatPersonaCalibration(calibration: PersonaCalibration): string {
  const isDefault = calibration.reasoning === '默认校准';
  if (isDefault) return '';

  const formalLabel = calibration.formality > 0.6 ? '正式' : calibration.formality < 0.4 ? '轻松' : '适中';
  const verbLabel = calibration.verbosity > 0.6 ? '详细' : calibration.verbosity < 0.4 ? '简洁' : '适中';
  const empathLabel = calibration.empathy > 0.6 ? '高共情' : calibration.empathy < 0.4 ? '客观' : '平衡';
  const techLabel = calibration.technicalDepth > 0.6 ? '技术' : calibration.technicalDepth < 0.4 ? '通俗' : '适中';
  const proactLabel = calibration.proactivity > 0.6 ? '主动' : calibration.proactivity < 0.4 ? '跟随' : '平衡';

  const lines: string[] = [
    `语气: ${formalLabel} | 详尽: ${verbLabel} | 共情: ${empathLabel} | 深度: ${techLabel} | 主动: ${proactLabel}`,
    `依据: ${calibration.reasoning}`,
  ];
  return lines.join('\n');
}

/**
 * 主动知识缺口检测
 */

export interface KnowledgeGap {
  /** 缺口类型 */
  type: 'unknown_concept' | 'missing_context' | 'unresolved_reference' | 'outdated_info';
  /** 缺口描述 */
  description: string;
  /** 上下文（用户提到的原话片段） */
  context: string;
  /** 严重度 0-1 */
  severity: number;
  /** 建议的研究动作 */
  suggestedAction: string;
}

export interface KnowledgeGapAnalysis {
  gaps: KnowledgeGap[];
  gapCount: number;
  coverageScore: number;
}

// 未知概念检测模式
const UNKNOWN_CONCEPT_PATTERNS: Array<{
  pattern: RegExp;
  type: KnowledgeGap['type'];
  actionTemplate: string;
}> = [
  {
    pattern: /(?:什么是|what is|explain|介绍一下|tell me about)\s+([A-Z][A-Za-z0-9_.-]+(?:\s+[A-Z][A-Za-z0-9_.-]+)*)/g,
    type: 'unknown_concept',
    actionTemplate: '搜索 $1 相关文档和最新信息',
  },
  {
    pattern: /(?:怎么用|how to use|how do I)\s+(\S+\s+(?:API|SDK|CLI|library|framework|plugin|module))/gi,
    type: 'unknown_concept',
    actionTemplate: '查找 $1 的使用文档',
  },
];

// 未解析引用
const UNRESOLVED_REF_PATTERNS: Array<{
  pattern: RegExp;
  type: KnowledgeGap['type'];
  actionTemplate: string;
}> = [
  {
    pattern: /(?:那个|之前说的|上次提到的|earlier|before|之前那个)\s*(.{2,20}?)(?:的|了|呢|is|was|the)?\s*(?:怎么|what|how|在哪|where)/g,
    type: 'unresolved_reference',
    actionTemplate: '检索记忆中关于 "$1" 的上下文',
  },
];

/**
 * 检测对话中的知识缺口
 */
export function detectKnowledgeGaps(
  userMessage: string,
  knownEntities: string[] = [],
  conversationLength: number = 0,
): KnowledgeGapAnalysis {
  const gaps: KnowledgeGap[] = [];

  // === 检测未知概念 ===
  for (const rule of UNKNOWN_CONCEPT_PATTERNS) {
    let match: RegExpExecArray | null;
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    while ((match = pattern.exec(userMessage)) !== null) {
      const concept = match[1].trim();
      if (knownEntities.some(e => e.toLowerCase() === concept.toLowerCase())) continue;
      if (concept.length < 3) continue;

      gaps.push({
        type: rule.type,
        description: `未知概念: ${concept}`,
        context: match[0],
        severity: 0.7,
        suggestedAction: rule.actionTemplate.replace('$1', concept),
      });
    }
  }

  // === 检测未解析引用 ===
  for (const rule of UNRESOLVED_REF_PATTERNS) {
    let match: RegExpExecArray | null;
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    while ((match = pattern.exec(userMessage)) !== null) {
      const ref = match[1].trim();
      if (ref.length < 2) continue;

      gaps.push({
        type: rule.type,
        description: `未解析引用: "${ref}"`,
        context: match[0],
        severity: conversationLength > 10 ? 0.5 : 0.3,
        suggestedAction: rule.actionTemplate.replace('$1', ref),
      });
    }
  }

  // === 检测缺失上下文 ===
  if (conversationLength > 20) {
    const detailPatterns = /(?:顺便说一下|by the way|对了|补充一下|另外|additionally)\s+(.{5,40})/g;
    let match: RegExpExecArray | null;
    while ((match = detailPatterns.exec(userMessage)) !== null) {
      gaps.push({
        type: 'missing_context',
        description: `新细节可能需要上下文: "${match[1].trim()}"`,
        context: match[0],
        severity: 0.4,
        suggestedAction: '将新信息与之前讨论的主题关联',
      });
    }
  }

  // === 计算覆盖率 ===
  const totalConcepts = (userMessage.match(/[A-Z][A-Za-z0-9_.]+/g) ?? []).length;
  const coveredConcepts = knownEntities.length > 0 && totalConcepts > 0
    ? (userMessage.match(new RegExp(`\\b(?:${knownEntities.map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi')) ?? []).length
    : 0;
  const coverageScore = totalConcepts > 0
    ? Math.min(1, coveredConcepts / totalConcepts)
    : 1;

  return {
    gaps: gaps.slice(0, 5),
    gapCount: gaps.length,
    coverageScore,
  };
}

/**
 * 格式化知识缺口分析为 prompt section
 */
export function formatKnowledgeGapAnalysis(analysis: KnowledgeGapAnalysis): string {
  if (analysis.gaps.length === 0) return '';

  const lines: string[] = [];
  lines.push(`检测到 ${analysis.gaps.length} 个知识缺口 (覆盖率: ${(analysis.coverageScore * 100).toFixed(0)}%):`);

  for (const gap of analysis.gaps) {
    lines.push(`  - ${gap.description} → ${gap.suggestedAction}`);
  }

  return lines.join('\n');
}