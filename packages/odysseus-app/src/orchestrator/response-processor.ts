/**
 * Response Processor
 *
 * 处理 LLM 响应中的工具调用。
 * 支持三种格式：
 * 1. Code block: ```tool\n{"tool":"name","params":{}}```
 * 2. Inline: [TOOL: name](params_json)
 * 3. DSML (DeepSeek): <｜｜DSML｜｜tool_calls>...</｜｜DSML｜｜tool_calls>
 */

import type { ToolExecutor } from '@odysseus/core';
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

export interface ExecutedToolCall {
  readonly tool: string;
  readonly params: unknown;
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
  /** 执行的完整工具调用（含参数，用于重复检测） */
  executedCalls: ExecutedToolCall[];
}

/**
 * 执行 LLM 响应中的所有工具调用
 */
export async function executeToolCalls(
  response: string,
  deps: ResponseProcessorDeps,
  onToken?: (token: string) => void,
): Promise<ToolChainResult> {
  const timeout = deps.toolTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  const calls = extractToolCalls(response);
  if (calls.length === 0) return { response, toolsExecuted: false, executedToolNames: [], executedCalls: [] };

  let result = response;
  const executedToolNames: string[] = [];
  const executedCalls: ExecutedToolCall[] = [];

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
      executedCalls.push({ tool: call.tool, params: call.params });
      onToken?.(`\n[Tool Result: ${call.tool}]\n${resultStr.slice(0, 200)}...\n`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const output = `\n[Tool Error: ${call.tool}] ${errMsg}\n`;
      result = result.replace(call.raw, output);
      onToken?.(output);
    }
  }

  // 清理残留的未解析 DSML 标记
  result = cleanDsmlRemnants(result);

  return { response: result, toolsExecuted: executedToolNames.length > 0, executedToolNames, executedCalls };
}

/**
 * 从响应文本中提取所有工具调用
 */
function extractToolCalls(response: string): Array<{ raw: string; tool: string; params: unknown }> {
  const calls: Array<{ raw: string; tool: string; params: unknown }> = [];
  const seen = new Set<string>();

  function addUnique(call: { raw: string; tool: string; params: unknown }) {
    const key = `${call.tool}:${JSON.stringify(call.params)}`;
    if (!seen.has(key)) {
      seen.add(key);
      calls.push(call);
    }
  }

  // 1. Code block 格式
  let match: RegExpExecArray | null;
  const blockPattern = /```tool\n([\s\S]*?)```/g;
  while ((match = blockPattern.exec(response)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.tool) {
        addUnique({ raw: match[0], tool: parsed.tool, params: parsed.params });
      }
    } catch {
      // JSON 解析失败，跳过
    }
  }

  // 2. Inline 格式
  const inlinePattern = /\[TOOL:\s*(\w+)\]\((.*?)\)/g;
  while ((match = inlinePattern.exec(response)) !== null) {
    try {
      const params = match[2] ? JSON.parse(match[2]) : undefined;
      addUnique({ raw: match[0], tool: match[1], params });
    } catch {
      // JSON 解析失败，跳过
    }
  }

  // 3. DSML 格式 (DeepSeek)
  extractDsmlCalls(response, calls, seen);

  return calls;
}

/**
 * DeepSeek DSML 工具调用解析
 *
 * 格式变体：
 * - Unicode pipes: <｜｜DSML｜｜tool_calls>
 * - ASCII pipes: <|DSML|tool_calls>
 * - Simple: <|tool_calls|>
 */
