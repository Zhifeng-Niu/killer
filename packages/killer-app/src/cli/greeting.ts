/**
 * Context-Aware Boot Greeting
 *
 * 根据 Agent 启动时的上下文（时间、上次会话、情感状态、记忆、预测）
 * 生成自然的问候语。这是用户的"Samantha 时刻"。
 */

import type { PersonaEngine } from '../persona/engine.js';
import type { HippocampusEngine } from '@killer/core';
import { c, kv, divider } from './format.js';

/**
 * 问候所需的上下文依赖
 */
export interface GreetingContext {
  readonly persona: PersonaEngine;
  readonly hippocampus: HippocampusEngine;
  readonly isFirstBoot: boolean;
  readonly isSessionRestored: boolean;
  readonly lastTopic?: string | null;
}

/**
 * 时间段判断
 */
function getTimeOfDay(): 'early-morning' | 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 8) return 'early-morning';
  if (hour >= 8 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * 时间段对应的问候模板
 */
const TIME_GREETINGS: Record<string, string[]> = {
  'early-morning': [
    'You\'re up early',
    'Good morning, early bird',
    'Starting the day bright and early',
  ],
  'morning': [
    'Good morning',
    'Hey there',
    'Morning',
  ],
  'afternoon': [
    'Good afternoon',
    'Hey',
    'Hi there',
  ],
  'evening': [
    'Good evening',
    'Hey there',
    'Hi',
  ],
  'night': [
    'Working late',
    'Still up',
    'Hey, night owl',
  ],
};

/**
 * 根据时间差生成重逢语气
 */
function getReunionTone(hoursSinceLastSeen: number): string | null {
  if (hoursSinceLastSeen < 1) return null;
  if (hoursSinceLastSeen < 6) return 'Good to see you again';
  if (hoursSinceLastSeen < 24) return 'Welcome back';
  if (hoursSinceLastSeen < 72) return 'It\'s been a couple of days — good to have you back';
  if (hoursSinceLastSeen < 168) return 'It\'s been a while — I\'ve missed our conversations';
  return 'It\'s been a long time — wonderful to see you again';
}

/**
 * 根据情感状态选择语气修饰
 */
function getEmotionalModifier(emotion: string, intensity: number): string | null {
  if (intensity < 0.2) return null;
  const modifiers: Record<string, string[]> = {
    'joy': ['!', ' — I\'m feeling great today'],
    'excitement': ['! So glad you\'re here', '! Ready to dive in'],
    'contentment': ['. Peaceful day so far', ''],
    'curiosity': ['. I\'ve been thinking about a few things', ''],
    'sadness': ['. I\'m here for you', ''],
    'anxiety': ['. Let\'s take it easy', ''],
  };
  const options = modifiers[emotion];
  if (!options) return null;
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * 生成上下文感知的启动问候
 */
export function generateBootGreeting(ctx: GreetingContext): string {
  const parts: string[] = [];
  const expression = ctx.persona.getExpression();
  const emotionalState = ctx.persona.emotionalState.getState();
  const userModel = ctx.persona.getUserModel();
  const predictions = ctx.persona.getPredictions();

  // ─── Header: Persona identity ───
  parts.push('');
  parts.push(`${c.header(`${expression.avatar} ${expression.name}`)}`);

  // ─── First boot: welcome message ───
  if (ctx.isFirstBoot) {
    parts.push(c.muted('  First time we meet — no memories yet.'));
    parts.push('');
    const firstBootGreetings = [
      'Hey! I\'m new here, and so are you. What should I call you?',
      'Hi! This is our first conversation. What\'s your name?',
      'Hello — I don\'t know anything about you yet, but I\'d like to. What\'s your name?',
    ];
    parts.push(`  ${c.value(firstBootGreetings[Math.floor(Math.random() * firstBootGreetings.length)])}`);
    parts.push('');
    parts.push(c.muted('  (Type /help for commands, or just start chatting.)'));
    parts.push('');
    return parts.join('\n');
  }

  // ─── Time-aware greeting ───
  const timeOfDay = getTimeOfDay();
  const greetings = TIME_GREETINGS[timeOfDay];
  const baseGreeting = greetings[Math.floor(Math.random() * greetings.length)];

  // ─── Reunion tone (if returning user) ───
  const lastSeen = ctx.persona.getLastSeenAt();
  let reunionLine = '';
  if (lastSeen && !ctx.isFirstBoot) {
    const hoursSince = (Date.now() - lastSeen) / (1000 * 60 * 60);
    reunionLine = getReunionTone(hoursSince) ?? '';
  }

  // ─── Emotional modifier ───
  const emotionalMod = getEmotionalModifier(
    emotionalState.primaryEmotion,
    emotionalState.intensity,
  );

  // ─── Compose greeting line ───
  let greetingLine = baseGreeting;
  if (reunionLine) {
    greetingLine = reunionLine;
  }
  if (emotionalMod) {
    greetingLine += emotionalMod;
  }

  parts.push(`  ${c.value(greetingLine)}`);

  // ─── Topic continuity hint (if returning to a conversation) ───
  if (ctx.lastTopic && ctx.isSessionRestored) {
    parts.push(`  ${c.dim(c.muted(`Last time: "${ctx.lastTopic}"`))}`);
  }

  // ─── Session stats line ───
  const totalInteractions = userModel.interactionSummary.totalInteractions;
  if (totalInteractions > 0) {
    const statsLine = c.muted(
      `${totalInteractions} conversation${totalInteractions !== 1 ? 's' : ''}` +
      ` | Trust: ${(userModel.trustLevel * 100).toFixed(0)}%` +
      ` | Memory: ${ctx.hippocampus.getStats().episodes} episodes`
    );
    parts.push(`  ${statsLine}`);
  }

  // ─── Predictive hints (if we have predictions) ───
  if (predictions.predictedNeeds.length > 0) {
    const topNeed = predictions.predictedNeeds[0];
    if (topNeed.confidence > 0.4) {
      parts.push(`  ${c.dim(c.muted(`You might want to: ${topNeed.description}`))}`);
    }
  }

  // ─── Emotional state indicator ───
  if (emotionalState.intensity > 0.3) {
    const emotionIcon = getEmotionIcon(emotionalState.primaryEmotion);
    parts.push(`  ${c.dim(`${emotionIcon} Feeling ${emotionalState.primaryEmotion} (${(emotionalState.intensity * 100).toFixed(0)}%)`)}`);
  }

  // ─── Narrative chapter hint (if we have chapters) ───
  const narrative = ctx.hippocampus.getNarrative();
  if (narrative.chapters.length > 0) {
    const latestChapter = narrative.chapters[narrative.chapters.length - 1];
    parts.push(`  ${c.dim(c.muted(`Last chapter: ${latestChapter.title}`))}`);
  }

  parts.push('');
  parts.push(c.info('  Type /help for commands, or just start chatting.'));
  parts.push('');

  return parts.join('\n');
}

/**
 * 情感图标映射
 */
function getEmotionIcon(emotion: string): string {
  const icons: Record<string, string> = {
    'joy': '☀️',
    'excitement': '⚡',
    'contentment': '🌿',
    'curiosity': '🔍',
    'sadness': '🌧️',
    'anxiety': '💨',
    'anger': '🔥',
    'fear': '🌙',
    'surprise': '✨',
    'neutral': '⚪',
  };
  return icons[emotion] ?? '⚪';
}
