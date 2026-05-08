/**
 * Synapse - 突触模块
 *
 * Cell 间通信协议：消息传递、广播、协商、市场机制
 */

// Types
export type {
  Cell,
  CellConfig,
  CellRuntimeStatus,
} from './synapse-protocol.js';

export type {
  ISynapseProtocol,
  CellStatus,
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
export { CellType } from './types.js';

// Interfaces with CellId
export type { CellId } from './types.js';

// Classes
export { SynapseProtocol } from './synapse-protocol.js';
