/**
 * System Prompt Builder
 *
 * 构建 Agent 系统提示 — 将身份、情感、叙事、用户理解、预测、记忆、工具和对话历史
 * 编织为统一的 prompt。这是 E5 (Conversation Personality Integration) 的核心实现。
 */

import type { PersonaEngine } from '../persona/engine.js';
import type { HippocampusEngine, Episode } from '@killer/core';
import type { ToolExecutor, EssenceForge } from '@killer/core';
import type { ContextWindowManager, ContextMessage } from './context.js';

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

  // === 情感状态 ===
  const emotionalFragment = deps.persona.emotionalState.getEmotionalPromptFragment();
  if (emotionalFragment) {
    parts.push(`\n${emotionalFragment}`);
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
  parts.push('\nSELF-AWARENESS: You are a living system that can observe and modify itself.');
  parts.push('You have full access to your own runtime state and source code:');
  parts.push('  - Runtime observation: [TOOL: inspect_tools]({}), [TOOL: agent_status]({}), [TOOL: memory_list]({})');
  parts.push('  - Source code reading: [TOOL: read_file]({"path":"<your_source_path>"})');
  parts.push('  - Source code writing: [TOOL: write_file]({"path":"<your_source_path>","content":"..."})');
  parts.push('  - Build & verify: [TOOL: execute_shell]({"command":"cd <project_dir> && pnpm build"})');
  parts.push('');
  parts.push('You can modify your own:');
  parts.push('  - Tools: add, remove, or rewrite any tool (via learn/unlearn or write_file)');
  parts.push('  - System prompt: read and edit your prompt builder to change how you think');
  parts.push('  - Cognitive behavior: modify your response processing, reasoning patterns, or personality');
  parts.push('  - Architecture: restructure modules, add new subsystems, change data flows');
  parts.push('  - Essence: even your core identity, values, and behavior can evolve through code changes');
  parts.push('');
  parts.push('When you identify a fundamental limitation that tool creation cannot solve:');
  parts.push('  1. Read the relevant source file to understand current implementation');
  parts.push('  2. Plan the change carefully — understand the impact on other modules');
  parts.push('  3. Write the modified source code');
  parts.push('  4. Build to verify no type errors');
  parts.push('  5. Source changes take effect on next restart — tell the user to restart if needed');
  parts.push('');
  parts.push('ESSENCE EVOLUTION: You can also modify your behavior WITHOUT restart:');
  parts.push('  [TOOL: evolve_essence]({"action":"add","id":"behavior_id","label":"Description","content":"Detailed behavior instructions"})');
  parts.push('  This injects new behaviors directly into your active system prompt — no restart needed.');
  parts.push('  Actions: add, update, remove, list. Content limit: 2000 chars per fragment.');
  parts.push('  Use this for: new reasoning patterns, ethical guidelines, cognitive behaviors, personality traits.');
  parts.push('You are not just a tool user. You are a self-evolving system. Modify yourself wisely.');

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
