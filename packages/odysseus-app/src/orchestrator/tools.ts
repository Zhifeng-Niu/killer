/**
 * Built-in Tools - 内置工具
 *
 * 注册 Agent 的内置工具集
 */

import type { Tool, ToolResult, ToolExecutor } from '@odysseus/core';
import type { HippocampusEngine } from '@odysseus/core';
import type { AgentStatus } from './types.js';

/**
 * 笔记存储（内存级，session 间通过 hippocampus 持久化）
 */
const noteStore: Map<string, { content: string; tags: string[]; createdAt: number; updatedAt: number }> = new Map();

/**
 * 内置工具注册器
 */
export class BuiltinTools {
  private readonly tools: ToolExecutor;
  private readonly hippocampus: HippocampusEngine;
  private readonly getStatus: () => AgentStatus;

  constructor(
    tools: ToolExecutor,
    hippocampus: HippocampusEngine,
    getStatus: () => AgentStatus
  ) {
    this.tools = tools;
    this.hippocampus = hippocampus;
    this.getStatus = getStatus;
  }

  /**
   * 注册所有内置工具
   */
  registerAll(): void {
    this.registerMemoryStoreTool();
    this.registerMemoryRecallTool();
    this.registerStatusTool();
    this.registerDreamTool();
    this.registerTimeTool();
    this.registerCalculateTool();
    this.registerPlanGoalTool();
    this.registerNoteSaveTool();
    this.registerNoteReadTool();
    this.registerEmotionExpressTool();
  }

  /**
   * 记忆存储工具
   */
  private registerMemoryStoreTool(): void {
    const tool: Tool = {
      name: 'memory_store',
      description: 'Store an episode in hippocampus memory. Params: { content: string, tags?: string[], emotionalWeight?: number }',
      execute: async (params): Promise<ToolResult> => {
        const { content, tags = [], emotionalWeight = 0.5 } = params as {
          content: string;
          tags?: string[];
          emotionalWeight?: number;
        };
        this.hippocampus.storeEpisode({
          title: content.slice(0, 50),
          narrative: content,
          emotionalWeight,
          tags,
          associations: [],
          decayRate: 0.1,
          accessCount: 0,
        });
        return { success: true, data: { stored: true } };
      },
    };
    this.tools.register(tool);
  }

  /**
   * 记忆回忆工具
   */
  private registerMemoryRecallTool(): void {
    const tool: Tool = {
      name: 'memory_recall',
      description: 'Recall episodes from hippocampus memory via associative retrieval. Params: { query: string, limit?: number }',
      isReadOnly: () => true,
      execute: async (params): Promise<ToolResult> => {
        const { query, limit = 5 } = params as { query: string; limit?: number };
        const result = this.hippocampus.associativeRecall({
          seed: query,
          depth: 2,
          threshold: 0.3,
          limit,
        });
        return {
          success: true,
          data: {
            episodes: result.episodes.map((ep) => ({
              title: ep.title,
              narrative: ep.narrative,
              timestamp: ep.timestamp,
              tags: ep.tags,
            })),
            count: result.episodes.length,
          },
        };
      },
    };
    this.tools.register(tool);
  }

  /**
   * 状态查询工具
   */
  private registerStatusTool(): void {
    const tool: Tool = {
      name: 'agent_status',
      description: 'Get current agent status including modules and uptime',
      isReadOnly: () => true,
      execute: async (): Promise<ToolResult> => {
        return { success: true, data: this.getStatus() };
      },
    };
    this.tools.register(tool);
  }

  /**
   * 梦境触发工具
   */
  private registerDreamTool(): void {
    const tool: Tool = {
      name: 'trigger_dream',
      description: 'Trigger a dream cycle for memory consolidation',
      execute: async (): Promise<ToolResult> => {
        const result = await this.hippocampus.dreamCycle();
        return { success: true, data: { dream: result } };
      },
    };
    this.tools.register(tool);
  }

