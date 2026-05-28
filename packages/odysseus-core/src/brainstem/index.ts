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
  ToolProgress,
  ToolProgressCallback,
  BatchToolCall,
  BatchToolResult,
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

// Long Task Engine — persistent long-running task execution
export {
  LongTaskEngine,
  DEFAULT_TIME_BUDGET,
  UNLIMITED_BUDGET,
} from './long-task-engine.js';
export type {
  TaskCheckpoint,
  TaskStatus,
  TimeBudget,
  ProgressSnapshot,
  LongTaskEngineConfig,
} from './long-task-engine.js';

// Error Recovery — circuit breaker, backoff, fallback
export {
  CircuitBreaker,
  ExponentialBackoff,
  FallbackExecutor,
  ErrorRecoveryManager,
  CircuitOpenError,
  DEFAULT_CIRCUIT_CONFIG,
  DEFAULT_BACKOFF_CONFIG,
  DEFAULT_ERROR_RECOVERY_CONFIG,
} from './error-recovery.js';
export type {
  CircuitState,
  CircuitBreakerConfig,
  CircuitSnapshot,
  BackoffConfig,
  FallbackFn,
  ErrorRecoveryConfig,
} from './error-recovery.js';

// Tool Chain — multi-step tool orchestration
export { ToolChain } from './tool-chain.js';
export type {
  ChainStep,
  ToolStep,
  ParallelStep,
  BranchStep,
  LoopStep,
  TransformStep,
  ChainResult,
} from './tool-chain.js';

// Execution Context — cross-step state passing
export { ExecutionContext } from './execution-context.js';

// Scheduled Task Runner — timed and recurring task scheduling
export {
  ScheduledTaskRunner,
} from './scheduled-task-runner.js';
export type {
  ScheduledTask,
  OnceSchedule,
  RecurringSchedule,
  CronSchedule,
  TaskExecutionResult,
} from './scheduled-task-runner.js';
