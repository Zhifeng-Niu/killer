/**
 * Prefrontal Cortex - 结构化指令解析器
 *
 * 将自然语言多步骤指令解析为结构化执行计划。
 * 支持依赖提取、条件识别、优先级排序。
 */

// ─── 解析结果类型 ───

/** 指令步骤 */
export interface ParsedStep {
  id: string;
  description: string;
  suggestedTool?: string;
  suggestedParams?: Record<string, unknown>;
  dependsOn: string[];
  priority: number;
  parallelizable: boolean;
  condition?: string;
}

/** 解析后的指令 */
export interface ParsedInstruction {
  raw: string;
  goal: string;
  steps: ParsedStep[];
  constraints: string[];
  executionMode: 'sequential' | 'parallel' | 'mixed';
  /** 置信度评分 (0-1) */
  confidence: number;
  /** 检测到的歧义点 */
  ambiguities: Ambiguity[];
}

/** 歧义检测结果 */
export interface Ambiguity {
  /** 歧义文本 */
  text: string;
  /** 歧义类型 */
  type: 'vague_action' | 'unclear_target' | 'ambiguous_scope' | 'missing_context';
  /** 置信度影响 (0-1, 每个歧义降低多少) */
  impact: number;
  /** 建议的澄清 */
  suggestion: string;
}

/** 决策上下文 — 为执行引擎提供语义理解 */
export interface DecisionContext {
  /** 指令意图分类 */
  intent: 'create' | 'modify' | 'query' | 'delete' | 'analyze' | 'explore' | 'unknown';
  /** 目标实体 */
  target?: string;
  /** 涉及的文件/路径 */
  filePaths: string[];
  /** 风险评估提示 */
  riskHint: 'safe' | 'destructive' | 'irreversible' | 'external' | 'unknown';
  /** 是否需要用户确认 */
  needsConfirmation: boolean;
}

/** LLM 接口 */
interface ParserLLM {
  complete(prompt: string): Promise<{ content: string }>;
}

// ─── 规则模式 ───

interface RulePattern {
  pattern: RegExp;
  tool: string;
  paramsFn: (match: RegExpMatchArray) => Record<string, unknown>;
  parallelizable: boolean;
}

