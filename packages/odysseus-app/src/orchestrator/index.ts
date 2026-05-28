/**
 * Orchestrator - 编排器
 *
 * Agent 的中央协调器，整合所有模块
 */

export * from './types.js';
export * from './agent.js';
export { ColumnManager, type ColumnStatusReport } from './cells.js';
export { CommandHandler } from './commands.js';
export { TaskDelegate, type DelegationResult, type SubTask } from './task-delegate.js';
export { ToolPermissions, type PermissionLevel, type PermissionRule, type PermissionCheck } from './tool-permissions.js';
export { LifecycleHooks, type LifecycleEvent, type LifecycleHandler, type LifecycleSubscription } from './hooks.js';
export {
  MiddlewarePipeline,
  type Middleware,
  type MiddlewareContext,
  loggingMiddleware,
  metricsMiddleware,
  sanitizeMiddleware,
  rateLimitMiddleware,
} from './middleware.js';
export { ContextWindowManager, type ContextMessage, type ContextWindowConfig } from './context.js';
export * from './tools.js';
export * from './sensory-mapper.js';
export { buildSystemPrompt, type PromptBuilderDeps } from './prompt-builder.js';
export { triggerAutoDream, triggerAutoEvolve, AUTO_DREAM_INTERVAL, AUTO_EVOLVE_INTERVAL, type MinimalLogger } from './background-tasks.js';
export { loadPlugins, registerPlugin, unloadPlugin, type PluginLifecycleDeps } from './plugin-lifecycle.js';
export { executeToolCalls, DEFAULT_TOOL_TIMEOUT_MS, type ResponseProcessorDeps, type ToolChainResult } from './response-processor.js';
export { ColumnRuntime, ColumnRuntimePool, type CellExecutionResult, type ColumnRuntimeConfig } from './cell-runtime.js';
