/**
 * Synapse — 皮层柱间投射模块
 *
 * 皮层柱（Column）间通信协议：消息传递、广播、协商、市场机制
 */

// Types
export type {
  Column,
  ColumnConfig,
  ColumnRuntimeStatus,
} from './synapse-protocol.js';

export type {
  ISynapseProtocol,
  ColumnStatus,
  NetworkTopology,
} from './protocol.js';

export type {
  SynapseMessage,
  MessageType,
  MessagePriority,
  NegotiationProposal,
  NegotiationType,
  NegotiationResult,
  MarketListing,
  MarketTransaction,
} from './types.js';

// Enums
export { ColumnRole } from './types.js';

// Interfaces with ColumnId
export type { ColumnId } from './types.js';

// Classes
export { SynapseProtocol } from './synapse-protocol.js';
