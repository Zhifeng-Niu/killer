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
