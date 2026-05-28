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

    if (ruleResult.steps.length >= 2) {
      return ruleResult;
    }

    if (this.llm) {
      return this.parseWithLLM(normalized, ruleResult);
    }

    return ruleResult;
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

    return { raw: text, goal, steps, constraints, executionMode };
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