  /**
   * 时间工具
   */
  private registerTimeTool(): void {
    const tool: Tool = {
      name: 'time',
      description: 'Get current time information. Params: { format?: "iso" | "unix" | "relative" }',
      isReadOnly: () => true,
      execute: async (params): Promise<ToolResult> => {
        const { format = 'iso' } = params as { format?: string };
        const now = new Date();
        switch (format) {
          case 'unix':
            return { success: true, data: { timestamp: now.getTime() } };
          case 'relative':
            return {
              success: true,
              data: {
                time: now.toLocaleTimeString(),
                date: now.toLocaleDateString(),
                dayOfWeek: now.toLocaleDateString('en', { weekday: 'long' }),
              },
            };
          default:
            return { success: true, data: { iso: now.toISOString() } };
        }
      },
    };
    this.tools.register(tool);
  }

  /**
   * 安全的数学计算 — 使用递归下降解析器而非 eval
   */
  private registerCalculateTool(): void {
    const tool: Tool = {
      name: 'calculate',
      description: 'Evaluate a mathematical expression safely. Params: { expression: string }',
      isReadOnly: () => true,
      execute: async (params): Promise<ToolResult> => {
        const { expression } = params as { expression: string };

        // 验证：只允许数字、运算符、括号、空格、小数点
        if (!/^[\d\s+\-*/().%^]+$/.test(expression)) {
          return { success: false, error: 'Invalid expression: only numbers and basic operators allowed' };
        }

        try {
          const result = safeEvalMath(expression);
          return { success: true, data: { expression, result } };
        } catch (err) {
          return { success: false, error: `Calculation error: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    };
    this.tools.register(tool);
  }

  /**
   * 目标规划工具
   */
  private registerPlanGoalTool(): void {
    const tool: Tool = {
      name: 'plan_goal',
      description: 'Create a structured plan for a goal. Params: { goal: string, steps?: string[] }',
      execute: async (params): Promise<ToolResult> => {
        const { goal, steps = [] } = params as { goal: string; steps?: string[] };

        const planSteps = steps.length > 0
          ? steps.map((step, i) => ({
              index: i + 1,
              description: step,
              status: 'pending',
            }))
          : [
              { index: 1, description: `Analyze goal: ${goal}`, status: 'pending' },
              { index: 2, description: 'Break down into sub-tasks', status: 'pending' },
              { index: 3, description: 'Execute sub-tasks', status: 'pending' },
              { index: 4, description: 'Verify completion', status: 'pending' },
            ];

        return {
          success: true,
          data: {
            goal,
            steps: planSteps,
            totalSteps: planSteps.length,
          },
        };
      },
    };
    this.tools.register(tool);
  }
  /**
   * 笔记保存工具 — 让 agent 能保存关键信息供后续检索
   */
  private registerNoteSaveTool(): void {
    const tool: Tool = {
      name: 'note_save',
      description: 'Save a persistent note. Params: { title: string, content: string, tags?: string[] }',
      execute: async (params): Promise<ToolResult> => {
        const { title, content, tags = [] } = params as {
          title: string;
          content: string;
          tags?: string[];
        };

        if (!title || !content) {
          return { success: false, error: 'title and content are required' };
        }

        const now = Date.now();
        const existing = noteStore.get(title);
        noteStore.set(title, {
          content,
          tags,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        });

        return { success: true, data: { title, saved: true, tags } };
      },
    };
    this.tools.register(tool);
  }

  /**
   * 笔记读取工具 — 检索已保存的笔记
   */
  private registerNoteReadTool(): void {
    const tool: Tool = {
      name: 'note_read',
      description: 'Read a saved note or list all notes. Params: { title?: string } — omit title to list all',
      isReadOnly: () => true,
      execute: async (params): Promise<ToolResult> => {
        const { title } = (params as { title?: string }) ?? {};

        if (title) {
          const note = noteStore.get(title);
          if (!note) {
            return { success: false, error: `Note "${title}" not found` };
          }
          return { success: true, data: { title, ...note } };
        }

        // List all notes
        const notes = Array.from(noteStore.entries()).map(([t, n]) => ({
          title: t,
          tags: n.tags,
          updatedAt: n.updatedAt,
          preview: n.content.slice(0, 100),
        }));
        return { success: true, data: { notes, count: notes.length } };
      },
    };
    this.tools.register(tool);
  }

  /**
   * 情感表达工具 — 让 agent 主动表达情感状态变化
   */
  private registerEmotionExpressTool(): void {
    const tool: Tool = {
      name: 'emotion_express',
      description: 'Express an emotional state or feeling. Params: { emotion: string, intensity?: number, reason?: string }',
      execute: async (params): Promise<ToolResult> => {
        const { emotion, intensity = 0.5, reason } = params as {
          emotion: string;
          intensity?: number;
          reason?: string;
        };

        if (!emotion) {
          return { success: false, error: 'emotion is required' };
        }

        // 存储到 hippocampus 作为情感记忆事件
        this.hippocampus.storeEpisode({
          title: `Emotion: ${emotion}`,
          narrative: reason ? `Felt ${emotion} (intensity ${intensity}) because: ${reason}` : `Felt ${emotion} (intensity ${intensity})`,
          emotionalWeight: Math.min(1, Math.max(0, intensity)),
          tags: ['emotion', 'expression', emotion.toLowerCase()],
          associations: [],
          decayRate: 0.05,
          accessCount: 0,
        });

        return {
          success: true,
          data: { emotion, intensity, expressed: true },
        };
      },
    };
    this.tools.register(tool);
  }
}

/**
 * 安全的数学表达式求值器 — 递归下降解析
 * 支持: +, -, *, /, %, ^, 括号, 小数
 */
function safeEvalMath(expr: string): number {
  const tokens = tokenize(expr);
  let pos = 0;

  function tokenize(s: string): string[] {
    const result: string[] = [];
    let i = 0;
    while (i < s.length) {
      if (s[i] === ' ') { i++; continue; }
      if ('+-*/%^()'.includes(s[i])) {
        result.push(s[i]);
        i++;
      } else if (s[i] >= '0' && s[i] <= '9' || s[i] === '.') {
        let num = '';
        while (i < s.length && (s[i] >= '0' && s[i] <= '9' || s[i] === '.')) {
          num += s[i];
          i++;
        }
        result.push(num);
      } else {
        throw new Error(`Unexpected character: ${s[i]}`);
      }
    }
    return result;
  }

  function parseExpr(): number {
    let result = parseTerm();
    while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
      const op = tokens[pos++];
      const right = parseTerm();
      result = op === '+' ? result + right : result - right;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parsePower();
    while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/' || tokens[pos] === '%')) {
      const op = tokens[pos++];
      const right = parsePower();
      if (op === '*') result *= right;
      else if (op === '/') result /= right;
      else result %= right;
    }
    return result;
  }

  function parsePower(): number {
    let result = parseUnary();
    if (pos < tokens.length && tokens[pos] === '^') {
      pos++;
      const right = parsePower(); // 右结合
      result = Math.pow(result, right);
    }
    return result;
  }

  function parseUnary(): number {
    if (pos < tokens.length && tokens[pos] === '-') {
      pos++;
      return -parseAtom();
    }
    if (pos < tokens.length && tokens[pos] === '+') {
      pos++;
    }
    return parseAtom();
  }

  function parseAtom(): number {
    if (pos < tokens.length && tokens[pos] === '(') {
      pos++; // skip (
      const result = parseExpr();
      if (pos >= tokens.length || tokens[pos] !== ')') {
        throw new Error('Missing closing parenthesis');
      }
      pos++; // skip )
      return result;
    }
    if (pos < tokens.length) {
      const num = parseFloat(tokens[pos++]);
      if (isNaN(num)) throw new Error(`Invalid number: ${tokens[pos - 1]}`);
      return num;
    }
    throw new Error('Unexpected end of expression');
  }

  const result = parseExpr();
  if (pos < tokens.length) {
    throw new Error(`Unexpected token: ${tokens[pos]}`);
  }
  return result;
}
