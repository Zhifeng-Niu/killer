/**
 * Brainstem - 脑干模块
 *
 * 永不停歇的认知循环：感知→推理→行动→反思→进化
 */

// Types
export type {
  Perception,
  PerceptionSource,
  PerceptionPriority,
  Reasoning,
  Action,
  ActionType,
  ActionStatus,
  Reflection,
  ReflectionOutcome,
  EmotionalImpact,
  SelfAssessment,
  BehavioralAdjustment,
  Evolution,
  EvolutionMutation,
  LoopState,
  LoopPhase,
} from './types.js';

export type {
  LLMCompletion,
  LLMProvider,
} from './llm.js';

export type {
  Tool,
  ToolResult,
} from './tool-executor.js';

export type {
  IBrainstemLoop,
  LoopEvent,
  LoopConfig,
} from './loop-interface.js';

// Classes
export { BrainstemLoop } from './loop-impl.js';
export { ToolExecutor } from './tool-executor.js';
export { MockLLMProvider, MockResponses } from './llm.js';

// Constants
export { DEFAULT_LOOP_CONFIG } from './loop-interface.js';

// Errors
export {
  KillerError,
  ValidationError,
  LLMError,
  APIError,
  ToolError,
  isKillerError,
} from './errors.js';

// Builtin tools
export {
  ReadFileTool,
  WriteFileTool,
  DeleteFileTool,
  ListDirectoryTool,
  ExecuteShellTool,
  MemoryStoreTool,
  MemoryRetrieveTool,
  MemoryListTool,
  MemoryClearTool,
  WebSearchTool,
  WebFetchTool,
  SynapseBroadcastTool,
  SendMessageTool,
  getBuiltinTools,
  createToolExecutor,
} from './builtin-tools.js';

// ToolForge — runtime capability extension
export {
  ToolForge,
  LearnTool,
  UnlearnTool,
  InspectToolsTool,
  SelfReflectTool,
  EssenceForge,
  EvolveEssenceTool,
  validateToolCode,
  validateToolName,
  TOOL_TEMPLATE,
} from './tool-forge.js';
export type {
  ForgedToolMeta,
  ForgeResult,
  PromptFragment,
} from './tool-forge.js';
