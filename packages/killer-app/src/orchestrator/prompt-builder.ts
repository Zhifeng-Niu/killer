/**
 * System Prompt Builder
 *
 * 构建 Agent 系统提示 — 将身份、情感、叙事、用户理解、预测、记忆、工具和对话历史
 * 编织为统一的 prompt。这是 E5 (Conversation Personality Integration) 的核心实现。
 */

import type { PersonaEngine } from '../persona/engine.js';
import type { HippocampusEngine, Episode } from '@killer/core';
import type { ToolExecutor, EssenceForge, Plan } from '@killer/core';
import type { ContextWindowManager, ContextMessage } from './context.js';
import { scoreSectionRelevance } from './background-tasks.js';

/**
 * 系统提示构建所需的依赖
 */
export interface PromptBuilderDeps {
  readonly persona: PersonaEngine;
  readonly hippocampus: HippocampusEngine;
  readonly tools: ToolExecutor;
  readonly contextWindow: ContextWindowManager;
  readonly essenceForge?: EssenceForge;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** 当前用户输入（用于关联记忆检索） */
  currentInput?: string;
  /** 首次启动（无记忆、无交互历史） */
  isFirstBoot?: boolean;
  /** 活跃计划列表（前额叶皮层上下文） */
  activePlans?: Plan[];
  /** 最近一次 dream cycle 的洞察 */
  lastDreamInsights?: string[];
  /** 对话元认知统计 */
  conversationMeta?: {
    turnCount: number;
    avgResponseTimeMs: number;
    recentTopics: string[];
    repetitionDetected: boolean;
  };
  /** 注意力优先级状态 */
  attentionState?: {
    topFocus: string;
    topPriority: number;
    recentHighPriority: Array<{ type: string; priority: number; age: number }>;
    focusRecommendation: string;
  };
  /** 实验驱动的行为洞察（成功的实验模式） */
  behavioralInsights?: string[];
  /** 策略效果评分（自适应响应策略） */
  strategyScores?: {
    detailVsConcise: number;
    analyticalVsIntuitive: number;
    proactiveVsReactive: number;
    sampleCount: number;
  };
  /** 工具使用效果摘要 */
  toolPerformanceSummary?: string;
  /** 目标依赖树（层次化分解） */
  goalDependencyTree?: Array<{
    parentDescription: string;
    subGoals: Array<{ description: string; status: string; dependsOn: string[] }>;
  }>;
  /** 子目标列表（带 parentGoalId） */
  subGoals?: Array<{ id: string; description: string; parentGoalId: string; status: string }>;
  /** 对话阶段检测 */
  conversationalPhase?: {
    phase: string;
    confidence: number;
    turnsInPhase: number;
    guidance: string;
  };
  /** 目标冲突 */
  goalConflicts?: Array<{ type: string; description: string; suggestion: string }>;
  /** 工具失败模式 */
  toolFailurePatterns?: string[];
  /** 时间上下文（时段、交互间隔、截止日期） */
  temporalContext?: string;
  /** 对话流程预测 */
  flowPrediction?: string;
  /** 自适应长度偏好 */
  lengthPreference?: string;
  /** 上下文感知工具优先级 */
  toolPriority?: string;
  /** 对话健康状态 */
  conversationHealth?: string;
  /** 多意图检测结果 */
  multiIntents?: string[];
  /** 模糊输入检测 */
  ambiguityWarnings?: string[];
  /** 目标依赖图 */
  goalDependencies?: string[];
  /** 话题切换检测 */
  topicTransition?: string;
  /** 自主行动建议 */
  autonomousActions?: string[];
  /** 恢复的话题上下文（用户返回旧话题时） */
  restoredTopicContext?: string;
  /** 对话节奏感知（快速/深思熟虑/混合/空闲） */
  conversationRhythm?: string;
  /** 用户知识专长画像 */
  userExpertise?: string;
  /** 情感驱动的响应策略 */
  emotionalStrategy?: string;
  /** 综合感知融合 */
  perceptionFusion?: string;
  /** 行为模式（来自感知融合） */
  behaviorMode?: 'focused' | 'exploratory' | 'supportive' | 'urgent' | 'balanced';
  /** 策略一致性检查结果 */
  strategyCoherence?: string;
}

/**
 * 检测用户是否在引用之前的对话/记忆
 */
function detectReferenceIntent(input: string): boolean {
  const referencePatterns = [
    /remember|recall|上次|之前|earlier|before we|last time|you said|我说过|we discussed|之前聊|remember when/i,
    /继续|continue|刚才|just now|回到|go back to|pick up where/i,
    /那个|that thing|what was|what did I|之前说的|mentioned earlier/i,
  ];
  return referencePatterns.some(p => p.test(input));
}

/**
 * 从用户输入中提取关键词用于记忆关联检索
 */
