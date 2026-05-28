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
  LLMToolCallCompletion,
  LLMProvider,
  ToolDefinition,
  ToolCall,
  ToolResultMessage,
  ChatMessage,
} from './llm.js';

export type {
  Tool,
  ToolResult,
} from './tool-executor.js';

export type {
  IBrainstemLoop,
  IDriveSource,
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
  OdysseusError,
  ValidationError,
  LLMError,
  APIError,
  ToolError,
  isOdysseusError,
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

// Self-modification — agent reads and modifies its own source code
export {
  SelfReadTool,
  SelfModifyTool,
  SelfListTool,
} from './self-modify-tools.js';
export type {
  SelfModifyDeps,
} from './self-modify-tools.js';

// Evolution tools — agent-facing self-evolution API
export {
  EvolveAuditTool,
  EvolveSelfTool,
  EvolveStatusTool,
  MutateSourceTool,
} from './evolution-tools.js';

// Self-Evolution — autonomous capability improvement loop
export {
  SelfEvolutionEngine,
} from './self-evolution-engine.js';
export type {
  EvolutionPhase,
  EvolutionStatus,
  EvolutionRecord,
  EvolutionTrigger,
  CapabilityGap,
  SelfEvolutionConfig,
  EvolutionResult,
  EvolutionLLM,
  SourceMutator,
} from './self-evolution-engine.js';

// Auto-mission — agent creates autonomous self-improvement missions
export {
  AutoMissionTool,
} from './auto-mission-tool.js';
export type {
  AutoMissionDeps,
} from './auto-mission-tool.js';
