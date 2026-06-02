/**
 * Consciousness - 意识模块
 *
 * 统一事件流：将各脑区的活动汇聚为连续的意识流
 */

// Types
export type {
  ConsciousnessEvent,
  EventSource,
  EventType,
  TrajectoryEntry,
  TrajectorySegment,
  CompressedTrajectory,
} from './types.js';

export type {
  EventPhase,
} from './consciousness-stream.js';

export type {
  IConsciousnessStream,
  StreamStatus,
} from './stream.js';

// Classes
export { ConsciousnessStream } from './consciousness-stream.js';
export { GlobalWorkspace } from './global-workspace.js';
export type {
  WorkspaceCoalition,
  WorkspaceModule,
  GlobalWorkspaceConfig,
} from './global-workspace.js';
export { BrainCoordinator } from './brain-coordinator.js';
export type {
  ModuleFeedbackHandler,
  BrainCoordinatorConfig,
  AttentionPreset,
} from './brain-coordinator.js';

// Self Monitor — execution health and stagnation detection
export {
  SelfMonitor,
  DEFAULT_SELF_MONITOR_CONFIG,
} from './self-monitor.js';
export type {
  HealthStatus,
  TimelineEntry,
  ResourceSnapshot,
  StagnationReport,
  HealthReport,
  SelfMonitorConfig,
} from './self-monitor.js';
