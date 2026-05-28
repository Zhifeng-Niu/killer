/**
 * @odysseus/core - Odysseus Agent Framework Core Kernel
 *
 * "The Brain That Never Stops"
 *
 * 核心内核包，提供：
 * - Brainstem: 主循环（感知→推理→行动→反思→演化）
 * - Hippocampus: 记忆引擎（超越 RAG 的类脑记忆）
 * - Cortex: 演化引擎（皮层柱的达尔文演化）
 * - Synapse: 皮层柱间投射协议（Column 间通信）
 * - Consciousness: 意识流（统一事件总线）
 * - Cerebellum: 小脑（实验编排与精调）
 * - Prefrontal: 前额叶（规划与决策）
 */

// Brainstem
export * from './brainstem/index.js';

// Hippocampus — re-export with alias to avoid DreamResult collision
export * from './hippocampus/types.js';
export * from './hippocampus/association.js';
export * from './hippocampus/forgetting.js';
export {
  HippocampusEngine,
  DEFAULT_MEMORY_CONFIG,
  HippocampusMemoryEngine,
  DEFAULT_SIMPLE_CONFIG,
} from './hippocampus/index.js';
export type {
  IMemoryEngine,
  MemoryConfig,
  DreamingResult as MemoryDreamingResult,
} from './hippocampus/memory.js';
export {
  DreamEngine,
  DEFAULT_DREAMING_CONFIG,
} from './hippocampus/dreaming.js';
export type { DreamResult, DreamingConfig } from './hippocampus/dreaming.js';

// Cortex
export * from './cortex/index.js';

// Synapse — 皮层柱间投射协议
export * from './synapse/types.js';
export {
  SynapseProtocol,
} from './synapse/synapse-protocol.js';
export type {
  ISynapseProtocol,
  ColumnStatus,
  NetworkTopology,
} from './synapse/protocol.js';

// Cerebellum
export * from './cerebellum/index.js';
export type {
  Column as SynapseColumn,
  ColumnConfig as SynapseColumnConfig,
  ColumnRuntimeStatus as SynapseColumnRuntimeStatus,
} from './synapse/synapse-protocol.js';

// Consciousness
export * from './consciousness/index.js';

// Prefrontal Cortex
export * from './prefrontal/types.js';
export * from './prefrontal/index.js';

// Storage
export * from './storage/index.js';