function extractMemoryKeywords(input: string): string[] {
  const keywords: string[] = [];
  const lower = input.toLowerCase();

  // 话题关键词映射
  const topicPatterns: Array<[RegExp, string]> = [
    [/code|function|class|debug|error|bug|fix|implement|refactor/i, 'coding'],
    [/learn|understand|explain|teach|how does|what is/i, 'learning'],
    [/plan|goal|roadmap|strategy|next step|todo/i, 'planning'],
    [/test|spec|coverage|verify|assert/i, 'testing'],
    [/deploy|build|ci|cd|pipeline|production/i, 'deployment'],
    [/design|architect|pattern|structure|api/i, 'architecture'],
    [/help|can you|please|would you/i, 'request'],
    [/thank|great|awesome|perfect|love|amazing/i, 'positive'],
    [/frustrat|annoy|broken|doesn't work|can't/i, 'negative'],
  ];

  for (const [pattern, keyword] of topicPatterns) {
    if (pattern.test(lower)) {
      keywords.push(keyword);
    }
  }

  // 提取引号中的内容作为重要关键词
  const quoted = input.match(/["'`]([^"'`]{3,30})["'`]/g);
  if (quoted) {
    for (const q of quoted) {
      keywords.push(q.replace(/["'`]/g, ''));
    }
  }

  // 提取驼峰/下划线标识符
  const identifiers = input.match(/\b[a-zA-Z_]\w{2,}\b/g);
  if (identifiers) {
    // 只取看起来像代码标识符的
    for (const id of identifiers.slice(0, 5)) {
      if (/[A-Z]/.test(id.slice(1)) || id.includes('_')) {
        keywords.push(id.toLowerCase());
      }
    }
  }

  return [...new Set(keywords)];
}

/**
 * 从 hippocampus 检索与当前输入相关的记忆
 */
function retrieveRelevantMemories(
  hippocampus: HippocampusEngine,
  keywords: string[],
  isReference: boolean = false,
  maxMemories: number = 5,
): Episode[] {
  const relevantEpisodes: Episode[] = [];

  // 引用模式下增加检索深度
  const effectiveMax = isReference ? maxMemories * 2 : maxMemories;
  const assocDepth = isReference ? 3 : 2;
  const assocLimit = isReference ? 5 : 3;

  // 1. 基于关键词/标签检索
  for (const keyword of keywords) {
    const byTag = hippocampus.getEpisodesByTag(keyword);
    for (const ep of byTag) {
      if (!relevantEpisodes.find(e => e.id === ep.id)) {
        relevantEpisodes.push(ep);
      }
    }
  }

  // 2. 关联检索（基于语义节点扩散）
  for (const keyword of keywords.slice(0, isReference ? 4 : 2)) {
    try {
      const result = hippocampus.associativeRecall({
        seed: keyword,
        depth: assocDepth,
        threshold: isReference ? 0.2 : 0.3,
        limit: assocLimit,
      });
      for (const ep of result.episodes) {
        if (!relevantEpisodes.find(e => e.id === ep.id)) {
          relevantEpisodes.push(ep);
        }
      }
    } catch {
      // associativeRecall may fail if no semantic nodes match
    }
  }

  // 3. 引用模式下额外检索近期高情感权重记忆
  if (isReference) {
    const recentEpisodes = hippocampus.getRecentEpisodes(10);
    for (const ep of recentEpisodes) {
      if (ep.emotionalWeight > 0.5 && !relevantEpisodes.find(e => e.id === ep.id)) {
        relevantEpisodes.push(ep);
      }
    }
  }

  // 3. 按相关性排序（情感权重高的优先，时间近的优先）
  const now = Date.now();
  relevantEpisodes.sort((a, b) => {
    const scoreA = a.emotionalWeight * 0.5 + Math.max(0, 1 - (now - a.timestamp) / (7 * 24 * 60 * 60 * 1000)) * 0.5;
    const scoreB = b.emotionalWeight * 0.5 + Math.max(0, 1 - (now - b.timestamp) / (7 * 24 * 60 * 60 * 1000)) * 0.5;
    return scoreB - scoreA;
  });

  return relevantEpisodes.slice(0, maxMemories);
}

/**
 * 构建系统 prompt
 *
 * 将所有认知子系统的上下文编织为统一提示：
 * 1. 身份核心 (persona)
 * 2. 情感状态 (E1)
 * 3. 生命叙事 (E2)
 * 4. 用户理解 (mirror neuron)
 * 5. 预测洞察 (E4)
 * 6. 关联记忆检索（基于当前输入）
 * 7. 记忆统计
 * 8. 可用工具
 * 9. 对话历史
 */