function extractDsmlCalls(
  response: string,
  calls: Array<{ raw: string; tool: string; params: unknown }>,
  seen: Set<string>,
): void {
  // 匹配 DSML tool_calls 块 — 兼容多种 pipe 变体
  const dsmlBlockPattern = /<[|｜]+DSML[|｜]+tool_calls[>］]>([\s\S]*?)<\/[|｜]+DSML[|｜]+tool_calls[>］]>/g;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = dsmlBlockPattern.exec(response)) !== null) {
    const block = blockMatch[1];

    // 提取每个 invoke
    const invokePattern = /<[|｜]+DSML[|｜]+invoke\s+name="(\w+)"[>］]>([\s\S]*?)<\/[|｜]+DSML[|｜]+invoke[>］]>/g;
    let invokeMatch: RegExpExecArray | null;

    while ((invokeMatch = invokePattern.exec(block)) !== null) {
      const toolName = invokeMatch[1];
      const paramBlock = invokeMatch[2];

      const params: Record<string, unknown> = {};
      const paramPattern = /<[|｜]+DSML[|｜]+parameter\s+name="(\w+)"(?:\s+(?:string="true"|type="string"))?[>］]>([\s\S]*?)<\/[|｜]+DSML[|｜]+parameter[>］]>/g;
      let paramMatch: RegExpExecArray | null;

      while ((paramMatch = paramPattern.exec(paramBlock)) !== null) {
        const paramName = paramMatch[1];
        let paramValue: unknown = paramMatch[2].trim();
        try {
          paramValue = JSON.parse(paramValue as string);
        } catch {
          // 保持字符串
        }
        params[paramName] = paramValue;
      }

      const key = `${toolName}:${JSON.stringify(params)}`;
      if (!seen.has(key)) {
        seen.add(key);
        calls.push({ raw: blockMatch[0], tool: toolName, params });
      }
    }
  }

  // 简化的 <|tool_calls|> JSON 格式
  const simpleBlockPattern = /<\|tool_calls\|>([\s\S]*?)<\/\|tool_calls\|>/g;
  while ((blockMatch = simpleBlockPattern.exec(response)) !== null) {
    try {
      const parsed = JSON.parse(blockMatch[1]);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item.function?.name) {
          const toolName = item.function.name;
          const params = typeof item.function.arguments === 'string'
            ? JSON.parse(item.function.arguments)
            : item.function.arguments ?? {};
          const key = `${toolName}:${JSON.stringify(params)}`;
          if (!seen.has(key)) {
            seen.add(key);
            calls.push({ raw: blockMatch[0], tool: toolName, params });
          }
        } else if (item.name) {
          const key = `${item.name}:${JSON.stringify(item.params ?? item.arguments)}`;
          if (!seen.has(key)) {
            seen.add(key);
            calls.push({ raw: blockMatch[0], tool: item.name, params: item.params ?? item.arguments });
          }
        }
      }
    } catch {
      // JSON 解析失败，跳过
    }
  }
}

/**
 * 清理残留的 DSML/工具调用标记
 */
function cleanDsmlRemnants(text: string): string {
  let cleaned = text;
  // 移除完整 DSML 块
  cleaned = cleaned.replace(/<[|｜]+DSML[|｜]+\w+[>］]>[\s\S]*?<\/[|｜]+DSML[|｜]+\w+[>］]>/g, '');
  // 移除独立 DSML 标记
  cleaned = cleaned.replace(/<[|｜]+DSML[|｜]+[^>］]*[>］]>/g, '');
  cleaned = cleaned.replace(/<\/[|｜]+DSML[|｜]+[^>］]*[>］]>/g, '');
  // 移除 <|tool_calls|> 残留
  cleaned = cleaned.replace(/<\|tool_calls\|>[\s\S]*?<\/\|tool_calls\|>/g, '');
  cleaned = cleaned.replace(/<\|\/?tool_calls\|>/g, '');
  // 移除 <|invoke|> 和 <|parameter|> 残留
  cleaned = cleaned.replace(/<\|(?:\/?invoke|\/?parameter)[^|]*\|>/g, '');
  // 移除 [tool_call:status] { JSON } 噪音块（LLM 文本中的冗余工具调用描述）
  cleaned = cleaned.replace(/\[tool_call:\w+\]\s*\{[^}]*\}/g, '');
  // 移除嵌套 JSON 版本（params 含子对象）
  cleaned = cleaned.replace(/\[tool_call:\w+\]\s*\{[\s\S]*?\n\}/g, '');
  return cleaned;
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
