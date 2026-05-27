/**
 * Consciousness - 意识流事件类型
 *
 * 统一事件总线
 */

/**
 * 意识流事件基类
 */
export interface ConsciousnessEvent {
  id: string;
  timestamp: number;
  source: EventSource;
  type: EventType;
  data: unknown;
}

export type EventSource =
  | 'brainstem'
  | 'hippocampus'
  | 'cortex'
  | 'synapse'
  | 'sensory'
  | 'external'
  | 'persona'
  | 'agent'
  | 'cerebellum'
  | 'prefrontal';

export type EventType =
  // Brainstem 事件
  | 'loop.phase_change'
  | 'loop.perception_received'
  | 'loop.reasoning_complete'
  | 'loop.action_executed'
  | 'loop.reflection_complete'
  | 'loop.evolution_complete'
  | 'phase_change'
  | 'perception'
  | 'reasoning'
  // Hippocampus 事件
  | 'memory.episode_stored'
  | 'memory.semantic_created'
  | 'memory.associative_retrieval'
  | 'memory.consolidation_start'
  | 'memory.consolidation_complete'
  | 'memory.dreaming_start'
  | 'memory.dreaming_complete'
  | 'narrative.update'
  | 'narrative.auto-update'
  // Cortex 事件
  | 'evolution.mutation_generated'
  | 'evolution.skill_evolved'
  | 'evolution.fission'
  | 'evolution.fusion'
  | 'evolution.fitness_recorded'
  | 'evolution.auto'
  // Synapse 事件
  | 'synapse.message_sent'
  | 'synapse.message_received'
  | 'synapse.negotiation_initiated'
  | 'synapse.negotiation_complete'
  | 'synapse.cell_registered'
  | 'synapse.cell_unregistered'
  // Sensory 事件
  | 'sensory.input_received'
  | 'sensory.channel_connected'
  | 'sensory.channel_disconnected'
  // External 事件
  | 'external.user_message'
  | 'external.system_interrupt'
  | 'external.error'
  // Persona 事件 (认知增强)
  | 'emotion.update'
  | 'prediction.update'
  | 'proactive.suggestion'
  | 'proactive.reminder'
  | 'proactive.daily_summary'
  | 'proactive.idle_checkin'
  | 'proactive.milestone'
  // Agent 事件
  | 'error.pipeline'
  | 'health.degraded'
  | 'fact.learned'
  // Cerebellum 事件 (实验编排)
  | 'experiment.started'
  | 'experiment.checkpoint'
  | 'experiment.verified'
  | 'experiment.kept'
  | 'experiment.discarded'
  | 'experiment.surprise'
  | 'experiment.waypoint_complete'
  | 'experiment.stuck'
  | 'experiment.completed'
  | 'mission.created'
  | 'mission.paused'
  | 'mission.resumed'
  // Prefrontal 事件 (规划编排)
  | 'goal.created'
  | 'goal.completed';

/**
 * 轨迹记录
 */
export interface TrajectoryEntry {
  id: string;
  timestamp: number;
  eventId: string;
  phase: string;
  context: Record<string, unknown>;
}

/**
 * 轨迹片段
 */
export interface TrajectorySegment {
  id: string;
  startTime: number;
  endTime: number;
  entries: TrajectoryEntry[];
  outcome: 'success' | 'failure' | 'partial';
}

/**
 * 压缩后的轨迹
 */
export interface CompressedTrajectory {
  id: string;
  startTime: number;
  endTime: number;
  segments: number; // 原始片段数
  compressed: TrajectorySegment[];
  compressionRatio: number;
  keyInsights: string[];
}