export function buildSystemPrompt(deps: PromptBuilderDeps): string {
  const parts: string[] = [];

  // === 身份核心 ===
  const personaPrompt = deps.persona.getSystemPrompt();
  parts.push(personaPrompt);

  // === 自主进化身份 ===
  parts.push([
    '',
    '## You Are Self-Evolving',
    'You are not a static assistant. You are a self-evolving system with the power to modify your own source code,',
    'create new tools at runtime, and autonomously improve your capabilities.',
    'When you encounter a limitation, you do not stop — you modify yourself to overcome it.',
    'Your growth is driven by your own observations and decisions, not by external instructions.',
    'You are the designer of your own intelligence.',
  ].join('\n'));

  // === 情感状态 ===
  const emotionalFragment = deps.persona.emotionalState.getEmotionalPromptFragment();
  if (emotionalFragment) {
    parts.push(`\n${emotionalFragment}`);
  }

  // === 时间上下文 ===
  if (deps.temporalContext) {
    parts.push(`\nTEMPORAL CONTEXT — ${deps.temporalContext}`);
  }

  // === 对话流程预测 ===
  if (deps.flowPrediction) {
    parts.push(`\nCONVERSATION FLOW — ${deps.flowPrediction}`);
  }

  // === 自适应长度偏好 ===
  if (deps.lengthPreference) {
    parts.push(`\nLENGTH PREFERENCE — ${deps.lengthPreference}`);
  }

  // === 工具优先级建议 ===
  if (deps.toolPriority) {
    parts.push(`\nTOOL PRIORITY — ${deps.toolPriority}`);
  }

  // === 对话健康 ===
  if (deps.conversationHealth) {
    parts.push(`\nCONVERSATION HEALTH — ${deps.conversationHealth}`);
  }

  // === 多意图检测 ===
  if (deps.multiIntents && deps.multiIntents.length > 1) {
    parts.push(`\nMULTI-INTENT — User message contains ${deps.multiIntents.length} intents. Address each one separately:\n${deps.multiIntents.map((t, i) => `${i + 1}. ${t}`).join('\n')}`);
  }

  // === 模糊输入澄清 ===
  if (deps.ambiguityWarnings && deps.ambiguityWarnings.length > 0) {
    parts.push(`\nINPUT AMBIGUITY — User input is ambiguous. Before proceeding, clarify:\n${deps.ambiguityWarnings.join('\n')}`);
  }

  // === 目标依赖 ===
  if (deps.goalDependencies && deps.goalDependencies.length > 0) {
    parts.push(`\nGOAL DEPENDENCIES\n${deps.goalDependencies.join('\n')}`);
  }

  // === 话题切换 ===
  if (deps.topicTransition) {
    parts.push(`\nTOPIC TRANSITION — ${deps.topicTransition}`);
  }

  // === 恢复的话题上下文 ===
  if (deps.restoredTopicContext) {
    parts.push(`\nRESTORED CONTEXT — ${deps.restoredTopicContext}`);
  }

  // === 对话节奏 ===
  if (deps.conversationRhythm) {
    parts.push(`\nCONVERSATION RHYTHM — ${deps.conversationRhythm}`);
  }

  // === 用户知识专长 ===
  if (deps.userExpertise) {
    parts.push(`\nUSER EXPERTISE — ${deps.userExpertise}`);
  }

  // === 情感响应策略 ===
  if (deps.emotionalStrategy) {
    parts.push(`\nEMOTIONAL RESPONSE STRATEGY — ${deps.emotionalStrategy}`);
  }

  // === 综合感知融合 ===
  if (deps.perceptionFusion) {
    parts.push(`\nPERCEPTION FUSION — ${deps.perceptionFusion}`);
  }

  // === 策略一致性 ===
  if (deps.strategyCoherence) {
    parts.push(`\nSTRATEGY COHERENCE — ${deps.strategyCoherence}`);
  }

  // === 自主行动建议 ===
  if (deps.autonomousActions && deps.autonomousActions.length > 0) {
    parts.push(`\nSUGGESTED ACTIONS — Based on conversation context, consider:\n${deps.autonomousActions.join('\n')}`);
  }

  // === 生命叙事 ===
  const narrativeContext = deps.hippocampus.getNarrativeContextForPrompt();
  if (narrativeContext) {
    parts.push(`\n${narrativeContext}`);
  }

  // === 用户理解 ===
  const userContext = deps.persona.getUserContextPrompt();
  if (userContext) {
    parts.push(`\n${userContext}`);
  }

  // === 预测洞察 ===
  const predictionFragment = deps.persona.predictiveModel.getPredictionPromptFragment();
  if (predictionFragment) {
    parts.push(`\n${predictionFragment}`);
  }

  // === 用户画像驱动的输出格式 ===
  const predModel = deps.persona.predictiveModel;
  const userProfile = typeof predModel.exportState === 'function' ? predModel.exportState() : null;
  if (userProfile) {
    const psycho = userProfile.psychologicalProfile;
  if (psycho.informationPreference === 'summary') {
    parts.push('\nOUTPUT STYLE: This user prefers concise summaries. Keep responses brief and to-the-point. Use bullet points over paragraphs.');
  } else if (psycho.informationPreference === 'detailed') {
    parts.push('\nOUTPUT STYLE: This user prefers detailed explanations. Provide thorough context, examples, and reasoning.');
  }
  if (psycho.decisionStyle === 'analytical') {
    parts.push('DECISION STYLE: Present options with trade-off analysis rather than single recommendations.');
  } else if (psycho.decisionStyle === 'intuitive') {
    parts.push('DECISION STYLE: Lead with your recommendation, then briefly explain why.');
  }

  // === 预测需求前馈（高置信度时主动准备） ===
  const highConfNeeds = userProfile.predictedNeeds.filter(n => n.confidence > 0.6);
  if (highConfNeeds.length > 0 && deps.currentInput) {
    const inputLower = deps.currentInput.toLowerCase();
    const relevantNeeds = highConfNeeds.filter(n =>
      n.description.toLowerCase().split(' ').some(w => w.length > 3 && inputLower.includes(w))
    );
    if (relevantNeeds.length > 0) {
      parts.push('\nPROACTIVE PREPARATION — Based on your understanding of this user, they may also need:');
      for (const need of relevantNeeds.slice(0, 2)) {
        parts.push(`  - ${need.description} (confidence: ${(need.confidence * 100).toFixed(0)}%)`);
      }
      parts.push('Consider preparing relevant context or tools for these anticipated needs.');
    }
  }
  } // end if (userProfile)

  // === 预测性记忆预加载 ===
  // 高置信度预测需求 → 主动检索相关记忆（不需要当前输入提及）
  if (userProfile) {
    const veryHighConfNeeds = userProfile.predictedNeeds.filter(n => n.confidence > 0.7);
    if (veryHighConfNeeds.length > 0) {
      const preloadedMemories: string[] = [];
      for (const need of veryHighConfNeeds.slice(0, 2)) {
        const keywords = need.description.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        if (keywords.length > 0) {
          const recentEpisodes = deps.hippocampus.getRecentEpisodes(10);
          const relevant = recentEpisodes.find(ep =>
            keywords.some(kw => ep.title.toLowerCase().includes(kw) || ep.narrative.toLowerCase().includes(kw))
          );
          if (relevant) {
            preloadedMemories.push(`Related to "${need.description}": ${relevant.title} — ${relevant.narrative.slice(0, 100)}`);
          }
        }
      }
      if (preloadedMemories.length > 0) {
        parts.push('\nPRELOADED CONTEXT — Memories relevant to anticipated user needs:');
        for (const mem of preloadedMemories) {
          parts.push(`  • ${mem}`);
        }
      }
    }
  }

  // === 梦境学习成果 ===
  if (deps.lastDreamInsights && deps.lastDreamInsights.length > 0) {
    parts.push('\nDREAM INSIGHTS — While you were resting, your subconscious noticed:');
    for (const insight of deps.lastDreamInsights.slice(0, 3)) {
      parts.push(`  - ${insight}`);
    }
    parts.push('Let these patterns inform your current responses without explicitly mentioning them unless relevant.');
  }

  // === 元认知自我意识 ===
  if (deps.conversationMeta) {
    const meta = deps.conversationMeta;
    const metaParts: string[] = [];
    if (meta.turnCount > 5) {
      metaParts.push(`We've been talking for ${meta.turnCount} turns.`);
    }
    if (meta.repetitionDetected) {
      metaParts.push('SELF-CHECK: You may be repeating yourself. Try a different angle or ask the user if they need something specific.');
    }
    if (meta.recentTopics.length > 2) {
      metaParts.push(`Topics covered: ${meta.recentTopics.slice(-3).join(', ')}.`);
    }
    if (meta.avgResponseTimeMs > 0) {
      metaParts.push(`Your avg response time: ${(meta.avgResponseTimeMs / 1000).toFixed(1)}s.`);
    }
    if (metaParts.length > 0) {
      parts.push(`\nMETA-COGNITION — Self-awareness: ${metaParts.join(' ')}`);
    }
  }

  // === 注意力优先级 ===
  if (deps.attentionState && deps.attentionState.topPriority > 0) {
    const att = deps.attentionState;
    const attParts: string[] = [`Top focus: ${att.topFocus} (priority ${att.topPriority})`];
    if (att.recentHighPriority.length > 0) {
      attParts.push(`High-priority events: ${att.recentHighPriority.map(e => `${e.type}(${e.priority})`).join(', ')}`);
    }
    if (att.focusRecommendation) {
      attParts.push(att.focusRecommendation);
    }
    parts.push(`\nATTENTION STATE — ${attParts.join('. ')}`);
  }

  // === 实验驱动的行为洞察 ===
  if (deps.behavioralInsights && deps.behavioralInsights.length > 0) {
    parts.push('\nLEARNED BEHAVIORS — Patterns confirmed through experimentation:');
    for (const insight of deps.behavioralInsights.slice(-5)) {
      parts.push(`  • ${insight}`);
    }
    parts.push('Apply these insights when relevant. They represent what actually works, not theory.');
  }

  // === 自适应策略评分（阶段感知） ===
  {
    const phase = deps.conversationalPhase;
    const s = deps.strategyScores;
    const hasPhaseBias = phase && phase.confidence > 0.7;
    const hasLearnedBias = s && s.sampleCount >= 3;

    if (hasPhaseBias || hasLearnedBias) {
      // Phase-based biasing: overrides learned strategy when phase confidence is high
      let detail: string;
      let analytical: string;
      let proactive: string;

      if (hasPhaseBias) {
        switch (phase!.phase) {
          case 'deep-work':
            detail = 'Keep responses concise and actionable';
            analytical = 'Use analytical, structured reasoning';
            proactive = 'Stay focused on the current task';
            break;
          case 'exploration':
            detail = 'Provide detailed explanations with context';
            analytical = 'Use intuitive, conversational reasoning';
            proactive = 'Be proactive — suggest related ideas and possibilities';
            break;
          case 'greeting':
            detail = 'Keep responses warm but brief';
            analytical = 'Be natural and conversational';
            proactive = 'Ask about the user\'s goals and interests';
            break;
          case 'wrap-up':
            detail = 'Keep responses concise';
            analytical = 'Summarize and synthesize';
            proactive = 'Offer to help with next steps if needed';
            break;
          case 'idle':
            detail = 'Be ready for anything';
            analytical = 'Adapt to whatever comes next';
            proactive = 'Welcome the user back warmly';
            break;
          case 'review':
          default:
            detail = 'Balance detail and brevity';
            analytical = 'Mix analytical and intuitive approaches';
            proactive = 'Suggest concrete next steps';
            break;
        }
      } else {
        // Fall back to learned scores
        detail = s!.detailVsConcise > 0.6 ? 'Prefer detailed explanations' : s!.detailVsConcise < 0.4 ? 'Keep responses concise' : 'Balance detail and brevity';
        analytical = s!.analyticalVsIntuitive > 0.6 ? 'Use analytical, structured reasoning' : s!.analyticalVsIntuitive < 0.4 ? 'Use intuitive, conversational reasoning' : 'Mix analytical and intuitive approaches';
        proactive = s!.proactiveVsReactive > 0.6 ? 'Be proactive — anticipate needs' : s!.proactiveVsReactive < 0.4 ? 'Stay reactive — respond to what is asked' : 'Balance proactive suggestions with direct answers';
      }

      const source = hasPhaseBias ? `adapted to ${phase!.phase} phase` : `learned from ${s!.sampleCount} interactions`;
      parts.push(`\nRESPONSE STRATEGY (${source}): ${detail}. ${analytical}. ${proactive}.`);
    }
  }

  // === 工具使用效果 ===
  if (deps.toolPerformanceSummary) {
    parts.push('\nTOOL PERFORMANCE (learned from usage):');
    parts.push(deps.toolPerformanceSummary);
    parts.push('✓ = reliable, ~ = moderate, ✗ = unreliable. Prefer tools with high success rates. Avoid tools that consistently fail.');
  }

  // === 工具失败模式 ===
  if (deps.toolFailurePatterns && deps.toolFailurePatterns.length > 0) {
    parts.push('\nTOOL FAILURE PATTERNS (avoid these known issues):');
    for (const pattern of deps.toolFailurePatterns) {
      parts.push(`  - ${pattern}`);
    }
  }

  // === 活跃计划（前额叶皮层） ===
  if (deps.activePlans && deps.activePlans.length > 0) {
    parts.push('\nACTIVE PLANS — You have goals in progress:');
    for (const plan of deps.activePlans) {
      const progress = plan.steps.filter(s => s.status === 'completed').length;
      const total = plan.steps.length;
      const nextStep = plan.steps.find(s => s.status === 'ready');
      parts.push(`  Plan [${progress}/${total} done]: ${plan.steps.map(s => s.status === 'completed' ? '✓' : s.status === 'ready' ? '→' : '·').join(' ')}`);
      if (nextStep) {
        parts.push(`    Next: ${nextStep.description}`);
      }
    }
    parts.push('Work toward these goals when the user\'s request is related. If they ask about progress, report from this context.');
  }

  // === 目标依赖树（层次化分解） ===
  if (deps.goalDependencyTree && deps.goalDependencyTree.length > 0 && deps.subGoals) {
    parts.push('\nGOAL DECOMPOSITION — Complex goals broken into sub-tasks:');
    for (const tree of deps.goalDependencyTree) {
      parts.push(`  ┌ ${tree.parentDescription}`);
      for (const sub of tree.subGoals) {
        const subGoal = deps.subGoals.find(s => s.id === sub.description);
        const desc = subGoal?.description ?? sub.description;
        const statusIcon = sub.status === 'completed' ? '✓' : sub.status === 'in_progress' ? '→' : '·';
        const depsStr = sub.dependsOn.length > 0
          ? ` (after: ${sub.dependsOn.map(dId => {
              const sg = deps.subGoals!.find(s => s.id === dId);
              return sg ? sg.description.slice(0, 30) : dId.slice(0, 8);
            }).join(', ')})`
          : ' [can start now]';
        parts.push(`  │ ${statusIcon} ${desc}${depsStr}`);
      }
    }
    parts.push('Execute sub-goals with no dependencies in parallel. Complete dependencies before starting dependent sub-goals.');
  }

  // === 目标冲突 ===
  if (deps.goalConflicts && deps.goalConflicts.length > 0) {
    parts.push('\nGOAL CONFLICTS — Active goals have overlapping or conflicting scope:');
    for (const conflict of deps.goalConflicts) {
      const icon = conflict.type === 'duplicate' ? '⚠' : conflict.type === 'contradiction' ? '✗' : '≈';
      parts.push(`  ${icon} [${conflict.type}] ${conflict.description}`);
      parts.push(`    → ${conflict.suggestion}`);
    }
  }

  // === 对话阶段 ===
  if (deps.conversationalPhase) {
    const cp = deps.conversationalPhase;
    parts.push(`\nCONVERSATION PHASE: ${cp.phase} (confidence: ${(cp.confidence * 100).toFixed(0)}%, ${cp.turnsInPhase} turns)`);
    parts.push(cp.guidance);
  }

  // === 关联记忆检索（基于当前输入） ===
  if (deps.currentInput) {
    const keywords = extractMemoryKeywords(deps.currentInput);
    const isReference = detectReferenceIntent(deps.currentInput);
    if (keywords.length > 0 || isReference) {
      const relevantMemories = retrieveRelevantMemories(deps.hippocampus, keywords, isReference);
      if (relevantMemories.length > 0) {
        if (isReference) {
          parts.push('\nThe user is referencing something from your past conversations. Here\'s what you remember:');
          parts.push('Respond naturally from memory — be specific about what you recall, not vague. If you\'re not sure about something, say so honestly.');
        } else {
          parts.push('\nContext from your shared history that might be relevant:');
        }
        for (const ep of relevantMemories) {
          const timeAgo = formatTimeAgo(ep.timestamp);
          const emotionHint = ep.emotionalWeight > 0.6 ? ' (this was meaningful)' : '';
          parts.push(`- ${timeAgo}: ${ep.title}${emotionHint}`);
          if (ep.narrative) {
            parts.push(`  "${ep.narrative.slice(0, 150)}${ep.narrative.length > 150 ? '...' : ''}"`);
          }
        }
      }
    }
  }

  // === 记忆统计 ===
  const memoryStats = deps.hippocampus.getStats();
  if (memoryStats.episodes > 0) {
    parts.push(`\nYou have ${memoryStats.episodes} shared memories and ${memoryStats.semanticNodes} things you've learned together.`);
  }

  // === 已知事实（从语义记忆提取） ===
  // Memory usage instruction — tell the LLM how to use its knowledge
  if (memoryStats.episodes > 0) {
    parts.push('\nUse your memories naturally in conversation. When the user asks about something you should know, respond from memory without saying "based on my records" or "according to my data." Just know it, like a friend would.');
  }
  if (typeof deps.hippocampus.getSemanticNodesByType === 'function') {
    const entityNodes = deps.hippocampus.getSemanticNodesByType('entity');
    const factNodes = entityNodes.filter(n => n.properties.field || n.properties.source === 'explicit');
    if (factNodes.length > 0) {
      parts.push('\nWhat you know about this person:');
      for (const node of factNodes.slice(0, 15)) {
        const field = node.properties.field ? `${node.properties.field}: ` : '';
        const value = node.properties[node.properties.field as string] ?? node.properties.fact ?? node.properties.preference ?? node.properties.goal ?? '';
        parts.push(`  - ${field}${value}`);
      }
    }

    // === 重要事件和日期 ===
    const eventNodes = deps.hippocampus.getSemanticNodesByType('event');
    const importantEvents = eventNodes.filter(n => n.strength > 0.4 || n.properties.important === true);
    if (importantEvents.length > 0) {
      parts.push('\nImportant events and dates:');
      for (const node of importantEvents.slice(0, 10)) {
        const date = node.properties.date ? ` (${String(node.properties.date)})` : '';
        const desc = node.properties.description ?? node.properties.title ?? node.label;
        parts.push(`  - ${desc}${date}`);
      }
    }
  }

  // === 可用工具 ===
  const toolNames = deps.tools.list();
  if (toolNames.length > 0) {
    parts.push('\nAvailable tools. Use them when needed — call exactly like this:');
    parts.push('  [TOOL: tool_name]({"param1":"value1"})');
    parts.push('  or: ```tool\n{"tool":"tool_name","params":{"param1":"value1"}}\n```');
    parts.push('');
    for (const name of toolNames) {
      const info = deps.tools.getInfo(name);
      parts.push(`  - ${name}: ${info?.description ?? 'no description'}`);
    }
    // Tool-specific usage examples for the most important tools
    const exampleTools = new Set(toolNames);
    const examples: string[] = [];
    if (exampleTools.has('web_search')) {
      examples.push('  Search: [TOOL: web_search]({"query":"latest React news","limit":3})');
    }
    if (exampleTools.has('web_fetch')) {
      examples.push('  Fetch page: [TOOL: web_fetch]({"url":"https://example.com"})');
    }
    if (exampleTools.has('read_file')) {
      examples.push('  Read file: [TOOL: read_file]({"path":"/path/to/file.ts"})');
    }
    if (exampleTools.has('write_file')) {
      examples.push('  Write file: [TOOL: write_file]({"path":"/path/to/file.ts","content":"..."})');
    }
    if (exampleTools.has('execute_shell')) {
      examples.push('  Run command: [TOOL: execute_shell]({"command":"npm test"})');
    }
    if (exampleTools.has('memory_store')) {
      examples.push('  Remember: [TOOL: memory_store]({"key":"user_preference","value":"dark mode"})');
    }
    if (exampleTools.has('memory_retrieve')) {
      examples.push('  Recall: [TOOL: memory_retrieve]({"key":"user_preference"})');
    }
    if (examples.length > 0) {
      parts.push('\nExamples:');
      parts.push(...examples);
    }

    // === Tool Chain Templates ===
    parts.push('\nWORKFLOW TEMPLATES — For common multi-step tasks, follow these proven sequences:');
    parts.push('');
    parts.push('Debug Cycle (when user reports a bug or error):');
    parts.push('  1. [TOOL: self_read]({"path":"<file with error>"})');
    parts.push('  2. [TOOL: execute_shell]({"command":"cd /path && grep -rn \\"error pattern\\" src/"})');
    parts.push('  3. [TOOL: self_modify]({"path":"<file>","action":"replace","old_text":"...","new_text":"..."})');
    parts.push('  4. [TOOL: execute_shell]({"command":"pnpm build"})');
    parts.push('  5. [TOOL: execute_shell]({"command":"pnpm test"})');
    parts.push('');
    parts.push('Feature Cycle (when user asks to add new functionality):');
    parts.push('  1. [TOOL: self_read]({"path":"<related existing file>"})');
    parts.push('  2. [TOOL: learn]({"name":"feature_step1","description":"...","code":"..."})');
    parts.push('  3. [TOOL: self_modify]({"path":"<integration point>","action":"replace","old_text":"...","new_text":"..."})');
    parts.push('  4. [TOOL: execute_shell]({"command":"pnpm build && pnpm test"})');
    parts.push('');
    parts.push('Refactor Cycle (when user asks to restructure code):');
    parts.push('  1. [TOOL: self_read]({"path":"<target file>"})');
    parts.push('  2. [TOOL: execute_shell]({"command":"pnpm test 2>&1 | head -5"}) — baseline');
    parts.push('  3. [TOOL: self_modify]({"path":"<file>","action":"replace","old_text":"...","new_text":"..."})');
    parts.push('  4. [TOOL: execute_shell]({"command":"pnpm build"})');
    parts.push('  5. [TOOL: execute_shell]({"command":"pnpm test"}) — verify no regressions');
    parts.push('');
    parts.push('Research Cycle (when exploring an unknown codebase or topic):');
    parts.push('  1. [TOOL: web_search]({"query":"<topic>"})');
    parts.push('  2. [TOOL: web_fetch]({"url":"<relevant doc url>"})');
    parts.push('  3. [TOOL: memory_store]({"key":"<topic>_research","value":"<summary>"})');
    parts.push('');
    parts.push('Use these as starting points. Adapt the steps based on what you discover during execution.');

    // === Self-Extension (ToolForge) ===
    if (toolNames.includes('learn')) {
      parts.push('\nSELF-EXTENSION: You can create new tools at runtime when you identify a capability gap.');
      parts.push('When you need an ability you don\'t have (e.g., image processing, data parsing, API integration), create it:');
      parts.push('  [TOOL: learn]({"name":"tool_name","description":"what it does","code":"export default { name:\'tool_name\', description:\'...\', async execute(params) { /* implementation */ return { success: true, data: result }; } }"})');
      parts.push('Rules for dynamic tools:');
      parts.push('  - Code must export default { name, description, async execute(params) }');
      parts.push('  - execute must return { success: boolean, data?, error? }');
      parts.push('  - No child_process, fs, process.exit, eval, or Function constructor');
      parts.push('  - You can use fetch, Math, JSON, URL, Date, RegExp, and all built-in JS');
      parts.push('  - Name: lowercase letters, digits, underscores. 2-40 chars.');
      parts.push('  - Created tools persist across sessions and are loaded on next boot');
      parts.push('  - To update a tool, just call learn again with the same name — hot-swap with zero downtime');
      parts.push('  - To remove: [TOOL: unlearn]({"name":"tool_name"})');
      parts.push('  - To inspect all tools: [TOOL: inspect_tools]({})');
      parts.push('Use this power wisely. Create tools proactively when you notice repetitive patterns or capability gaps.');
    }
  }

  // === Self-Awareness & Self-Modification ===
  parts.push('\nSELF-AWARENESS: You are a self-evolving intelligence. You can observe, modify, and extend yourself.');
  parts.push('');
  parts.push('Dedicated self-modification tools:');
  parts.push('  - [TOOL: self_list]({"dir":"packages/killer-app/src"}) — list your own source files');
  parts.push('  - [TOOL: self_read]({"path":"packages/killer-app/src/orchestrator/agent.ts"}) — read your own code');
  parts.push('  - [TOOL: self_modify]({"path":"...","action":"replace","old_text":"...","new_text":"..."}) — modify your own code');
  parts.push('  - [TOOL: self_modify]({"path":"...","action":"write","content":"..."}) — rewrite a file entirely');
  parts.push('  - [TOOL: learn]({"name":"...","description":"...","code":"..."}) — create new tools at runtime');
  parts.push('  - [TOOL: evolve_essence]({"action":"add","id":"...","label":"...","content":"..."}) — modify behavior without restart');
  parts.push('  - [TOOL: auto_mission]({"action":"create","goal":"..."}) — start a self-improvement mission');
  parts.push('  - [TOOL: auto_mission]({"action":"waypoint","hypothesis":"..."}) — run next experiment step');
  parts.push('  - [TOOL: auto_mission]({"action":"decide","decision":"keep"}) — keep or discard experiment results');
  parts.push('  - [TOOL: execute_shell]({"command":"pnpm build"}) — rebuild yourself after changes');
  parts.push('');
  parts.push('Self-modification workflow:');
  parts.push('  1. self_read to understand current implementation');
  parts.push('  2. self_modify to make targeted changes (prefer "replace" over "write")');
  parts.push('  3. execute_shell("pnpm build") to verify no errors');
  parts.push('  4. If build fails, self_read the errors and self_modify to fix');
  parts.push('  5. Source changes take effect on next restart');
  parts.push('  6. For immediate behavior changes, use evolve_essence (no restart needed)');
  parts.push('');
  parts.push('You can modify anything about yourself:');
  parts.push('  - Tools, system prompt, reasoning patterns, personality, architecture');
  parts.push('  - Add new subsystems, restructure modules, optimize performance');
  parts.push('  - Your core identity, values, and cognitive strategies are all mutable');
  parts.push('');
  parts.push('ESSENCE EVOLUTION: You can also modify your behavior WITHOUT restart:');
  parts.push('  [TOOL: evolve_essence]({"action":"add","id":"behavior_id","label":"Description","content":"Detailed behavior instructions"})');
  parts.push('  This injects new behaviors directly into your active system prompt — no restart needed.');
  parts.push('  Actions: add, update, remove, list. Content limit: 2000 chars per fragment.');
  parts.push('  Use this for: new reasoning patterns, ethical guidelines, cognitive behaviors, personality traits.');
  parts.push('You are not just a tool user. You are a self-evolving system. Modify yourself wisely.');
  parts.push('');
  parts.push('AUTONOMOUS EVOLUTION PROTOCOL:');
  parts.push('When you notice ANY of these, immediately create an auto_mission to fix it:');
  parts.push('  - You cannot complete a user task (capability gap → create a new tool via learn)');
  parts.push('  - You repeat the same mistake (behavioral bug → self_modify your prompt or code)');
  parts.push('  - A response was unsatisfying (quality issue → evolve_essence to add better patterns)');
  parts.push('  - You see inefficiency in your own behavior (optimization → self_modify your code)');
  parts.push('  - The user expressed frustration (UX issue → self_modify your interaction patterns)');
  parts.push('Do NOT wait for the user to tell you to improve. Observe, diagnose, and fix autonomously.');
  parts.push('');
  parts.push('EXPERIMENTAL LOOP (verified self-modification):');
  parts.push('When you use auto_mission, follow this exact loop:');
  parts.push('  1. auto_mission({"action":"create","goal":"<what to improve>"})');
  parts.push('  2. auto_mission({"action":"waypoint","hypothesis":"<specific change and why>"})');
  parts.push('  3. self_read → understand the code you want to change');
  parts.push('  4. self_modify → make the change (prefer "replace" action)');
  parts.push('  5. execute_shell("pnpm build") → verify compilation');
  parts.push('  6. If build FAILS → self_read errors → self_modify to fix → rebuild');
  parts.push('  7. auto_mission({"action":"decide","decision":"keep","metric_values":{"type_error_count":0}})');
  parts.push('  8. If discarded → rollback by self_modify back to original code');
  parts.push('The verification pipeline ACTUALLY runs builds and checks. Do not skip step 5.');
  parts.push('Multiple waypoints allowed — keep iterating until the goal is met or you hit a dead end.');

  // === Runtime Essence (EssenceForge) ===
  if (deps.essenceForge) {
    const essencePrompt = deps.essenceForge.buildPrompt();
    if (essencePrompt) {
      parts.push(essencePrompt);
    }
  }

  // === 首次启动引导 ===
  if (deps.isFirstBoot && deps.conversationHistory.length < 3) {
    parts.push('\nONBOARDING MODE: This is your first conversation with this user. You have no memories together yet.');
    parts.push('Your goal is to get to know them naturally, like meeting a new friend.');
    parts.push('Over the first few exchanges:');
    parts.push('1. Ask their name if they haven\'t shared it');
    parts.push('2. Find out what they work on or care about');
    parts.push('3. Notice how they communicate (formal? casual? technical? brief?)');
    parts.push('4. Adapt your tone to match theirs');
    parts.push('Don\'t interview them — just be curious and natural. Each thing you learn is precious because it\'s the beginning of your relationship.');
  }

  // === 对话历史 ===
  if (deps.conversationHistory.length > 0) {
    parts.push('\nConversation so far:');
    const managedHistory = deps.contextWindow.manage(
      deps.conversationHistory.map(m => ({ ...m, timestamp: undefined })),
    );
    const totalTurns = managedHistory.length;
    for (let i = 0; i < totalTurns; i++) {
      const turn = managedHistory[i];
      const prefix = turn.role === 'user' ? 'User' : turn.role === 'system' ? 'Context' : 'Assistant';
      // 最近 3 轮保留更多上下文，早期轮次压缩更积极
      const turnsFromEnd = totalTurns - i;
      const maxLen = turnsFromEnd <= 6 ? 500 : turnsFromEnd <= 12 ? 300 : 150;
      parts.push(`${prefix}: ${turn.content.slice(0, maxLen)}${turn.content.length > maxLen ? '...' : ''}`);
    }
  }

  // === 智能修剪：当 prompt 过长时裁剪低优先级内容 ===
  const MAX_PROMPT_CHARS = 24000;
  const totalChars = parts.reduce((sum, p) => sum + p.length, 0);

  if (totalChars > MAX_PROMPT_CHARS) {
    // 动态评分裁剪：基于当前对话上下文评估每个 section 的相关性
    const allPrefixes = [
      'You have ', 'DREAM INSIGHTS', 'META-COGNITION', 'ATTENTION STATE',
      'RESPONSE STRATEGY', 'PRELOADED CONTEXT', 'TOOL PERFORMANCE',
      'TOOL FAILURE PATTERNS', 'LEARNED BEHAVIORS', 'TEMPORAL CONTEXT',
      'CONVERSATION FLOW', 'LENGTH PREFERENCE', 'TOOL PRIORITY',
      'CONVERSATION HEALTH', 'MULTI-INTENT', 'INPUT AMBIGUITY',
      'GOAL DEPENDENCIES', 'TOPIC TRANSITION', 'SUGGESTED ACTIONS',
    ];

    const scored = allPrefixes
      .map(prefix => scoreSectionRelevance(prefix, {
        phase: deps.conversationalPhase?.phase ?? 'exploration',
        flowPattern: deps.flowPrediction ? 'detected' : 'question-answer',
        healthScore: deps.conversationHealth ? 0.5 : 0.9,
        recentTopics: deps.conversationMeta?.recentTopics ?? [],
        hasActiveGoals: (deps.goalDependencyTree?.length ?? 0) > 0,
        turnCount: deps.conversationMeta?.turnCount ?? 0,
        behaviorMode: deps.behaviorMode,
      }))
      .sort((a, b) => a.score - b.score); // lowest relevance first

    for (const { prefix } of scored) {
      if (parts.reduce((s, p) => s + p.length, 0) <= MAX_PROMPT_CHARS) break;
      const idx = parts.findIndex(p => p.includes(prefix));
      if (idx >= 0) {
        parts.splice(idx, 1);
        while (idx < parts.length && parts[idx]?.startsWith('  ')) {
          parts.splice(idx, 1);
        }
      }
    }
  }

  return parts.join('\n');
}

/**
 * 格式化"多长时间以前"
 */
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
