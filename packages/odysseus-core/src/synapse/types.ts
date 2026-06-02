/**
 * Synapse — 皮层柱间投射协议核心类型
 *
 * 皮层柱（Column）间通信，基于 Thousand Brains Theory
 */

/**
 * 皮层柱角色 — 柱的功能特化
 */
export enum ColumnRole {
  Prime = 'prime',           // 主人格，Samantha 级伴侣
  Researcher = 'researcher', // 自主实验者
  Artisan = 'artisan',       // 代码/工具专家
  Negotiator = 'negotiator', // 多 Agent 协商
  Evolver = 'evolver',       // 元 Agent，负责演化
  Explorer = 'explorer',     // 跨域探索者，搜索灵感和模式
  Critic = 'critic',         // 评估者，审查实验结果的信号与噪声
}

/** @deprecated Use ColumnRole */
export type CellType = ColumnRole;

/**
 * 皮层柱标识
 */
export interface ColumnId {
  id: string;
  type: ColumnRole;
  instance: number;
}

/** @deprecated Use ColumnId */
export type CellId = ColumnId;

/**
 * 投射消息 — 皮层柱间的信号传递
 */
export interface SynapseMessage {
  id: string;
  from: ColumnId;
  to: ColumnId | ColumnId[];
  timestamp: number;
  type: MessageType;
  payload: unknown;
  priority: MessagePriority;
  ttl?: number; // 生存时间（跳数）
}

export type MessageType =
  | 'request'      // 请求
  | 'response'     // 响应
  | 'broadcast'    // 广播
  | 'negotiate'    // 协商
  | 'coordinate'   // 协调
  | 'heartbeat';   // 心跳

export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * 协商提议
 */
export interface NegotiationProposal {
  id: string;
  proposerId: ColumnId;
  targetId: ColumnId;
  type: NegotiationType;
  terms: Record<string, unknown>;
  deadline: number;
}

export type NegotiationType =
  | 'cooperation'  // 合作
  | 'competition'  // 竞争
  | 'trade'        // 交易
  | 'fusion';      // 融合提议

/**
 * 协商结果
 */
export interface NegotiationResult {
  proposalId: string;
  accepted: boolean;
  terms: Record<string, unknown>;
  reasoning?: string;
}

/**
 * 能力市场条目
 */
export interface MarketListing {
  id: string;
  providerId: ColumnId;
  skillId: string;
  price: number;
  availability: number; // [0, 1]
  rating: number; // [0, 1]
}

/**
 * 能力交易
 */
export interface MarketTransaction {
  id: string;
  listingId: string;
  buyerId: ColumnId;
  sellerId: ColumnId;
  price: number;
  timestamp: number;
  completed: boolean;
}
