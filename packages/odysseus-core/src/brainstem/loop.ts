/**
 * Brainstem - 主循环
 *
 * 永不停止的决策主循环
 */

// 导出类型
export type {
  Perception,
  Reasoning,
  Action,
  Reflection,
  Evolution,
  LoopState,
  LoopPhase,
  PerceptionSource,
  PerceptionPriority,
  ActionType,
  ActionStatus,
  ReflectionOutcome,
  EvolutionMutation,
} from './types.js';

// 导出接口
export type {
  IBrainstemLoop,
  LoopConfig,
  LoopEvent,
} from './loop-interface.js';

export { DEFAULT_LOOP_CONFIG } from './loop-interface.js';

// 导出实现
export { BrainstemLoop } from './loop-impl.js';

// 导出 LLM Provider
export type { LLMProvider, LLMCompletion } from './llm.js';
export { MockLLMProvider, MockResponses } from './llm.js';

// 导出 Tool Executor
export type { Tool, ToolResult } from './tools.js';
export {
  ToolExecutor,
  ReadFileTool,
  MemoryStoreTool,
  SynapseBroadcastTool,
} from './tools.js';