const TOOL_PATTERNS: RulePattern[] = [
  {
    pattern: /(?:read|open|show|cat|view|display)\s+(?:file\s+)?["']?([^\s"']+)["']?/i,
    tool: 'read_file',
    paramsFn: (m) => ({ path: m[1] }),
    parallelizable: true,
  },
  {
    pattern: /(?:write|save|create)\s+(?:file\s+)?["']?([^\s"']+)["']?\s*(?:with\s+content|containing|:)\s*["']?(.+?)["']?$/i,
    tool: 'write_file',
    paramsFn: (m) => ({ path: m[1], content: m[2] }),
    parallelizable: false,
  },
  {
    pattern: /(?:delete|remove)\s+(?:file\s+)?["']?([^\s"']+)["']?/i,
    tool: 'delete_file',
    paramsFn: (m) => ({ path: m[1] }),
    parallelizable: false,
  },
  {
    pattern: /(?:list|show)\s+(?:files?\s+)?(?:in\s+)?["']?([^\s"']+)["']?/i,
    tool: 'list_directory',
    paramsFn: (m) => ({ path: m[1] }),
    parallelizable: true,
  },
  {
    pattern: /(?:run cmd|shell|terminal|command)\s+["']?(.+?)["']?$/i,
    tool: 'execute_shell',
    paramsFn: (m) => ({ command: m[1] }),
    parallelizable: false,
  },
  {
    pattern: /(?:search|find|look\s+up)\s+(?:for\s+)?["'](.+?)["']/i,
    tool: 'web_search',
    paramsFn: (m) => ({ query: m[1] }),
    parallelizable: true,
  },
];

// ─── 指令解析器 ───

/**
 * 结构化指令解析器
 *
 * 两级解析策略：
 * 1. 规则匹配 — 零依赖，覆盖常见模式
 * 2. LLM 增强 — 处理复杂/模糊指令（可选）
 */
export class InstructionParser {
  private readonly llm?: ParserLLM;

  constructor(llm?: ParserLLM) {
    this.llm = llm;
  }

  /**
   * 解析指令文本
   */
  async parse(instruction: string): Promise<ParsedInstruction> {
    const normalized = instruction.trim();
    const ruleResult = this.parseWithRules(normalized);

    // 歧义检测
    const ambiguities = this.detectAmbiguities(normalized);
    const confidence = Math.max(0, 1 - ambiguities.reduce((sum, a) => sum + a.impact, 0));

    const result: ParsedInstruction = { ...ruleResult, confidence, ambiguities };

    if (ruleResult.steps.length >= 2) {
      return result;
    }

    if (this.llm) {
      const llmResult = await this.parseWithLLM(normalized, ruleResult);
      return { ...llmResult, confidence, ambiguities };
    }

    return result;
  }

  /**
   * 分析指令的决策上下文 — 为执行引擎提供语义理解
   */
  analyzeDecisionContext(instruction: string): DecisionContext {
    const lower = instruction.toLowerCase();

    // 意图分类
    const intentMap: Array<[RegExp, DecisionContext['intent']]> = [
      [/^(?:create|build|add|new|make|generate|init|write)\b/i, 'create'],
      [/^(?:modify|update|change|edit|fix|refactor|rename)\b/i, 'modify'],
      [/^(?:get|show|list|read|find|search|query|check|display)\b/i, 'query'],
      [/^(?:delete|remove|drop|clean|clear|purge)\b/i, 'delete'],
      [/^(?:analyze|review|audit|assess|evaluate|inspect)\b/i, 'analyze'],
      [/^(?:explore|investigate|discover|browse)\b/i, 'explore'],
    ];

    let intent: DecisionContext['intent'] = 'unknown';
    for (const [pattern, type] of intentMap) {
      if (pattern.test(instruction)) {
        intent = type;
        break;
      }
    }

    // 提取文件路径
    const filePaths: string[] = [];
    const pathPatterns = [
      /["']([\/.][^\s"']+)["']/g,
      /(?:file|path)\s+(?:at\s+)?["']?([\/.][^\s"']+)["']?/gi,
      /(?:in|to|from)\s+["']?([\/.][^\s"']+\.\w+)["']?/gi,
    ];
    for (const pattern of pathPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(instruction)) !== null) {
        filePaths.push(match[1]);
      }
    }

    // 风险评估
    let riskHint: DecisionContext['riskHint'] = 'unknown';
    if (/delete|remove|drop|purge|clean|clear/i.test(lower)) {
      riskHint = 'destructive';
    } else if (/force|overwrite|replace|irreversible/i.test(lower)) {
      riskHint = 'irreversible';
    } else if (/api|http|fetch|request|webhook|deploy|push/i.test(lower)) {
      riskHint = 'external';
    } else if (/read|list|show|find|search|get/i.test(lower)) {
      riskHint = 'safe';
    }

    // 是否需要用户确认
    const needsConfirmation = riskHint === 'destructive' || riskHint === 'irreversible';

    // 提取目标实体
    const targetMatch = instruction.match(
      /(?:the\s+)?(?:file|module|function|class|component|service|config|test)\s+["']?(\S+)["']?/i
    );

    return {
      intent,
      target: targetMatch?.[1],
      filePaths: [...new Set(filePaths)],
      riskHint,
      needsConfirmation,
    };
  }

  /**
   * 歧义检测 — 识别模糊、不明确的指令
   */
  private detectAmbiguities(text: string): Ambiguity[] {
    const ambiguities: Ambiguity[] = [];

    // 1. 模糊动作检测
    const vagueActions = [
      { pattern: /\b(?:handle|process|deal\s+with|take\s+care\s+of|manage)\b/i, action: 'vague_action' },
      { pattern: /\b(?:fix|improve|optimize|enhance|refactor)\b(?!.*\b(?:in|at|of|for)\b)/i, action: 'vague_action' },
    ];
    for (const { pattern } of vagueActions) {
      const match = text.match(pattern);
      if (match) {
        ambiguities.push({
          text: match[0],
          type: 'vague_action',
          impact: 0.2,
          suggestion: `Specify what "${match[0]}" means concretely — what should change and how?`,
        });
      }
    }

    // 2. 不明确目标检测
    if (/\b(?:it|this|that|these|those)\b/i.test(text) && !/\b(?:file|module|function|class)\b/i.test(text)) {
      ambiguities.push({
        text: text.match(/\b(?:it|this|that|these|those)\b/i)![0],
        type: 'unclear_target',
        impact: 0.25,
        suggestion: 'Replace pronouns with specific names (file, function, module)',
      });
    }

    // 3. 模糊范围检测
    if (/\b(?:everything|all|some|stuff|things|etc\.?)\b/i.test(text)) {
      ambiguities.push({
        text: text.match(/\b(?:everything|all|some|stuff|things|etc\.?)\b/i)![0],
        type: 'ambiguous_scope',
        impact: 0.15,
        suggestion: 'List specific items instead of using broad quantifiers',
      });
    }

    // 4. 缺失上下文检测
    if (text.length > 50 && !/\b(?:because|since|for|reason|why|context)\b/i.test(text)) {
      ambiguities.push({
        text: text.slice(0, 30) + '...',
        type: 'missing_context',
        impact: 0.05,
        suggestion: 'Consider adding motivation or context for better execution',
      });
    }

    return ambiguities;
  }

  /**
   * 规则解析（零依赖）
   */
  private parseWithRules(text: string): ParsedInstruction {
    const steps: ParsedStep[] = [];
    const constraints: string[] = [];
    let stepId = 0;

    const segments = text
      .split(/[.\n;]+/)
      .map(s => s.trim())
      .filter(s => s.length > 5);

    // 检测约束条件
    const constraintPatterns = [
      /(?:before|after|until|while|when|if|unless)\s+(.+)/gi,
      /(?:must|should|need to|have to)\s+(.+)/gi,
      /(?:within|under|no more than)\s+(\d+\s*\w+)/gi,
    ];

    for (const pattern of constraintPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        constraints.push(match[0]);
      }
    }

    const goal = this.extractGoal(text);
    const dependencyKeywords = ['then', 'after that', 'next', 'afterwards', 'following', 'once'];
    let hasSequentialDependency = false;

    for (const segment of segments) {
      const startsWithDep = dependencyKeywords.some(kw =>
        segment.toLowerCase().startsWith(kw),
      );
      if (startsWithDep) hasSequentialDependency = true;

      let matched = false;
      for (const pattern of TOOL_PATTERNS) {
        const match = segment.match(pattern.pattern);
        if (match) {
          steps.push({
            id: `step_${stepId++}`,
            description: segment,
            suggestedTool: pattern.tool,
            suggestedParams: pattern.paramsFn(match),
            dependsOn: hasSequentialDependency && steps.length > 0
              ? [steps[steps.length - 1].id]
              : [],
            priority: 1 - (steps.length * 0.1),
            parallelizable: pattern.parallelizable && !hasSequentialDependency,
          });
          matched = true;
          break;
        }
      }

      if (!matched) {
        steps.push({
          id: `step_${stepId++}`,
          description: segment,
          dependsOn: hasSequentialDependency && steps.length > 0
            ? [steps[steps.length - 1].id]
            : [],
          priority: 1 - (steps.length * 0.1),
          parallelizable: !hasSequentialDependency,
        });
      }

      hasSequentialDependency = false;
    }

    const parallelizableCount = steps.filter(s => s.parallelizable).length;
    const executionMode: 'sequential' | 'parallel' | 'mixed' =
      parallelizableCount === steps.length ? 'parallel'
        : parallelizableCount === 0 ? 'sequential'
          : 'mixed';

    return { raw: text, goal, steps, constraints, executionMode, confidence: 1, ambiguities: [] };
  }

  /**
   * LLM 增强解析
   */
  private async parseWithLLM(
    text: string,
    ruleResult: ParsedInstruction,
  ): Promise<ParsedInstruction> {
    if (!this.llm) return ruleResult;

    try {
      const prompt = `Parse this instruction into structured steps. Return JSON only.
Instruction: "${text}"
Format: { "goal": string, "steps": [{ "description": string, "tool": string|null, "params": object|null, "dependsOn": string[], "parallelizable": boolean }], "constraints": string[], "executionMode": "sequential"|"parallel"|"mixed" }`;

      const response = await this.llm.complete(prompt);
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return ruleResult;

      const parsed = JSON.parse(jsonMatch[0]);

      const steps: ParsedStep[] = (parsed.steps as Array<Record<string, unknown>>).map(
        (s, i) => ({
          id: `step_${i}`,
          description: String(s.description ?? ''),
          suggestedTool: s.tool ? String(s.tool) : undefined,
          suggestedParams: s.params as Record<string, unknown> | undefined,
          dependsOn: (s.dependsOn as string[]) ?? [],
          priority: 1 - (i * 0.1),
          parallelizable: Boolean(s.parallelizable),
        }),
      );

      return {
        raw: text,
        goal: parsed.goal ?? ruleResult.goal,
        steps,
        constraints: parsed.constraints ?? ruleResult.constraints,
        executionMode: parsed.executionMode ?? 'mixed',
        confidence: ruleResult.confidence,
        ambiguities: ruleResult.ambiguities,
      };
    } catch {
      return ruleResult;
    }
  }

  private extractGoal(text: string): string {
    const goalPatterns = [
      /^(?:please\s+)?(?:do|perform|build|create|complete|accomplish|完成|实现|构建)\s+(.{10,}?)(?:\.|$)/im,
      /^(?:I\s+(?:need|want)\s+(?:to\s+)?)?(.{10,}?)(?:\.|$)/im,
    ];

    for (const pattern of goalPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) return match[1].trim();
    }

    const firstSentence = text.split(/[.\n]/)[0];
    return firstSentence?.trim() ?? text.slice(0, 100);
  }
}
