/**
 * Response Processor
 *
 * 处理 LLM 响应中的工具调用（code block 格式和 inline 格式）。
 * 从 agent.ts 提取以减少职责耦合。
 */

import type { ToolExecutor } from '@killer/core';
import type { ToolPermissions } from './tool-permissions.js';
import type { MinimalLogger } from './background-tasks.js';

/** 工具调用超时（毫秒） */
export const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

/**
 * 响应处理依赖
 */
export interface ResponseProcessorDeps {
  readonly tools: ToolExecutor;
  readonly toolPermissions: ToolPermissions;
  readonly logger: MinimalLogger;
  readonly toolTimeoutMs?: number;
}

/**
 * 工具链执行结果
 */
export interface ToolChainResult {
  /** 替换后的响应文本 */
  response: string;
  /** 是否有任何工具被成功执行 */
  toolsExecuted: boolean;
  /** 执行的工具名列表 */
  executedToolNames: string[];
}

/**
 * 执行 LLM 响应中的所有工具调用
 *
 * 支持两种格式：
 * 1. Code block: ```tool\n{"tool":"name","params":{}}```
 * 2. Inline: [TOOL: name](params_json)
 *
 * 返回结构化结果（包含是否执行了工具，用于推理链判断）。
 */
export async function executeToolCalls(
  response: string,
  deps: ResponseProcessorDeps,
  onToken?: (token: string) => void,
): Promise<ToolChainResult> {
  const timeout = deps.toolTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  const calls = extractToolCalls(response);
  if (calls.length === 0) return { response, toolsExecuted: false, executedToolNames: [] };

  let result = response;
  const executedToolNames: string[] = [];

  for (const call of calls) {
    if (!deps.tools.has(call.tool)) continue;

    const permCheck = deps.toolPermissions.check(call.tool, call.params);
    if (!permCheck.allowed) {
      const msg = `\n[Tool Blocked: ${call.tool}] ${permCheck.reason ?? 'Permission denied'}\n`;
      result = result.replace(call.raw, msg);
      onToken?.(msg);
      continue;
    }

    try {
      const toolResult = await withTimeoutResult(
        deps.tools.execute(call.tool, call.params),
        timeout,
        call.tool,
      );
      const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
      const output = `\n[Tool Result: ${call.tool}]\n${resultStr}\n`;
      result = result.replace(call.raw, output);
      executedToolNames.push(call.tool);
      onToken?.(`\n[Tool Result: ${call.tool}]\n${resultStr.slice(0, 200)}...\n`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const output = `\n[Tool Error: ${call.tool}] ${errMsg}\n`;
      result = result.replace(call.raw, output);
      onToken?.(output);
    }
  }

  return { response: result, toolsExecuted: executedToolNames.length > 0, executedToolNames };
}

/**
 * 从响应文本中提取所有工具调用
 */
function extractToolCalls(response: string): Array<{ raw: string; tool: string; params: unknown }> {
  const calls: Array<{ raw: string; tool: string; params: unknown }> = [];

  // Code block 格式
  const blockPattern = /```tool\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(response)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.tool) {
        calls.push({ raw: match[0], tool: parsed.tool, params: parsed.params });
      }
    } catch {
      // JSON 解析失败，跳过
    }
  }

  // Inline 格式
  const inlinePattern = /\[TOOL:\s*(\w+)\]\((.*?)\)/g;
  while ((match = inlinePattern.exec(response)) !== null) {
    try {
      const params = match[2] ? JSON.parse(match[2]) : undefined;
      calls.push({ raw: match[0], tool: match[1], params });
    } catch {
      // JSON 解析失败，跳过
    }
  }

  return calls;
}

function withTimeoutResult<T>(
  promise: Promise<T>,
  ms: number,
  toolName: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Tool "${toolName}" timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}
